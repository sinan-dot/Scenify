import { NextResponse } from 'next/server';
import { evaluateSpeechWithXunfei } from '@/lib/audio/xunfeiSpeechEvaluationService';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    console.log('[API][Xunfei] /api/evaluate-speech hit');
    const formData = await req.formData();
    const audio = formData.get('audio');
    const referenceText = formData.get('referenceText');
    const text = formData.get('text');

    if (!(audio instanceof File)) {
      console.error('[API][Xunfei] Missing audio file');
      return NextResponse.json({ error: 'Missing audio file.' }, { status: 400 });
    }

    const expectedText = typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : typeof referenceText === 'string' && referenceText.trim().length > 0
        ? referenceText.trim()
        : '';

    console.log('[API][Xunfei] Request payload summary', {
      audioType: audio.type,
      audioSize: audio.size,
      text,
      referenceText,
      expectedText,
    });

    if (!expectedText) {
      console.error('[API][Xunfei] Missing text/referenceText');
      return NextResponse.json({ error: 'Missing text or referenceText.' }, { status: 400 });
    }

    const result = await evaluateSpeechWithXunfei({
      audio: await audio.arrayBuffer(),
      referenceText: expectedText,
    });

    console.log('[API][Xunfei] Evaluation completed', {
      overallScore: result.overallScore,
      recognizedText: result.recognizedText,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API][Xunfei] Speech evaluation route error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Speech evaluation failed.',
      },
      { status: 500 },
    );
  }
}
