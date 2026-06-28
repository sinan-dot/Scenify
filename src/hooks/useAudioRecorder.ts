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
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
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
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

/** Linear-interpolation resample to 16 kHz mono. */
function resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[Math.min(idx + 1, input.length - 1)] ?? a;
    out[i] = a + frac * (b - a);
  }
  return out;
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
  const localStreamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const recognitionEndResolverRef = useRef<(() => void) | null>(null);
  const shouldKeepRecognitionAliveRef = useRef(false);
  const recognitionFatalRef = useRef(false);

  // Web Audio refs replacing MediaRecorder
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const isCapturingRef = useRef(false);

  const stopLocalMicTracks = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
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
      if (errorCode === 'network' || errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        recognitionFatalRef.current = true;
        try { recognition.abort(); } catch {}
      }
      setRecognitionState('error');
    };
    recognition.onend = () => {
      const resolver = recognitionEndResolverRef.current;
      recognitionEndResolverRef.current = null;
      resolver?.();
      if (!isRecordingRef.current) setRecognitionState('idle');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch {}
    };
  }, [language]);

  useEffect(() => {
    return () => {
      stopLocalMicTracks();
      audioContextRef.current?.close().catch(() => {});
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  const startRecording = async () => {
    if (isRecordingRef.current) return;

    isRecordingRef.current = true;
    isCapturingRef.current = true;
    shouldKeepRecognitionAliveRef.current = true;
    setIsRecording(true);
    setSpeechRecognitionError(null);
    setLiveTranscript('');
    setRecognitionState(isSpeechRecognitionSupported ? 'listening' : 'idle');
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    recognitionEndResolverRef.current = null;
    recognitionFatalRef.current = false;

    // Create and resume AudioContext synchronously within the user-gesture call stack.
    // Safari blocks resume() if called after any await — must happen here, before getUserMedia.
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor && !audioContextRef.current) {
      const ctx = new AudioContextCtor();
      audioContextRef.current = ctx;
      void ctx.resume();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
        video: false,
      });

      if (!isRecordingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No microphone audio track available.');
      }
      stream.getVideoTracks().forEach((t) => t.stop());

      const pureMicStream = new MediaStream(audioTracks);
      localStreamRef.current = pureMicStream;
      pcmChunksRef.current = [];

      const ctx = audioContextRef.current!;
      // Ensure resumed (e.g. context was created in unlockAudio and may still be suspended)
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(pureMicStream);
      sourceNodeRef.current = source;

      // ScriptProcessorNode: universally supported fallback (AudioWorklet needs separate file)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isCapturingRef.current) return;
        // Copy — the underlying buffer is reused by the browser
        pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      // Must be connected to destination for onaudioprocess to fire; output is silence (no writes)
      source.connect(processor);
      processor.connect(ctx.destination);

      try { recognitionRef.current?.start(); } catch (err) {
        console.warn('SpeechRecognition start failed:', err);
      }
    } catch (error) {
      console.warn('Microphone start failed:', error);
      isRecordingRef.current = false;
      isCapturingRef.current = false;
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;
    isCapturingRef.current = false;
    shouldKeepRecognitionAliveRef.current = false;
    setIsRecording(false);
    setRecognitionState('idle');

    try {
      const recognitionEndPromise = new Promise<void>((resolve) => {
        if (!recognitionRef.current) { resolve(); return; }
        let done = false;
        const finish = () => { if (done) return; done = true; recognitionEndResolverRef.current = null; resolve(); };
        recognitionEndResolverRef.current = finish;
        window.setTimeout(finish, 900);
      });

      try { recognitionRef.current?.stop(); } catch (err) {
        console.warn('SpeechRecognition stop failed:', err);
        recognitionEndResolverRef.current?.();
        recognitionEndResolverRef.current = null;
      }

      // Capture and clear Web Audio state before async work
      const ctx = audioContextRef.current;
      const chunks = pcmChunksRef.current;

      sourceNodeRef.current?.disconnect();
      processorRef.current?.disconnect();
      processorRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;
      pcmChunksRef.current = [];

      stopLocalMicTracks();

      // Assemble WAV from raw PCM asynchronously
      void (async () => {
        await recognitionEndPromise;

        const sampleRate = ctx?.sampleRate ?? 44100;
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const allPcm = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) { allPcm.set(chunk, offset); offset += chunk.length; }

        await ctx?.close().catch(() => {});

        const pcm16k = resampleTo16k(allPcm, sampleRate);

        // Guard: require at least 0.3 s of audio (4800 samples @ 16 kHz).
        // A shorter blob means the mic captured nothing useful — sending it would
        // waste iFlytek quota and trigger a fallback-to-DeepSeek on the backend.
        const MIN_SAMPLES = 4800;
        if (pcm16k.length < MIN_SAMPLES) {
          console.warn('[useAudioRecorder] Recording too short — skipping evaluation blob', { samples: pcm16k.length });
        }

        const wavBlob = new Blob([encodePcmWav(pcm16k, 16000)], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);
        const evaluationBlob = pcm16k.length >= MIN_SAMPLES ? wavBlob : null;

        const text = getBestTranscript(transcriptRef.current, interimTranscriptRef.current);
        const resolvedRecognitionError = speechRecognitionError && !NON_FATAL_RECOGNITION_ERRORS.has(speechRecognitionError)
          ? speechRecognitionError
          : null;

        window.setTimeout(() => {
          onRecorded({ text, audioUrl, audioBlob: wavBlob, evaluationBlob, speechRecognitionError: resolvedRecognitionError });
        }, releaseDelayMs);
      })();
    } catch (error) {
      console.warn('Microphone stop failed:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
      stopLocalMicTracks();
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
