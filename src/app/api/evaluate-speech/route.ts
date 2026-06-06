import { NextResponse } from 'next/server';
import { evaluateSpeechWithXunfei } from '@/lib/audio/xunfeiSpeechEvaluationService';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    const referenceText = formData.get('referenceText');

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file.' }, { status: 400 });
    }

    if (typeof referenceText !== 'string' || referenceText.trim().length === 0) {
      return NextResponse.json({ error: 'Missing referenceText.' }, { status: 400 });
    }

    const result = await evaluateSpeechWithXunfei({
      audio: await audio.arrayBuffer(),
      referenceText,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Xunfei speech evaluation route error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Speech evaluation failed.',
      },
      { status: 500 },
    );
  }
}
