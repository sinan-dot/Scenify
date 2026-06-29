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

    // ───────────── [诊断 第三步：讯飞返回] ─────────────
    console.log('📊 [Step 3 - 讯飞返回] HTTP Status: 200 (route success)');
    console.log('📊 [Step 3 - 讯飞返回] Response JSON:', JSON.stringify(result, null, 2));
    console.log('📊 [Step 3 - 讯飞返回] Error Code:', (result as any).code ?? '(none)');
    console.log('📊 [Step 3 - 讯飞返回] Error Message:', (result as any).error ?? (result as any).message ?? '(none)');
    console.log('📊 [Step 3 - 讯飞返回] overallScore:', result.overallScore);
    console.log('📊 [Step 3 - 讯飞返回] recognizedText:', result.recognizedText ?? '(empty)');

    console.log('[API][Xunfei] Evaluation completed', {
      overallScore: result.overallScore,
      recognizedText: result.recognizedText,
    });

    return NextResponse.json(result);
  } catch (error) {
    // ───────────── [诊断 第三步：讯飞返回 - 错误路径] ─────────────
    console.error('📊 [Step 3 - 讯飞返回] HTTP Status: 500 (route error)');
    console.error('📊 [Step 3 - 讯飞返回] Error Code:', (error as any)?.code ?? '(none)');
    console.error('📊 [Step 3 - 讯飞返回] Error Message:', error instanceof Error ? error.message : String(error));
    console.error('📊 [Step 3 - 讯飞返回] Full Error:', error);
    console.error('[API][Xunfei] Speech evaluation route error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Speech evaluation failed.',
      },
      { status: 500 },
    );
  }
}
