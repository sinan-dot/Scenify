"use client";

import { useRef, useState } from 'react';

export default function SpeechTestPage() {
  const [log, setLog] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  const push = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
    console.log(line);
    setLog((prev) => [...prev, line]);
  };

  const handleStart = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      push('SpeechRecognition NOT supported');
      return;
    }

    const r = new SR();
    recognitionRef.current = r;

    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;

    r.onstart        = (e: Event) => push(`onstart — ${JSON.stringify(e.type)}`);
    r.onaudiostart   = (e: Event) => push(`onaudiostart — ${JSON.stringify(e.type)}`);
    r.onsoundstart   = (e: Event) => push(`onsoundstart — ${JSON.stringify(e.type)}`);
    r.onspeechstart  = (e: Event) => push(`onspeechstart — ${JSON.stringify(e.type)}`);
    r.onresult       = (e: any)   => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((res: SpeechRecognitionResult) => res[0].transcript)
        .join(' ');
      push(`onresult — transcript: "${transcript}" | resultIndex: ${e.resultIndex} | results.length: ${e.results.length}`);
    };
    r.onnomatch      = (e: Event) => push(`onnomatch — ${JSON.stringify(e.type)}`);
    r.onspeechend    = (e: Event) => push(`onspeechend — ${JSON.stringify(e.type)}`);
    r.onsoundend     = (e: Event) => push(`onsoundend — ${JSON.stringify(e.type)}`);
    r.onaudioend     = (e: Event) => push(`onaudioend — ${JSON.stringify(e.type)}`);
    r.onend          = (e: Event) => push(`onend — ${JSON.stringify(e.type)}`);
    r.onerror        = (e: any)   => push(`onerror — error: ${e.error} | message: ${e.message ?? '(none)'} | full: ${JSON.stringify({ type: e.type, error: e.error, message: e.message })}`);

    push('calling recognition.start()');
    r.start();
  };

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '(SSR)';
  const hasSR = typeof window !== 'undefined' ? String(Boolean((window as any).SpeechRecognition)) : '?';
  const hasWSR = typeof window !== 'undefined' ? String(Boolean((window as any).webkitSpeechRecognition)) : '?';

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, maxWidth: 800 }}>
      <h2>SpeechRecognition Isolation Test</h2>

      <table style={{ borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
        <tbody>
          <tr><td style={td}>window.SpeechRecognition</td><td style={td}>{hasSR}</td></tr>
          <tr><td style={td}>window.webkitSpeechRecognition</td><td style={td}>{hasWSR}</td></tr>
          <tr><td style={td}>navigator.userAgent</td><td style={{ ...td, wordBreak: 'break-all' }}>{ua}</td></tr>
        </tbody>
      </table>

      <button onClick={handleStart} style={{ padding: '10px 24px', fontSize: 15, cursor: 'pointer', marginBottom: 20 }}>
        Start Speech Recognition
      </button>

      <pre style={{ background: '#0b1020', color: '#9ee493', padding: 14, borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
        {log.length ? log.join('\n') : '(no events yet — click the button)'}
      </pre>
    </div>
  );
}

const td: React.CSSProperties = { border: '1px solid #ccc', padding: '4px 10px' };
