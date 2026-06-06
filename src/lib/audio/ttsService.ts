type TtsFormat = 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';

type TtsOptions = {
  text: string;
  voice?: string;
  model?: string;
  format?: TtsFormat;
  instructions?: string;
  speed?: number;
};

export async function synthesizeSpeech(_options: TtsOptions) {
  return new ArrayBuffer(0);
}
