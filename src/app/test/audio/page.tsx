"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 浏览器录音诊断页面  /test/audio
//
// 目的: 在不引用任何业务逻辑 (游戏 / SpeechRecognition / 讯飞 / DeepSeek / NPC /
//       VAD / 状态机) 的前提下, 单独验证录音采集链路的每一层, 并以非专业用户也能
//       看懂的方式 (绿色 PASS / 红色 FAIL + 一句话诊断结论) 呈现结果。
//
// 链路: getUserMedia → AudioContext → ScriptProcessor → onaudioprocess →
//       PCM Buffer → resampleTo16k → WAV
//
// 录音采集算法与业务代码同款, 但本文件独立实现, 不 import 任何业务模块。
// 支持: 浏览器/版本/UA 自动检测、逐项 PASS/FAIL、自动诊断结论、导出 JSON 报告。
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';

// ── URL 模式判定 ─────────────────────────────────────────────────────────────
// ?mode=hook  → 直接挂载项目现有的 useAudioRecorder Hook (不接入任何游戏业务),
//               用于判断 Bug 在 Hook 内部还是游戏页面外围业务逻辑。
// 默认 (无参数) → 原独立诊断页 (本文件自带的录音实现, 不 import 业务模块)。
function readMode(): 'standalone' | 'hook' {
  if (typeof window === 'undefined') return 'standalone';
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'hook' ? 'hook' : 'standalone';
}

// ── 链路层定义 ───────────────────────────────────────────────────────────────
type LayerStatus = 'pending' | 'ok' | 'fail';

type LayerReport = {
  name: string;
  status: LayerStatus;
  detail: string;
  length?: number;       // 数据长度 (samples / bytes)
  durationMs?: number;   // 该层耗时或音频时长
  nextReceived?: boolean; // 下一层是否收到数据
};

const LAYER_NAMES = [
  'getUserMedia',
  'AudioContext',
  'ScriptProcessor',
  'onaudioprocess',
  'PCM Buffer',
  'resampleTo16k',
  'WAV',
] as const;

function emptyLayers(): LayerReport[] {
  return LAYER_NAMES.map((name) => ({ name, status: 'pending' as LayerStatus, detail: '—' }));
}

// ── 单项检查 (PASS / FAIL 卡片) ──────────────────────────────────────────────
type CheckStatus = 'pending' | 'pass' | 'fail' | 'warn';
type CheckItem = {
  key: string;
  label: string;
  status: CheckStatus;
  value: string;
};

// ── 浏览器检测 ───────────────────────────────────────────────────────────────
type BrowserInfo = {
  name: string;
  version: string;
  engine: string;
  userAgent: string;
  platform: string;
};

function detectBrowser(): BrowserInfo {
  if (typeof navigator === 'undefined') {
    return { name: 'unknown', version: '', engine: '', userAgent: '', platform: '' };
  }
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = '';
  let engine = 'Unknown';

  // 顺序很重要: Edge 含 "Chrome", Chrome 含 "Safari"
  if (/Edg\//.test(ua)) {
    name = 'Edge';
    version = ua.match(/Edg\/([\d.]+)/)?.[1] ?? '';
    engine = 'Chromium (Blink)';
  } else if (/OPR\//.test(ua) || /Opera/.test(ua)) {
    name = 'Opera';
    version = ua.match(/OPR\/([\d.]+)/)?.[1] ?? '';
    engine = 'Chromium (Blink)';
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    name = 'Chrome';
    version = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '';
    engine = 'Chromium (Blink)';
  } else if (/Firefox\//.test(ua)) {
    name = 'Firefox';
    version = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '';
    engine = 'Gecko';
  } else if (/Version\/[\d.]+.*Safari/.test(ua) || (/Safari/.test(ua) && /AppleWebKit/.test(ua))) {
    name = 'Safari';
    version = ua.match(/Version\/([\d.]+)/)?.[1] ?? '';
    engine = 'WebKit';
  }

  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    (navigator as unknown as { platform?: string }).platform ||
    '';

  return { name, version, engine, userAgent: ua, platform };
}

// ── 纯函数: 与业务代码同款算法, 但本文件独立实现, 不 import 任何业务模块 ──────────
function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodePcmWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
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

function maxAmplitude(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  return max;
}

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// ── 诊断引擎: 根据采集结果推断根因 ─────────────────────────────────────────────
const SILENCE_THRESHOLD = 0.001;

type Diagnosis = {
  status: 'ok' | 'fail';
  title: string;
  reason: string;
};

function diagnose(input: {
  gumOk: boolean;
  ctxState: string | null;
  ctxRunningThroughout: boolean;
  chunks: number;
  expectedChunks: number;
  rawSamples: number;
  rawMax: number;
  pcm16kSamples: number;
  pcm16kMax: number;
  wavBytes: number;
}): Diagnosis {
  const {
    gumOk, ctxState, ctxRunningThroughout, chunks, expectedChunks,
    rawSamples, rawMax, pcm16kSamples, pcm16kMax, wavBytes,
  } = input;

  if (!gumOk) {
    return { status: 'fail', title: '麦克风获取失败', reason: 'getUserMedia 未能返回音频轨道 — 麦克风权限被拒绝或无可用设备。' };
  }
  if (ctxState && ctxState !== 'running') {
    return { status: 'fail', title: 'AudioContext 被挂起', reason: `AudioContext 当前 state=${ctxState}, 未进入 running。常见于浏览器用户手势限制。` };
  }
  if (!ctxRunningThroughout) {
    return { status: 'fail', title: 'AudioContext 录音中被挂起', reason: '录音过程中 AudioContext 离开了 running 状态, 导致采集中断。' };
  }
  if (chunks === 0) {
    return { status: 'fail', title: 'ScriptProcessor 未触发 / 提前停止', reason: 'onaudioprocess 回调一次都没有触发 — ScriptProcessor 节点被浏览器休眠, 未采集到任何数据。' };
  }
  if (expectedChunks > 0 && chunks < expectedChunks * 0.3) {
    return { status: 'fail', title: 'ScriptProcessor 提前停止', reason: `预期约 ${expectedChunks} 帧, 实际仅 ${chunks} 帧 — 采集在录音结束前就停止了。` };
  }
  if (rawSamples === 0) {
    return { status: 'fail', title: 'PCM 缓冲为空', reason: '采集回调触发了, 但 PCM 缓冲长度为 0 — 未写入任何样本。' };
  }
  if (rawMax < SILENCE_THRESHOLD) {
    return { status: 'fail', title: 'PCM 全零 (纯静音)', reason: `原始 PCM 最大振幅 ${rawMax.toFixed(6)} 接近 0 — 麦克风采到的是死寂 (设备静音 / 节点被休眠 / 输入源无信号)。` };
  }
  if (rawMax >= SILENCE_THRESHOLD && pcm16kMax < SILENCE_THRESHOLD) {
    return { status: 'fail', title: '重采样异常', reason: `重采样前有信号 (maxAmp=${rawMax.toFixed(6)}), 重采样后却变成静音 (maxAmp=${pcm16kMax.toFixed(6)}) — resampleTo16k 把数据丢失了。` };
  }
  if (pcm16kSamples === 0) {
    return { status: 'fail', title: '重采样输出为空', reason: '重采样后样本数为 0 — 采样率换算异常。' };
  }
  if (wavBytes <= 44) {
    return { status: 'fail', title: 'WAV 封装为空', reason: 'WAV 仅含文件头无音频数据 — 上游 PCM 数据未到达封装层。' };
  }
  return { status: 'ok', title: '录音链路正常', reason: `全链路通过: 采集 ${chunks} 帧, ${rawSamples} 样本, 重采样至 ${pcm16kSamples} 样本, WAV ${wavBytes} 字节, 有效信号 (maxAmp=${pcm16kMax.toFixed(6)})。` };
}

// ── Hook 模式组件 (?mode=hook) ───────────────────────────────────────────────
// 直接挂载项目现有的 useAudioRecorder Hook, 不接入任何游戏业务 (BGM / 游戏状态 /
// NPC / 讯飞 / DeepSeek / 聊天全部关闭)。onRecorded 为 no-op。
// 目的: 判断 Bug 在 useAudioRecorder 内部, 还是游戏页面外围业务逻辑。
function HookAudioTest() {
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);
  const [lastPayload, setLastPayload] = useState<{
    text: string;
    audioUrl: string;
    audioBlobSize: number;
    evaluationBlobSize: number | null;
    speechRecognitionError: string | null;
    receivedAt: string;
  } | null>(null);

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  const {
    isRecording,
    startRecording,
    stopRecording,
    liveTranscript,
    recognitionState,
    speechRecognitionError,
    isSpeechRecognitionSupported,
  } = useAudioRecorder({
    language: 'en-US',
    onRecorded: (payload) => {
      // no-op: 不向任何后端发送, 仅在页面记录回调到达与 Blob 概况。
      // eslint-disable-next-line no-console
      console.log('[mode=hook] onRecorded (no-op):', {
        text: payload.text,
        audioBlobSize: payload.audioBlob?.size ?? null,
        evaluationBlobSize: payload.evaluationBlob?.size ?? null,
        speechRecognitionError: payload.speechRecognitionError,
      });
      setLastPayload({
        text: payload.text,
        audioUrl: payload.audioUrl,
        audioBlobSize: payload.audioBlob?.size ?? 0,
        evaluationBlobSize: payload.evaluationBlob?.size ?? null,
        speechRecognitionError: payload.speechRecognitionError,
        receivedAt: new Date().toISOString().slice(11, 23),
      });
    },
  });

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🎙️ 录音诊断 · Hook 模式</h1>
      <p style={S.sub}>
        本模式直接挂载项目现有的 <b>useAudioRecorder</b> Hook, <b>不接入任何游戏业务</b>
        (BGM / 游戏状态 / NPC / 讯飞 / DeepSeek / 聊天全部关闭)。onRecorded 为 no-op,
        不会向任何后端发送请求。用于判断 Bug 在 Hook 内部还是游戏页面外围业务逻辑。
        请打开浏览器控制台观察 Hook 自带的诊断日志 (PCM Chunk / onaudioprocess / VAD 等)。
      </p>

      {browser && (
        <div style={S.envBox}>
          <div style={S.envRow}><span style={S.envKey}>浏览器</span><span style={S.envVal}><b>{browser.name}</b> {browser.version} <span style={{ color: '#888' }}>({browser.engine})</span></span></div>
          <div style={S.envRow}><span style={S.envKey}>平台</span><span style={S.envVal}>{browser.platform || '未知'}</span></div>
          <div style={S.envRow}><span style={S.envKey}>User-Agent</span><span style={{ ...S.envVal, fontSize: 11, color: '#555', wordBreak: 'break-all' }}>{browser.userAgent}</span></div>
        </div>
      )}

      <div style={S.btnRow}>
        <button onClick={() => void startRecording()} disabled={isRecording} style={{ ...S.btn, ...S.btnStart, opacity: isRecording ? 0.5 : 1 }}>
          ● 开始录音 (Hook)
        </button>
        <button onClick={() => stopRecording()} disabled={!isRecording} style={{ ...S.btn, ...S.btnStop, opacity: !isRecording ? 0.5 : 1 }}>
          ■ 停止
        </button>
        {isRecording && <span style={S.rec}>● REC</span>}
      </div>

      <div style={S.envBox}>
        <div style={S.envRow}><span style={S.envKey}>isRecording</span><span style={S.envVal}>{String(isRecording)}</span></div>
        <div style={S.envRow}><span style={S.envKey}>recognitionState</span><span style={S.envVal}>{recognitionState}</span></div>
        <div style={S.envRow}><span style={S.envKey}>STT 支持</span><span style={S.envVal}>{String(isSpeechRecognitionSupported)}</span></div>
        <div style={S.envRow}><span style={S.envKey}>STT 错误</span><span style={S.envVal}>{speechRecognitionError ?? '—'}</span></div>
        <div style={S.envRow}><span style={S.envKey}>实时转写</span><span style={S.envVal}>{liveTranscript || '—'}</span></div>
      </div>

      {lastPayload && (
        <div style={S.envBox}>
          <div style={S.envRow}><span style={S.envKey}>onRecorded 到达</span><span style={S.envVal}>{lastPayload.receivedAt}</span></div>
          <div style={S.envRow}><span style={S.envKey}>text</span><span style={S.envVal}>{lastPayload.text || '—'}</span></div>
          <div style={S.envRow}><span style={S.envKey}>audioBlob</span><span style={S.envVal}>{lastPayload.audioBlobSize} bytes</span></div>
          <div style={S.envRow}><span style={S.envKey}>evaluationBlob</span><span style={S.envVal}>{lastPayload.evaluationBlobSize === null ? 'null (被静音网关拦截)' : `${lastPayload.evaluationBlobSize} bytes`}</span></div>
          <div style={S.envRow}><span style={S.envKey}>STT 错误</span><span style={S.envVal}>{lastPayload.speechRecognitionError ?? '—'}</span></div>
          {lastPayload.audioUrl && (
            <div style={S.envRow}><span style={S.envKey}>回放</span><span style={S.envVal}><audio src={lastPayload.audioUrl} controls /></span></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 组件 ────────────────────────────────────────────────────────────────────
function StandaloneAudioTest() {
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);
  const [layers, setLayers] = useState<LayerReport[]>(emptyLayers);
  const [isRecording, setIsRecording] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [wavPlayable, setWavPlayable] = useState<CheckStatus>('pending');
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [stats, setStats] = useState<{
    chunks: number;
    expectedChunks: number;
    rawSamples: number;
    rawRate: number;
    rawMax: number;
    rawRms: number;
    pcm16kSamples: number;
    pcm16kMax: number;
    pcm16kRms: number;
    durationSec: number;
    wavBytes: number;
    ctxStateStart: string;
    ctxStateEnd: string;
    ctxRunningThroughout: boolean;
  } | null>(null);

  // 录音运行时引用
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const capturingRef = useRef(false);
  const startTimeRef = useRef(0);
  const audioProcessCountRef = useRef(0);
  const ctxRunningThroughoutRef = useRef(true);
  const ctxStateSamplerRef = useRef<number | null>(null);

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  const pushLog = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
    // eslint-disable-next-line no-console
    console.log(line);
    setLog((prev) => [...prev, line]);
  };

  const setLayer = (name: (typeof LAYER_NAMES)[number], patch: Partial<LayerReport>) => {
    setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, ...patch } : l)));
  };

  const resetAll = () => {
    setLayers(emptyLayers());
    setLog([]);
    setStats(null);
    setChecks([]);
    setDiagnosis(null);
    setWavPlayable('pending');
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    setWavUrl(null);
    chunksRef.current = [];
    audioProcessCountRef.current = 0;
    ctxRunningThroughoutRef.current = true;
  };

  // ── 开始录音 ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (isRecording) return;
    resetAll();
    setIsRecording(true);
    capturingRef.current = true;
    audioProcessCountRef.current = 0;
    chunksRef.current = [];
    ctxRunningThroughoutRef.current = true;

    // 层 2: AudioContext —— 在用户手势同步段创建并 resume (Safari 兼容)
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setLayer('AudioContext', { status: 'fail', detail: 'window.AudioContext 不存在' });
      pushLog('❌ AudioContext 构造函数不存在');
      setIsRecording(false);
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioContextCtor();
      ctxRef.current = ctx;
      void ctx.resume();
      pushLog(`✅ AudioContext 创建, 初始 state=${ctx.state}, sampleRate=${ctx.sampleRate}`);
    } catch (err) {
      setLayer('AudioContext', { status: 'fail', detail: String(err) });
      pushLog(`❌ AudioContext 创建失败: ${String(err)}`);
      setIsRecording(false);
      return;
    }

    // 层 1: getUserMedia
    const t0 = performance.now();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
        video: false,
      });
      streamRef.current = stream;
      const tracks = stream.getAudioTracks();
      const t = tracks[0];
      setLayer('getUserMedia', {
        status: tracks.length > 0 ? 'ok' : 'fail',
        detail: t
          ? `track: ${t.label || '(no label)'} | readyState=${t.readyState} | enabled=${t.enabled} | muted=${t.muted}`
          : '无音频轨道',
        length: tracks.length,
        durationMs: Math.round(performance.now() - t0),
        nextReceived: true,
      });
      pushLog(
        `✅ getUserMedia 成功, audioTracks=${tracks.length}, readyState=${t?.readyState}, muted=${t?.muted}`,
      );
      if (tracks.length === 0) {
        pushLog('❌ 无音频轨道, 终止');
        setIsRecording(false);
        return;
      }
    } catch (err) {
      setLayer('getUserMedia', { status: 'fail', detail: String(err), durationMs: Math.round(performance.now() - t0) });
      pushLog(`❌ getUserMedia 失败: ${String(err)}`);
      setIsRecording(false);
      return;
    }

    // 层 2 续: resume 状态确认
    try {
      pushLog(`AudioContext state before resume: ${ctx.state}`);
      if (ctx.state === 'suspended') await ctx.resume();
      pushLog(`AudioContext state after resume: ${ctx.state}`);
      setLayer('AudioContext', {
        status: ctx.state === 'running' ? 'ok' : 'fail',
        detail: `state=${ctx.state}, sampleRate=${ctx.sampleRate}`,
        durationMs: 0,
        nextReceived: true,
      });
      if (ctx.state !== 'running') {
        ctxRunningThroughoutRef.current = false;
        pushLog(`⚠️ AudioContext 未能进入 running (当前 ${ctx.state}) — Edge 用户手势限制嫌疑`);
      }
    } catch (err) {
      setLayer('AudioContext', { status: 'fail', detail: `resume 抛出: ${String(err)}` });
      pushLog(`❌ AudioContext.resume() 抛出: ${String(err)}`);
      setIsRecording(false);
      return;
    }

    // 录音期间持续采样 AudioContext.state, 捕捉中途被挂起的情况
    if (ctxStateSamplerRef.current !== null) window.clearInterval(ctxStateSamplerRef.current);
    ctxStateSamplerRef.current = window.setInterval(() => {
      const c = ctxRef.current;
      if (c && c.state !== 'running' && c.state !== 'closed') {
        ctxRunningThroughoutRef.current = false;
        pushLog(`⚠️ 录音中 AudioContext 离开 running: state=${c.state}`);
      }
    }, 250);

    // 层 3: ScriptProcessor
    let source: MediaStreamAudioSourceNode;
    let processor: ScriptProcessorNode;
    let gain: GainNode;
    try {
      source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      gain = ctx.createGain();
      gain.gain.value = 0;
      gainRef.current = gain;
      setLayer('ScriptProcessor', {
        status: 'ok',
        detail: `bufferSize=${processor.bufferSize}, channels=1`,
        nextReceived: false,
      });
      pushLog(`✅ ScriptProcessor 创建, bufferSize=${processor.bufferSize}`);
    } catch (err) {
      setLayer('ScriptProcessor', { status: 'fail', detail: String(err) });
      pushLog(`❌ ScriptProcessor 创建失败: ${String(err)}`);
      setIsRecording(false);
      return;
    }

    // 层 4: onaudioprocess
    startTimeRef.current = performance.now();
    let firstChunkLogged = false;
    processor.onaudioprocess = (e) => {
      if (!capturingRef.current) return;
      const channelData = e.inputBuffer.getChannelData(0);
      audioProcessCountRef.current += 1;

      if (!firstChunkLogged) {
        firstChunkLogged = true;
        setLayer('onaudioprocess', {
          status: 'ok',
          detail: `首帧触发, samples/帧=${channelData.length}`,
          nextReceived: true,
        });
        setLayer('ScriptProcessor', { nextReceived: true });
        pushLog(`✅ onaudioprocess 首帧, samples=${channelData.length}, Sample[0]=${channelData[0]}`);
      }

      // 每 25 帧记一次实时统计 (~2.3s @44.1k/4096)
      if (audioProcessCountRef.current % 25 === 0) {
        const m = maxAmplitude(channelData);
        pushLog(`onaudioprocess #${audioProcessCountRef.current}, maxAmp=${m.toFixed(6)}`);
      }

      chunksRef.current.push(new Float32Array(channelData));
    };

    // 拓扑: Source → Processor → Gain(0) → Destination
    try {
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);
      pushLog('✅ Audio Graph 连接: Source → Processor → Gain(0) → Destination');
    } catch (err) {
      pushLog(`❌ Audio Graph 连接失败: ${String(err)}`);
      setIsRecording(false);
      return;
    }
  };

  // ── 停止录音 ───────────────────────────────────────────────────────────────
  const handleStop = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    capturingRef.current = false;

    if (ctxStateSamplerRef.current !== null) {
      window.clearInterval(ctxStateSamplerRef.current);
      ctxStateSamplerRef.current = null;
    }

    const ctx = ctxRef.current;
    const ctxStateStart = 'running';
    const ctxStateEnd = ctx?.state ?? 'unknown';
    const chunks = chunksRef.current;
    const elapsedMs = performance.now() - startTimeRef.current;

    // 断开节点
    try { sourceRef.current?.disconnect(); } catch {}
    try { processorRef.current?.disconnect(); } catch {}
    try { gainRef.current?.disconnect(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());

    pushLog(`停止录音. onaudioprocess 总帧数=${audioProcessCountRef.current}, 采集时长≈${(elapsedMs / 1000).toFixed(2)}s`);

    // 层 4 汇总: onaudioprocess
    if (audioProcessCountRef.current === 0) {
      setLayer('onaudioprocess', { status: 'fail', detail: 'onaudioprocess 从未触发 (节点被休眠)', nextReceived: false });
      pushLog('❌ onaudioprocess 从未触发 — ScriptProcessor 被浏览器休眠');
    }

    // 层 5: PCM Buffer (拼接)
    const sampleRate = ctx?.sampleRate ?? 44100;
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const allPcm = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) { allPcm.set(c, offset); offset += c.length; }
    const rawMax = maxAmplitude(allPcm);
    const rawRms = rms(allPcm);
    setLayer('PCM Buffer', {
      status: totalLength > 0 ? 'ok' : 'fail',
      detail: `chunks=${chunks.length}, samples=${totalLength}, maxAmp=${rawMax.toFixed(6)}, rms=${rawRms.toFixed(6)}`,
      length: totalLength,
      durationMs: Math.round((totalLength / sampleRate) * 1000),
      nextReceived: totalLength > 0,
    });
    pushLog(`PCM Buffer: chunks=${chunks.length}, samples=${totalLength}, maxAmp=${rawMax.toFixed(6)}, rms=${rawRms.toFixed(6)}`);

    // 层 6: resampleTo16k
    const pcm16k = resampleTo16k(allPcm, sampleRate);
    const r16Max = maxAmplitude(pcm16k);
    const r16Rms = rms(pcm16k);
    setLayer('resampleTo16k', {
      status: pcm16k.length > 0 ? 'ok' : 'fail',
      detail: `${sampleRate}Hz → 16000Hz, samples=${pcm16k.length}, maxAmp=${r16Max.toFixed(6)}, rms=${r16Rms.toFixed(6)}`,
      length: pcm16k.length,
      durationMs: Math.round((pcm16k.length / 16000) * 1000),
      nextReceived: pcm16k.length > 0,
    });
    pushLog(`resampleTo16k: samples=${pcm16k.length}, maxAmp=${r16Max.toFixed(6)}, rms=${r16Rms.toFixed(6)}`);

    // 层 7: WAV
    const wavBuffer = encodePcmWav(pcm16k, 16000);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(wavBlob);
    setWavUrl(url);
    setLayer('WAV', {
      status: wavBlob.size > 44 ? 'ok' : 'fail',
      detail: `${wavBlob.size} bytes (header 44 + data ${wavBlob.size - 44})`,
      length: wavBlob.size,
      durationMs: Math.round((pcm16k.length / 16000) * 1000),
    });
    pushLog(`WAV: ${wavBlob.size} bytes`);

    // WAV 可播放性验证: 用一个隐藏 audio 元素探测能否解码
    setWavPlayable('pending');
    try {
      const probe = new Audio();
      probe.src = url;
      const ok = await new Promise<boolean>((resolve) => {
        const done = (v: boolean) => resolve(v);
        probe.oncanplay = () => done(true);
        probe.onloadedmetadata = () => { if (Number.isFinite(probe.duration) && probe.duration > 0) done(true); };
        probe.onerror = () => done(false);
        window.setTimeout(() => done(wavBlob.size > 44), 1500);
      });
      setWavPlayable(ok ? 'pass' : 'fail');
      pushLog(`WAV 可播放性: ${ok ? '✅ 可播放' : '❌ 无法解码'}`);
    } catch {
      setWavPlayable(wavBlob.size > 44 ? 'pass' : 'fail');
    }

    // 预期帧数: 时长 / (bufferSize / sampleRate)
    const expectedChunks = Math.round((elapsedMs / 1000) / (4096 / sampleRate));
    const ctxRunningThroughout = ctxRunningThroughoutRef.current;

    const nextStats = {
      chunks: chunks.length,
      expectedChunks,
      rawSamples: totalLength,
      rawRate: sampleRate,
      rawMax,
      rawRms,
      pcm16kSamples: pcm16k.length,
      pcm16kMax: r16Max,
      pcm16kRms: r16Rms,
      durationSec: totalLength / sampleRate,
      wavBytes: wavBlob.size,
      ctxStateStart,
      ctxStateEnd,
      ctxRunningThroughout,
    };
    setStats(nextStats);

    // ── PASS / FAIL 检查项 ─────────────────────────────────────────────────
    const gumOk = streamRef.current !== null;
    const chunkRatioOk = expectedChunks > 0 ? chunks.length >= expectedChunks * 0.3 : chunks.length > 0;
    const nextChecks: CheckItem[] = [
      { key: 'getUserMedia', label: 'getUserMedia 获取麦克风', status: gumOk ? 'pass' : 'fail', value: gumOk ? '成功' : '失败' },
      {
        key: 'ctxState',
        label: 'AudioContext 状态',
        status: ctxStateEnd === 'running' || ctxStateEnd === 'closed' ? (ctxRunningThroughout ? 'pass' : 'fail') : 'fail',
        value: `start=${ctxStateStart} → end=${ctxStateEnd}${ctxRunningThroughout ? '' : ' (中途被挂起)'}`,
      },
      { key: 'sampleRate', label: '采样率 sampleRate', status: sampleRate > 0 ? 'pass' : 'fail', value: `${sampleRate} Hz` },
      {
        key: 'chunks',
        label: 'ScriptProcessor 持续回调 (Chunk 数)',
        status: chunks.length === 0 ? 'fail' : chunkRatioOk ? 'pass' : 'warn',
        value: `${chunks.length} 帧 (预期约 ${expectedChunks})`,
      },
      { key: 'allPcm', label: 'allPcm.length (重采样前)', status: totalLength > 0 ? 'pass' : 'fail', value: `${totalLength} 样本` },
      { key: 'pcm16k', label: 'pcm16k.length (重采样后)', status: pcm16k.length > 0 ? 'pass' : 'fail', value: `${pcm16k.length} 样本` },
      {
        key: 'maxAmp',
        label: 'maxAmp (最大振幅)',
        status: r16Max >= SILENCE_THRESHOLD ? 'pass' : 'fail',
        value: `${r16Max.toFixed(6)}${r16Max < SILENCE_THRESHOLD ? ' (疑似静音)' : ''}`,
      },
      {
        key: 'rms',
        label: 'RMS (均方根能量)',
        status: r16Rms >= SILENCE_THRESHOLD ? 'pass' : 'fail',
        value: `${r16Rms.toFixed(6)}`,
      },
    ];
    setChecks(nextChecks);

    // ── 自动诊断结论 ───────────────────────────────────────────────────────
    const verdict = diagnose({
      gumOk,
      ctxState: ctxStateEnd,
      ctxRunningThroughout,
      chunks: chunks.length,
      expectedChunks,
      rawSamples: totalLength,
      rawMax,
      pcm16kSamples: pcm16k.length,
      pcm16kMax: r16Max,
      wavBytes: wavBlob.size,
    });
    setDiagnosis(verdict);
    pushLog(`🔎 诊断结论: ${verdict.title} — ${verdict.reason}`);

    await ctx?.close().catch(() => {});
    ctxRef.current = null;
  };

  // ── 导出诊断报告 (JSON) ──────────────────────────────────────────────────────
  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      browser,
      diagnosis,
      checks,
      stats,
      layers,
      wavPlayable,
      log,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const tag = (browser?.name || 'browser').toLowerCase();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `audio-diagnostic-${tag}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushLog('📤 已导出诊断报告 JSON');
  };

  // 第一层失败定位 (链路图)
  const firstFailure = layers.find((l) => l.status === 'fail');
  const hasResult = stats !== null;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🎙️ 浏览器录音诊断</h1>
      <p style={S.sub}>
        独立诊断页 — 不引用游戏逻辑 / SpeechRecognition / 讯飞 / DeepSeek / NPC / VAD / 状态机。
        点击「开始录音」→ 正常说话 8~10 秒 → 点击「停止」, 即可得到逐项 PASS / FAIL 结果与一句话诊断结论。
        分别在 Safari 与 Edge 运行并导出 JSON, 即可直接对比。
      </p>

      {/* 环境信息 */}
      {browser && (
        <div style={S.envBox}>
          <div style={S.envRow}><span style={S.envKey}>浏览器</span><span style={S.envVal}><b>{browser.name}</b> {browser.version} <span style={{ color: '#888' }}>({browser.engine})</span></span></div>
          <div style={S.envRow}><span style={S.envKey}>平台</span><span style={S.envVal}>{browser.platform || '未知'}</span></div>
          <div style={S.envRow}><span style={S.envKey}>User-Agent</span><span style={{ ...S.envVal, fontSize: 11, color: '#555', wordBreak: 'break-all' }}>{browser.userAgent}</span></div>
        </div>
      )}

      <div style={S.btnRow}>
        <button onClick={() => void handleStart()} disabled={isRecording} style={{ ...S.btn, ...S.btnStart, opacity: isRecording ? 0.5 : 1 }}>
          ● 开始录音
        </button>
        <button onClick={() => void handleStop()} disabled={!isRecording} style={{ ...S.btn, ...S.btnStop, opacity: !isRecording ? 0.5 : 1 }}>
          ■ 停止
        </button>
        <button onClick={handleExport} disabled={!hasResult} style={{ ...S.btn, ...S.btnExport, opacity: hasResult ? 1 : 0.5 }}>
          ⬇ 导出诊断报告 (JSON)
        </button>
        {isRecording && <span style={S.rec}>● REC</span>}
      </div>

      {/* 诊断结论 (最显眼) */}
      {diagnosis && (
        <div style={{ ...S.diagBox, ...(diagnosis.status === 'ok' ? S.diagOk : S.diagFail) }}>
          <div style={S.diagTitle}>
            {diagnosis.status === 'ok' ? '🟢 ' : '🔴 '}诊断结论：{diagnosis.title}
          </div>
          <div style={S.diagReason}>{diagnosis.reason}</div>
        </div>
      )}

      {/* PASS / FAIL 检查项 */}
      {checks.length > 0 && (
        <>
          <h2 style={S.h2}>检查项</h2>
          <div style={S.checkGrid}>
            {checks.map((c) => (
              <div key={c.key} style={{ ...S.checkCard, ...checkCardStyle(c.status) }}>
                <div style={S.checkBadgeRow}>
                  <span style={{ ...S.badge, ...badgeStyle(c.status) }}>{badgeText(c.status)}</span>
                  <span style={S.checkLabel}>{c.label}</span>
                </div>
                <div style={S.checkValue}>{c.value}</div>
              </div>
            ))}
            {/* WAV 可播放性单独一项 */}
            <div style={{ ...S.checkCard, ...checkCardStyle(wavPlayable) }}>
              <div style={S.checkBadgeRow}>
                <span style={{ ...S.badge, ...badgeStyle(wavPlayable) }}>{badgeText(wavPlayable)}</span>
                <span style={S.checkLabel}>WAV 是否可播放</span>
              </div>
              <div style={S.checkValue}>{wavPlayable === 'pass' ? '可正常解码播放' : wavPlayable === 'fail' ? '无法解码' : '待测'}</div>
            </div>
          </div>
        </>
      )}

      {/* 链路图 (折叠在下方, 供进阶排查) */}
      <h2 style={S.h2}>链路图 (第一层失败即根因)</h2>
      <div style={S.pipeline}>
        {layers.map((l, i) => (
          <div key={l.name} style={S.layerWrap}>
            <div style={{ ...S.layer, ...statusStyle(l.status) }}>
              <div style={S.layerName}>
                {statusIcon(l.status)} {l.name}
              </div>
              <div style={S.layerDetail}>{l.detail}</div>
              <div style={S.layerMeta}>
                {l.length !== undefined && <span>len: {l.length}</span>}
                {l.durationMs !== undefined && <span>dur: {l.durationMs}ms</span>}
                {l.nextReceived !== undefined && (
                  <span style={{ color: l.nextReceived ? '#16a34a' : '#9ca3af' }}>
                    next: {l.nextReceived ? '✓' : '—'}
                  </span>
                )}
              </div>
            </div>
            {i < layers.length - 1 && <div style={S.arrow}>↓</div>}
          </div>
        ))}
      </div>

      {firstFailure ? (
        <div style={S.verdict}>
          🔴 第一层失败: <b>{firstFailure.name}</b> — {firstFailure.detail}
        </div>
      ) : layers.every((l) => l.status === 'ok') ? (
        <div style={{ ...S.verdict, background: '#dcfce7', color: '#166534' }}>
          🟢 全链路通过 — 录音采集正常
        </div>
      ) : null}

      {/* PCM 统计 */}
      {stats && (
        <>
          <h2 style={S.h2}>PCM 统计 (原始数据)</h2>
          <table style={S.table}>
            <tbody>
              <tr><td style={S.td}>采集帧数 (chunks)</td><td style={S.td}>{stats.chunks} / 预期 {stats.expectedChunks}</td></tr>
              <tr><td style={S.td}>原始采样率</td><td style={S.td}>{stats.rawRate} Hz</td></tr>
              <tr><td style={S.td}>原始样本数</td><td style={S.td}>{stats.rawSamples}</td></tr>
              <tr><td style={S.td}>原始 maxAmp</td><td style={{ ...S.td, color: stats.rawMax < SILENCE_THRESHOLD ? '#dc2626' : '#16a34a' }}>{stats.rawMax.toFixed(6)}</td></tr>
              <tr><td style={S.td}>原始 RMS</td><td style={S.td}>{stats.rawRms.toFixed(6)}</td></tr>
              <tr><td style={S.td}>16k 样本数</td><td style={S.td}>{stats.pcm16kSamples}</td></tr>
              <tr><td style={S.td}>16k maxAmp</td><td style={{ ...S.td, color: stats.pcm16kMax < SILENCE_THRESHOLD ? '#dc2626' : '#16a34a' }}>{stats.pcm16kMax.toFixed(6)}</td></tr>
              <tr><td style={S.td}>16k RMS</td><td style={S.td}>{stats.pcm16kRms.toFixed(6)}</td></tr>
              <tr><td style={S.td}>时长</td><td style={S.td}>{stats.durationSec.toFixed(2)} s</td></tr>
              <tr><td style={S.td}>WAV 字节</td><td style={S.td}>{stats.wavBytes}</td></tr>
              <tr><td style={S.td}>AudioContext 全程 running</td><td style={{ ...S.td, color: stats.ctxRunningThroughout ? '#16a34a' : '#dc2626' }}>{stats.ctxRunningThroughout ? '是' : '否 (中途被挂起)'}</td></tr>
            </tbody>
          </table>
        </>
      )}

      {/* WAV 播放 / 下载 */}
      {wavUrl && (
        <>
          <h2 style={S.h2}>WAV 播放 / 下载</h2>
          <audio controls src={wavUrl} style={{ width: '100%', marginBottom: 12 }} />
          <div>
            <a href={wavUrl} download="test-recording-16k.wav" style={S.download}>
              ⬇ 下载 WAV (16kHz mono)
            </a>
          </div>
        </>
      )}

      {/* 日志 */}
      <h2 style={S.h2}>运行日志 (开发者参考)</h2>
      <pre style={S.logBox}>{log.length ? log.join('\n') : '(尚无日志 — 点击开始录音)'}</pre>
    </div>
  );
}

// ── 样式 / 辅助 (内联, 不依赖任何外部 CSS / styled-components) ──────────────────
function statusIcon(s: LayerStatus) {
  return s === 'ok' ? '✅' : s === 'fail' ? '❌' : '⚪';
}
function statusStyle(s: LayerStatus): React.CSSProperties {
  if (s === 'ok') return { borderColor: '#16a34a', background: '#f0fdf4' };
  if (s === 'fail') return { borderColor: '#dc2626', background: '#fef2f2' };
  return { borderColor: '#d1d5db', background: '#f9fafb' };
}

function badgeText(s: CheckStatus) {
  return s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : s === 'warn' ? 'WARN' : '…';
}
function badgeStyle(s: CheckStatus): React.CSSProperties {
  if (s === 'pass') return { background: '#16a34a', color: '#fff' };
  if (s === 'fail') return { background: '#dc2626', color: '#fff' };
  if (s === 'warn') return { background: '#d97706', color: '#fff' };
  return { background: '#9ca3af', color: '#fff' };
}
function checkCardStyle(s: CheckStatus): React.CSSProperties {
  if (s === 'pass') return { borderColor: '#bbf7d0', background: '#f0fdf4' };
  if (s === 'fail') return { borderColor: '#fecaca', background: '#fef2f2' };
  if (s === 'warn') return { borderColor: '#fed7aa', background: '#fffbeb' };
  return { borderColor: '#e5e7eb', background: '#f9fafb' };
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111' },
  h1: { fontSize: 24, fontWeight: 800, marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: 700, margin: '28px 0 12px' },
  sub: { fontSize: 13, color: '#555', lineHeight: 1.6 },
  envBox: { marginTop: 16, padding: '12px 16px', borderRadius: 10, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 6 },
  envRow: { display: 'flex', gap: 12, fontSize: 13, alignItems: 'baseline' },
  envKey: { minWidth: 88, color: '#6b7280', fontWeight: 600, flexShrink: 0 },
  envVal: { color: '#111' },
  btnRow: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' },
  btn: { padding: '12px 24px', fontSize: 15, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer' },
  btnStart: { background: '#2563eb', color: '#fff' },
  btnStop: { background: '#dc2626', color: '#fff' },
  btnExport: { background: '#0f766e', color: '#fff' },
  rec: { color: '#dc2626', fontWeight: 800 },
  diagBox: { marginTop: 22, padding: '16px 20px', borderRadius: 12, border: '2px solid' },
  diagOk: { background: '#dcfce7', borderColor: '#16a34a' },
  diagFail: { background: '#fef2f2', borderColor: '#dc2626' },
  diagTitle: { fontSize: 18, fontWeight: 800, marginBottom: 6 },
  diagReason: { fontSize: 14, lineHeight: 1.6, color: '#333' },
  checkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  checkCard: { border: '1px solid', borderRadius: 10, padding: '10px 12px' },
  checkBadgeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: { fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.5 },
  checkLabel: { fontSize: 13, fontWeight: 600, color: '#222' },
  checkValue: { fontSize: 12, color: '#555', marginTop: 6, wordBreak: 'break-all' },
  pipeline: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
  layerWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  layer: { width: '100%', border: '2px solid', borderRadius: 10, padding: '10px 14px' },
  layerName: { fontWeight: 700, fontSize: 14 },
  layerDetail: { fontSize: 12, color: '#444', marginTop: 4, wordBreak: 'break-all' },
  layerMeta: { display: 'flex', gap: 14, fontSize: 11, color: '#666', marginTop: 6 },
  arrow: { fontSize: 18, color: '#9ca3af', lineHeight: 1, margin: '2px 0' },
  verdict: { marginTop: 16, padding: '12px 16px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 14, fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  td: { border: '1px solid #e5e7eb', padding: '6px 10px' },
  download: { display: 'inline-block', padding: '10px 18px', background: '#16a34a', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 },
  logBox: { background: '#0b1020', color: '#9ee493', padding: 14, borderRadius: 8, fontSize: 12, lineHeight: 1.55, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' },
};
