import { NextResponse } from 'next/server';
import { assessPronunciation } from '@/lib/audio/pronunciationAssessmentService';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    const referenceText = formData.get('referenceText');
    const language = formData.get('language');

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file.' }, { status: 400 });
    }

    if (!referenceText || typeof referenceText !== 'string') {
      return NextResponse.json({ error: 'Missing referenceText.' }, { status: 400 });
    }

    const result = await assessPronunciation({
      audio: await audio.arrayBuffer(),
      referenceText,
      contentType: audio.type,
      language: typeof language === 'string' ? language : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Pronunciation route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pronunciation assessment failed.' },
      { status: 500 },
    );
  }
}
