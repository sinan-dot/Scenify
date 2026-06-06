"use client";

import { useEffect, useRef, useState } from 'react';

type RecordedAudioPayload = {
  text: string;
  audioUrl: string;
  audioBlob: Blob;
  evaluationBlob: Blob;
};

type UseAudioRecorderOptions = {
  language?: string;
  releaseDelayMs?: number;
  onRecorded: (payload: RecordedAudioPayload) => void;
};

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

async function transcribeWithServer(audioBlob: Blob, language: string) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('language', language);

  const response = await fetch('/api/stt', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) return '';

  const data = await response.json();
  return typeof data.text === 'string' ? data.text.trim() : '';
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
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor || typeof OfflineAudioContext === 'undefined') {
    return audioBlob;
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
    return new Blob([encodePcmWav(renderedBuffer.getChannelData(0), sampleRate)], {
      type: 'audio/wav; codecs=audio/pcm; samplerate=16000',
    });
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
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const recognitionEndResolverRef = useRef<(() => void) | null>(null);

  const stopLocalMicTracks = () => {
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    localStreamRef.current = null;
  };

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
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
    };
    recognition.onerror = (event: any) => {
      console.warn('SpeechRecognition error:', event?.error || event);
    };
    recognition.onend = () => {
      recognitionEndResolverRef.current?.();
      recognitionEndResolverRef.current = null;
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
    setIsRecording(true);
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
    setIsRecording(false);

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
        let evaluationBlob = audioBlob;

        mediaRecorderRef.current = null;

        try {
          evaluationBlob = await convertTo16KhzMonoWav(audioBlob);
        } catch (error) {
          console.warn('16kHz WAV conversion failed, using original recording:', error);
        }

        if (!text) {
          try {
            text = await transcribeWithServer(audioBlob, language);
          } catch (error) {
            console.warn('Server STT fallback failed:', error);
          }
        }

        window.setTimeout(() => {
          onRecorded({
            text,
            audioUrl,
            audioBlob,
            evaluationBlob,
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
    startRecording,
    stopRecording,
  };
}
