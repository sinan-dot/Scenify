"use client";

import { useEffect, useRef, useState } from 'react';

type RecordedAudioPayload = {
  text: string;
  audioUrl: string;
  audioBlob: Blob;
  evaluationBlob: Blob | null;
  speechRecognitionError: string | null;
};

type UseAudioRecorderOptions = {
  language?: string;
  releaseDelayMs?: number;
  onRecorded: (payload: RecordedAudioPayload) => void;
};

const NON_FATAL_RECOGNITION_ERRORS = new Set([
  'no-speech',
  'aborted',
  'network',
  'audio-capture',
]);

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function getBestTranscript(finalTranscript: string, interimTranscript: string) {
  return `${finalTranscript} ${interimTranscript}`
    .replace(/\s+/g, ' ')
    .trim();
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodePcmWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

async function convertTo16KhzMonoWav(audioBlob: Blob) {
  console.log('[Recorder] Starting WAV conversion', {
    sourceType: audioBlob.type,
    sourceSize: audioBlob.size,
  });

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor || typeof OfflineAudioContext === 'undefined') {
    console.error('[Recorder] AudioContext or OfflineAudioContext unavailable for WAV conversion');
    return null;
  }

  const decodeContext = new AudioContextConstructor();
  try {
    const audioBuffer = await decodeContext.decodeAudioData(await audioBlob.arrayBuffer());
    const sampleRate = 16000;
    const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * sampleRate));
    const offlineContext = new OfflineAudioContext(1, frameCount, sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = new Blob([encodePcmWav(renderedBuffer.getChannelData(0), sampleRate)], {
      type: 'audio/wav; codecs=audio/pcm; samplerate=16000',
    });

    console.log('[Recorder] WAV conversion completed', {
      targetType: wavBlob.type,
      targetSize: wavBlob.size,
      sampleRate,
      channels: 1,
      bitsPerSample: 16,
    });

    return wavBlob;
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

export function useAudioRecorder({
  language = 'en-US',
  releaseDelayMs = 300,
  onRecorded,
}: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);
  const [speechRecognitionError, setSpeechRecognitionError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recognitionState, setRecognitionState] = useState<'idle' | 'listening' | 'restarting' | 'error'>('idle');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const recognitionEndResolverRef = useRef<(() => void) | null>(null);
  const shouldKeepRecognitionAliveRef = useRef(false);

  const stopLocalMicTracks = () => {
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    localStreamRef.current = null;
  };

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    setIsSpeechRecognitionSupported(Boolean(SpeechRecognition));
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) transcriptRef.current += `${finalTranscript} `;
      interimTranscriptRef.current = interimTranscript;
      setLiveTranscript(getBestTranscript(transcriptRef.current, interimTranscriptRef.current));
      if (finalTranscript || interimTranscript) {
        setSpeechRecognitionError(null);
        setRecognitionState('listening');
      }
    };
    recognition.onerror = (event: any) => {
      const errorCode = String(event?.error || 'unknown');
      console.warn('SpeechRecognition error:', errorCode);
      setSpeechRecognitionError(errorCode);
      setRecognitionState('error');
    };
    recognition.onend = () => {
      const resolver = recognitionEndResolverRef.current;
      recognitionEndResolverRef.current = null;
      resolver?.();

      if (shouldKeepRecognitionAliveRef.current && isRecordingRef.current) {
        setRecognitionState('restarting');
        try {
          recognition.start();
          setRecognitionState('listening');
        } catch (error) {
          console.warn('SpeechRecognition restart failed:', error);
          setRecognitionState('error');
        }
        return;
      }

      if (!isRecordingRef.current) {
        setRecognitionState('idle');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {}
    };
  }, [language]);

  useEffect(() => {
    return () => {
      stopLocalMicTracks();
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const startRecording = async () => {
    if (isRecordingRef.current) return;

    isRecordingRef.current = true;
    shouldKeepRecognitionAliveRef.current = true;
    setIsRecording(true);
    setSpeechRecognitionError(null);
    setLiveTranscript('');
    setRecognitionState(isSpeechRecognitionSupported ? 'listening' : 'idle');
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    recognitionEndResolverRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      if (!isRecordingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No microphone audio track available.');
      }

      stream.getVideoTracks().forEach((track) => track.stop());
      const pureMicStream = new MediaStream(audioTracks);
      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined;
      const recorder = preferredMimeType
        ? new MediaRecorder(pureMicStream, { mimeType: preferredMimeType })
        : new MediaRecorder(pureMicStream);

      localStreamRef.current = pureMicStream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.warn('MediaRecorder error:', event);
        stopLocalMicTracks();
        mediaRecorderRef.current = null;
      };

      recorder.start();
      try {
        recognitionRef.current?.start();
      } catch (error) {
        console.warn('SpeechRecognition start failed:', error);
      }
    } catch (error) {
      console.warn('Microphone start failed:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;
    shouldKeepRecognitionAliveRef.current = false;
    setIsRecording(false);
    setRecognitionState('idle');

    try {
      const recognitionEndPromise = new Promise<void>((resolve) => {
        if (!recognitionRef.current) {
          resolve();
          return;
        }

        let didResolve = false;
        const finish = () => {
          if (didResolve) return;
          didResolve = true;
          recognitionEndResolverRef.current = null;
          resolve();
        };

        recognitionEndResolverRef.current = finish;
        window.setTimeout(finish, 900);
      });

      try {
        recognitionRef.current?.stop();
      } catch (error) {
        console.warn('SpeechRecognition stop failed:', error);
        recognitionEndResolverRef.current?.();
        recognitionEndResolverRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        stopLocalMicTracks();
        return;
      }

      recorder.onstop = async () => {
        const audioType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: audioType });
        const audioUrl = URL.createObjectURL(audioBlob);
        await recognitionEndPromise;

        let text = getBestTranscript(transcriptRef.current, interimTranscriptRef.current);
        let evaluationBlob: Blob | null = null;

        mediaRecorderRef.current = null;

        try {
          evaluationBlob = await convertTo16KhzMonoWav(audioBlob);
        } catch (error) {
          console.warn('16kHz WAV conversion failed:', error);
        }

        const resolvedRecognitionError = speechRecognitionError && !NON_FATAL_RECOGNITION_ERRORS.has(speechRecognitionError)
          ? speechRecognitionError
          : null;

        window.setTimeout(() => {
          onRecorded({
            text,
            audioUrl,
            audioBlob,
            evaluationBlob,
            speechRecognitionError: resolvedRecognitionError,
          });
        }, releaseDelayMs);
      };

      if (recorder.state !== 'inactive') {
        recorder.requestData();
        recorder.stop();
      }
      stopLocalMicTracks();
    } catch (error) {
      console.warn('Microphone stop failed:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
      stopLocalMicTracks();
      mediaRecorderRef.current = null;
    }
  };

  return {
    isRecording,
    isSpeechRecognitionSupported,
    speechRecognitionError,
    liveTranscript,
    recognitionState,
    startRecording,
    stopRecording,
  };
}
