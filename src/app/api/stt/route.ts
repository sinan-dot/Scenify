import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getAzureSttEndpoint(region: string, language: string) {
  const searchParams = new URLSearchParams({
    language,
    format: 'detailed',
  });

  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${searchParams.toString()}`;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    const language = typeof formData.get('language') === 'string'
      ? String(formData.get('language')).trim() || 'en-US'
      : 'en-US';

    if (!(audio instanceof File)) {
      return NextResponse.json({ text: '', provider: 'none', error: 'Missing audio file.' }, { status: 400 });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !region) {
      return NextResponse.json({
        text: '',
        provider: 'none',
        error: 'Server STT fallback is not configured.',
      }, { status: 503 });
    }

    const response = await fetch(getAzureSttEndpoint(region, language), {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': audio.type || 'audio/wav; codecs=audio/pcm; samplerate=16000',
        Accept: 'application/json;text/xml',
      },
      body: await audio.arrayBuffer(),
    });

    const payload = await response.json().catch(async () => ({
      error: await response.text(),
    }));

    if (!response.ok) {
      return NextResponse.json({
        text: '',
        provider: 'azure',
        error: typeof payload?.error === 'string' ? payload.error : `Azure STT failed: ${response.status}`,
      }, { status: response.status });
    }

    const text = typeof payload?.DisplayText === 'string'
      ? payload.DisplayText.trim()
      : typeof payload?.NBest?.[0]?.Display === 'string'
        ? payload.NBest[0].Display.trim()
        : '';

    return NextResponse.json({
      text,
      provider: 'azure',
    });
  } catch (error) {
    console.error('Server STT fallback error:', error);
    return NextResponse.json({
      text: '',
      provider: 'none',
      error: error instanceof Error ? error.message : 'STT fallback failed.',
    }, { status: 500 });
  }
}
