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

    // Fall back to a generic prompt when the frontend has no transcript (e.g. STT silent / network error)
    const expectedText =
      (typeof text === 'string' && text.trim()) ||
      (typeof referenceText === 'string' && referenceText.trim()) ||
      'Please read this sentence clearly.';

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
