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

/**
 * 纯诊断函数：打印一个 Float32Array 的统计信息。
 * 不修改任何数据，仅 console 输出。
 */
function debugDumpPcm(label: string, samples: Float32Array) {
  const length = samples.length;

  let maxAmp = 0;
  let sumSquares = 0;
  let allZero = true;
  const firstNonZero: Array<{ index: number; value: number }> = [];

  for (let i = 0; i < length; i++) {
    const v = samples[i];
    const abs = Math.abs(v);
    if (abs > maxAmp) maxAmp = abs;
    sumSquares += v * v;
    if (v !== 0) {
      allZero = false;
      if (firstNonZero.length < 10) {
        firstNonZero.push({ index: i, value: v });
      }
    }
  }

  const rms = length > 0 ? Math.sqrt(sumSquares / length) : 0;
  const first100 = Array.from(samples.slice(0, 100));

  console.log(`===== ${label} =====`);
  console.log('length:', length);
  console.log('maxAmp:', maxAmp);
  console.log('RMS:', rms);
  console.log('first100:', first100);
  console.log('allZero:', allZero);
  if (allZero) {
    console.log('Audio buffer is all zeros.');
    console.log('firstNonZero: (none)');
  } else {
    console.log('firstNonZero:', firstNonZero);
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
  const [isSttDegraded, setIsSttDegraded] = useState(false);
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
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    setIsSpeechRecognitionSupported(Boolean(SpeechRecognitionCtor));
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    console.log('[DIAG][SR] implementation', {
      hasSpeechRecognition: Boolean(window.SpeechRecognition),
      hasWebkitSpeechRecognition: Boolean(window.webkitSpeechRecognition),
      constructorName: recognition.constructor?.name ?? '(unknown)',
    });
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart       = () => console.log('[DIAG][SR] onstart');
    recognition.onaudiostart  = () => console.log('[DIAG][SR] onaudiostart');
    recognition.onsoundstart  = () => console.log('[DIAG][SR] onsoundstart');
    recognition.onspeechstart = () => console.log('[DIAG][SR] onspeechstart');
    recognition.onnomatch     = () => console.log('[DIAG][SR] onnomatch');
    recognition.onspeechend   = () => console.log('[DIAG][SR] onspeechend');
    recognition.onsoundend    = () => console.log('[DIAG][SR] onsoundend');
    recognition.onaudioend    = () => console.log('[DIAG][SR] onaudioend');
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        const isFinal = result.isFinal;
        console.log(`[DIAG][SR] onresult #${i}`, { transcript, confidence, isFinal, resultIndex: event.resultIndex });
        if (isFinal) {
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
      console.warn('[DIAG][SR] onerror', { error: event?.error, message: event?.message ?? '(none)', errorCode });
      console.warn('[SpeechRecognition] onerror:', errorCode, event?.message ?? '');

      // Fatal errors: permission denied — block everything
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        console.warn('[SpeechRecognition] Fatal error — aborting recognition');
        recognitionFatalRef.current = true;
        setSpeechRecognitionError(errorCode);
        setIsSttDegraded(false);
        try { recognition.abort(); } catch {}
        setRecognitionState('error');
        return;
      }

      // Non-fatal errors: STT unavailable but audio recording continues
      if (NON_FATAL_RECOGNITION_ERRORS.has(errorCode)) {
        console.warn(`[SpeechRecognition] Non-fatal error (${errorCode}) — STT degraded, audio recording continues`);
        setIsSttDegraded(true);
        setSpeechRecognitionError(null); // Don't block UI with error message
        // Keep recognitionState as 'listening' or current state — don't set to 'error'
        return;
      }

      // Unknown error: log but don't abort (cautious fallback)
      console.error('[SpeechRecognition] Unknown error:', errorCode);
      setSpeechRecognitionError(errorCode);
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
    setIsSttDegraded(false);
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
      console.log('[Web Audio Init] AudioContext state before resume:', ctx.state);
      if (ctx.state === 'suspended') await ctx.resume();
      console.log('[Web Audio Init] AudioContext state after resume:', ctx.state);
      console.log('[Web Audio Init] AudioContext sampleRate:', ctx.sampleRate);

      const source = ctx.createMediaStreamSource(pureMicStream);
      sourceNodeRef.current = source;
      console.log('[Web Audio Init] MediaStreamSource created:', source.constructor.name);

      // ScriptProcessorNode: universally supported fallback (AudioWorklet needs separate file)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      console.log('[Web Audio Init] ScriptProcessorNode created, bufferSize:', processor.bufferSize);

      // Track whether onaudioprocess is firing
      let audioProcessCallCount = 0;
      let firstSampleLogged = false;

      processor.onaudioprocess = (e) => {
        if (!isCapturingRef.current) return;

        audioProcessCallCount++;

        // Log first few callbacks to confirm it's firing
        if (audioProcessCallCount <= 3) {
          const channelData = e.inputBuffer.getChannelData(0);
          console.log(`[onaudioprocess #${audioProcessCallCount}] Fired, samples: ${channelData.length}, Sample[0]: ${channelData[0]}, Sample[100]: ${channelData[100]}, Sample[1000]: ${channelData[1000]}`);
        }

        // Log first non-zero sample to confirm real audio
        if (!firstSampleLogged) {
          const channelData = e.inputBuffer.getChannelData(0);
          let maxAbs = 0;
          let maxIndex = 0;
          for (let i = 0; i < channelData.length; i++) {
            const abs = Math.abs(channelData[i]);
            if (abs > maxAbs) {
              maxAbs = abs;
              maxIndex = i;
            }
          }
          if (maxAbs > 0.001) {
            console.log(`[onaudioprocess] First significant audio detected! Max amplitude: ${maxAbs.toFixed(6)} at index ${maxIndex}`);
            firstSampleLogged = true;
          }
        }

        // Copy — the underlying buffer is reused by the browser
        const chunkCopy = new Float32Array(e.inputBuffer.getChannelData(0));
        pcmChunksRef.current.push(chunkCopy);

        // ───────────── [诊断] 每个 PCM Chunk 的统计 ─────────────
        {
          let chunkMaxAmp = 0;
          let chunkSumSquares = 0;
          for (let i = 0; i < chunkCopy.length; i++) {
            const v = chunkCopy[i];
            const abs = Math.abs(v);
            if (abs > chunkMaxAmp) chunkMaxAmp = abs;
            chunkSumSquares += v * v;
          }
          const chunkRms = chunkCopy.length > 0 ? Math.sqrt(chunkSumSquares / chunkCopy.length) : 0;
          console.log(`[PCM Chunk #${pcmChunksRef.current.length}]`);
          console.log('length:', chunkCopy.length);
          console.log('maxAmp:', chunkMaxAmp);
          console.log('RMS:', chunkRms);
        }
      };

      // Chromium: a ScriptProcessorNode that is disconnected from or directly connected
      // to destination may be suspended by the browser, yielding all-zero PCM.
      // Insert a zero-gain GainNode to keep the graph "alive" while outputting silence.
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      console.log('[Web Audio Init] GainNode created, gain.value:', silentGain.gain.value);

      source.connect(processor);
      console.log('[Web Audio Init] ✓ source.connect(processor)');

      processor.connect(silentGain);
      console.log('[Web Audio Init] ✓ processor.connect(silentGain)');

      silentGain.connect(ctx.destination);
      console.log('[Web Audio Init] ✓ silentGain.connect(ctx.destination)');
      console.log('[Web Audio Init] Audio graph complete: Source → Processor → GainNode(0) → Destination');

      // Verify connections
      console.log('[Web Audio Init] Source numberOfOutputs:', source.numberOfOutputs);
      console.log('[Web Audio Init] Processor numberOfInputs:', processor.numberOfInputs, 'numberOfOutputs:', processor.numberOfOutputs);
      console.log('[Web Audio Init] GainNode numberOfInputs:', silentGain.numberOfInputs, 'numberOfOutputs:', silentGain.numberOfOutputs);

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
    // ───────────── [诊断] 谁调用了 stopRecording (增强版, 仅打印) ─────────────
    try {
      const tracks = localStreamRef.current?.getAudioTracks?.() ?? [];
      console.group('🛑 [stopRecording] called');
      console.log('当前时间 (timeStamp):', performance.now(), '| ISO:', new Date().toISOString());
      console.log('调用来源 / 事件类型 (event?.type):',
        (typeof window !== 'undefined' && (window.event as Event | undefined)?.type) ?? '(no window.event)');
      console.log('当前 isRecording (ref):', isRecordingRef.current);
      console.log('当前 isCapturing (ref):', isCapturingRef.current);
      console.log('当前 recognitionState:', recognitionState);
      console.log('当前 shouldKeepRecognitionAlive:', shouldKeepRecognitionAliveRef.current);
      console.log('当前 recognitionFatal:', recognitionFatalRef.current);
      console.log('MediaStreamTrack count:', tracks.length);
      tracks.forEach((t, i) => {
        console.log(`  track[${i}] readyState:`, t.readyState, '| enabled:', t.enabled, '| muted:', t.muted, '| label:', t.label);
      });
      console.log('AudioContext.state:', audioContextRef.current?.state ?? '(no audioContext)');
      console.trace('[stopRecording] full call stack');
      console.groupEnd();
    } catch (diagErr) {
      console.warn('[stopRecording] diagnostic logging failed (non-fatal):', diagErr);
    }

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

        console.log('[stopRecording] Starting PCM assembly...');
        console.log('[stopRecording] Captured chunks:', chunks.length);

        // ───────────── [诊断] 总共采集了多少个 Chunk ─────────────
        console.log('===== PCM Chunks =====');
        console.log('Total PCM Chunks:', chunks.length);

        const sampleRate = ctx?.sampleRate ?? 44100;
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        console.log('[stopRecording] Total PCM samples (original rate):', totalLength, 'at', sampleRate, 'Hz');

        const allPcm = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) { allPcm.set(chunk, offset); offset += chunk.length; }

        // Log first and last samples to verify PCM data
        if (allPcm.length > 0) {
          console.log('[stopRecording] PCM sample statistics:');
          console.log('  - First 10 samples:', Array.from(allPcm.slice(0, 10)).map(v => v.toFixed(6)));
          console.log('  - Last 10 samples:', Array.from(allPcm.slice(-10)).map(v => v.toFixed(6)));

          // Calculate amplitude statistics
          let max = 0, min = 0, sum = 0;
          for (let i = 0; i < allPcm.length; i++) {
            const val = allPcm[i];
            if (val > max) max = val;
            if (val < min) min = val;
            sum += Math.abs(val);
          }
          const avgAmplitude = sum / allPcm.length;
          console.log('  - Max amplitude:', max.toFixed(6));
          console.log('  - Min amplitude:', min.toFixed(6));
          console.log('  - Avg absolute amplitude:', avgAmplitude.toFixed(6));
        }

        await ctx?.close().catch(() => {});

        // ───────────── [诊断] 打印 allPcm（重采样前，原始采样率） ─────────────
        debugDumpPcm('allPcm', allPcm);

        const pcm16k = resampleTo16k(allPcm, sampleRate);
        console.log('[stopRecording] Resampled to 16kHz:', pcm16k.length, 'samples');

        // ───────────── [诊断] 打印 pcm16k（重采样后，16kHz） ─────────────
        debugDumpPcm('pcm16k', pcm16k);

        // ══════════════════════════════════════════════════════════════════
        // 🎤 VAD (Voice Activity Detection) 强制拦截器
        // 在生成 WAV / 触发 onRecorded 之前，对 PCM 数据进行验尸。
        // 检测到纯静音时直接 return，绝对不调用 onRecorded → 从源头阻断 API 请求。
        // ══════════════════════════════════════════════════════════════════
        const pcmData = pcm16k;

        // 1. 计算最大振幅
        let maxAmp = 0;
        for (let i = 0; i < pcmData.length; i++) {
          const absValue = Math.abs(pcmData[i]);
          if (absValue > maxAmp) maxAmp = absValue;
        }

        // 2. 打印关键日志
        console.log(`🎤 [Audio VAD] 录音最大振幅 (Max Amplitude): ${maxAmp}`);

        // 3. 最短时长检查（防止误触发空录音）
        const MIN_SAMPLES = 4800; // 0.3s @ 16 kHz
        if (pcmData.length < MIN_SAMPLES) {
          console.error('🚫 [Audio VAD] 录音时长过短！已强制拦截 API 请求，防止额度浪费。');
          if (typeof window !== 'undefined') {
            window.alert('录音时间太短，请按住按钮说完整一句话后再松开。API 请求已拦截。');
          }
          // 强制终止，绝不调用 onRecorded
          return;
        }

        // 4. 严格静音拦截（阈值 0.01）
        if (maxAmp < 0.01) {
          console.error('🚫 [Audio VAD] 检测到极低音量或纯静音！已强制拦截 API 请求，防止额度浪费。');
          // 在前端弹窗提示用户
          if (typeof window !== 'undefined') {
            window.alert('未能检测到有效声音。如果您使用的是 Edge 浏览器，请检查麦克风权限，或尝试大声说话。API 请求已拦截。');
          }
          // 强制终止函数执行，绝对不准调用 onRecorded → 不会触发任何 fetch
          return;
        }

        console.log('🎤 [Audio VAD] ✅ 检测到有效声音，准备发送评测请求');

        const wavBlob = new Blob([encodePcmWav(pcm16k, 16000)], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);

        // ───────────── [诊断 第一步：录音结束] ─────────────
        const durationSeconds = pcm16k.length / 16000;
        console.log('📦 [Step 1 - 录音结束] Blob Size:', wavBlob.size, 'bytes');
        console.log('📦 [Step 1 - 录音结束] Blob Type:', wavBlob.type);
        console.log('📦 [Step 1 - 录音结束] Duration:', durationSeconds.toFixed(3), 'seconds');

        const text = getBestTranscript(transcriptRef.current, interimTranscriptRef.current);
        const resolvedRecognitionError = speechRecognitionError && !NON_FATAL_RECOGNITION_ERRORS.has(speechRecognitionError)
          ? speechRecognitionError
          : null;

        window.setTimeout(() => {
          onRecorded({ text, audioUrl, audioBlob: wavBlob, evaluationBlob: wavBlob, speechRecognitionError: resolvedRecognitionError });
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
    isSttDegraded,
    liveTranscript,
    recognitionState,
    startRecording,
    stopRecording,
  };
}
