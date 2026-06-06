export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id?: number;
  role: ChatRole;
  text: string;
  content?: string;
};

export type {
  LevelConfig,
  LevelHintKeyword,
  LevelHints,
  LevelMapData,
  LevelMedia,
  LevelTask,
} from '@/config/levelsConfig';

export type TaskValidationResult = {
  task_1: boolean;
  task_2: boolean;
  task_3: boolean;
};

export type PronunciationWordResult = {
  text: string;
  score: number | null;
  accuracyScore?: number | null;
  fluencyScore?: number | null;
  standardScore?: number | null;
  phonetic?: string;
  errorType?: string | null;
  isRejected?: boolean;
  raw?: unknown;
};

export type SpeechEvaluationResult = {
  provider: 'xunfei';
  overallScore: number | null;
  recognizedText: string;
  referenceText: string;
  scores: {
    total: number | null;
    accuracy: number | null;
    fluency: number | null;
    standard: number | null;
    integrity: number | null;
  };
  words: PronunciationWordResult[];
  rawXml: string;
  raw: unknown;
};
