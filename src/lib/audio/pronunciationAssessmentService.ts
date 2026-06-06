export type PronunciationDimension = {
  key: 'accuracy' | 'fluency' | 'prosody' | 'completeness';
  label: string;
  score: number | null;
};

export type PronunciationAssessmentResult = {
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  completeness: number | null;
  scores: {
    accuracy: number | null;
    fluency: number | null;
    prosody: number | null;
    completeness: number | null;
  };
  dimensions: PronunciationDimension[];
  suggestions: string[];
  recognizedText: string;
  raw: unknown;
};

type PronunciationAssessmentOptions = {
  audio: ArrayBuffer;
  referenceText: string;
  contentType: string;
  language?: string;
};

type AzurePronunciationScores = {
  AccuracyScore?: number;
  FluencyScore?: number;
  ProsodyScore?: number;
  CompletenessScore?: number;
};

function getPronunciationScores(payload: any): AzurePronunciationScores {
  return (
    payload?.NBest?.[0]?.PronunciationAssessment ||
    payload?.PronunciationAssessment ||
    {}
  );
}

function getAzureEndpoint(region: string, language: string) {
  const searchParams = new URLSearchParams({
    language,
    format: 'detailed',
  });

  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${searchParams.toString()}`;
}

function buildDimensions(scores: PronunciationAssessmentResult['scores']): PronunciationDimension[] {
  return [
    { key: 'accuracy', label: 'Accuracy', score: scores.accuracy },
    { key: 'fluency', label: 'Fluency', score: scores.fluency },
    { key: 'prosody', label: 'Prosody', score: scores.prosody },
    { key: 'completeness', label: 'Completeness', score: scores.completeness },
  ];
}

function buildSuggestions(dimensions: PronunciationDimension[]) {
  return dimensions
    .filter((dimension) => typeof dimension.score === 'number' && dimension.score < 75)
    .map((dimension) => {
      if (dimension.key === 'accuracy') return 'Slow down and focus on clear consonant and vowel sounds.';
      if (dimension.key === 'fluency') return 'Practice speaking in short complete chunks with fewer pauses.';
      if (dimension.key === 'prosody') return 'Add natural stress and rising or falling intonation to key words.';
      return 'Try to say the full sentence and avoid skipping small words.';
    });
}

export async function assessPronunciation({
  audio,
  referenceText,
  contentType,
  language = 'en-US',
}: PronunciationAssessmentOptions): Promise<PronunciationAssessmentResult> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !region) {
    throw new Error('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be configured.');
  }

  const pronunciationAssessment = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
    EnableProsodyAssessment: true,
  };

  const encodedAssessment = Buffer.from(JSON.stringify(pronunciationAssessment)).toString('base64');
  const response = await fetch(getAzureEndpoint(region, language), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': contentType || 'audio/wav; codecs=audio/pcm; samplerate=16000',
      Accept: 'application/json;text/xml',
      'Pronunciation-Assessment': encodedAssessment,
    },
    body: audio,
  });

  const payload = await response.json().catch(async () => ({
    error: await response.text(),
  }));

  if (!response.ok) {
    throw new Error(`Azure pronunciation assessment failed: ${JSON.stringify(payload)}`);
  }

  const azureScores = getPronunciationScores(payload);
  const scores = {
    accuracy: azureScores.AccuracyScore ?? null,
    fluency: azureScores.FluencyScore ?? null,
    prosody: azureScores.ProsodyScore ?? null,
    completeness: azureScores.CompletenessScore ?? null,
  };
  const dimensions = buildDimensions(scores);

  return {
    ...scores,
    scores,
    dimensions,
    suggestions: buildSuggestions(dimensions),
    recognizedText: payload?.DisplayText || payload?.NBest?.[0]?.Display || '',
    raw: payload,
  };
}
