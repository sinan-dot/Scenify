import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import WebSocket from 'ws';
import type { PronunciationWordResult, SpeechEvaluationResult } from '@/lib/types';

const XUNFEI_HOST = 'ise-api.xfyun.cn';
const XUNFEI_PATH = '/v2/open-ise';
const XUNFEI_URL = `wss://${XUNFEI_HOST}${XUNFEI_PATH}`;
const FRAME_SIZE = 1280;
const FRAME_INTERVAL_MS = 40;
const SOCKET_TIMEOUT_MS = 20000;

type EvaluateSpeechOptions = {
  audio: ArrayBuffer;
  referenceText: string;
};

type XunfeiMessage = {
  code?: number;
  message?: string;
  sid?: string;
  data?: {
    data?: string;
    status?: number;
  };
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getAttr(node: unknown, keys: string[]) {
  if (!node || typeof node !== 'object') return undefined;
  const object = node as Record<string, unknown>;
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
    const prefixedKey = `@_${key}`;
    if (object[prefixedKey] !== undefined) return object[prefixedKey];
  }
  return undefined;
}

function getScoreValue(node: unknown, keys: string[]) {
  const attrValue = getAttr(node, keys);
  if (attrValue !== undefined) return attrValue;
  if (!node || typeof node !== 'object') return undefined;

  const object = node as Record<string, unknown>;
  for (const key of keys) {
    const child = object[key];
    if (child !== undefined) {
      const childAttrValue = getAttr(child, ['value']);
      return childAttrValue !== undefined ? childAttrValue : child;
    }
  }

  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function findNodesByName(root: unknown, nodeName: string): unknown[] {
  const results: unknown[] = [];

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const object = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      if (key === nodeName) {
        results.push(...asArray(child));
      }
      visit(child);
    }
  };

  visit(root);
  return results;
}

function extractWords(parsedXml: unknown): PronunciationWordResult[] {
  return findNodesByName(parsedXml, 'word')
    .map((word) => {
      const text = String(
        getAttr(word, ['content', 'text', 'word', 'name', 'recognizedText', 'rec_text']) ?? '',
      ).trim();
      const score = toNumber(getScoreValue(word, ['total_score', 'phone_score', 'accuracy_score']));
      const errorType = getAttr(word, ['werr_msg', 'serr_msg', 'except_info']);

      return {
        text,
        score,
        accuracyScore: toNumber(getScoreValue(word, ['accuracy_score', 'phone_score'])),
        fluencyScore: toNumber(getScoreValue(word, ['fluency_score'])),
        standardScore: toNumber(getScoreValue(word, ['standard_score'])),
        phonetic: String(getAttr(word, ['symbol', 'phone', 'pron', 'rec_node_type']) ?? '').trim() || undefined,
        errorType: errorType === undefined ? null : String(errorType),
        isRejected: String(getAttr(word, ['is_rejected']) ?? '').toLowerCase() === 'true',
        raw: word,
      };
    })
    .filter((word) => word.text || word.score !== null || word.errorType);
}

function collectTextCandidates(root: unknown, keys: string[]) {
  const results = new Set<string>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const object = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      if (keys.includes(key) || keys.includes(key.replace(/^@_/, ''))) {
        const text = String(child ?? '').replace(/\s+/g, ' ').trim();
        if (/[A-Za-z]/.test(text)) {
          results.add(text);
        }
      }
      visit(child);
    }
  };

  visit(root);
  return [...results];
}

function extractRecognizedText(parsedXml: unknown, fallbackText: string) {
  const words = extractWords(parsedXml).map((word) => word.text).filter((text) => /[A-Za-z]/.test(text));
  if (words.length > 0) return words.join(' ');

  const sentenceNode = findNodesByName(parsedXml, 'sentence')[0];
  const sentenceText = String(getAttr(sentenceNode, ['content', 'text', 'recognizedText', 'rec_text']) ?? '').trim();
  if (/[A-Za-z]/.test(sentenceText)) {
    return sentenceText;
  }

  const textCandidates = collectTextCandidates(parsedXml, ['recognizedText', 'rec_text', 'content', 'text']);
  if (textCandidates.length > 0) {
    return textCandidates.sort((a, b) => b.length - a.length)[0];
  }

  return fallbackText;
}

function parseXunfeiXml(rawXml: string, referenceText: string): SpeechEvaluationResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const parsed = parser.parse(rawXml);
  const sentenceNode = findNodesByName(parsed, 'sentence')[0];
  const finalResult = (parsed as Record<string, unknown>)?.FinalResult;
  const rootScoreSource = sentenceNode || finalResult || parsed;

  const total = toNumber(getScoreValue(rootScoreSource, ['total_score', 'score']));
  const accuracy = toNumber(getScoreValue(rootScoreSource, ['accuracy_score', 'phone_score']));
  const fluency = toNumber(getScoreValue(rootScoreSource, ['fluency_score']));
  const standard = toNumber(getScoreValue(rootScoreSource, ['standard_score']));
  const integrity = toNumber(getScoreValue(rootScoreSource, ['integrity_score']));
  const words = extractWords(parsed);

  return {
    provider: 'xunfei',
    overallScore: total,
    recognizedText: extractRecognizedText(parsed, referenceText),
    referenceText,
    scores: {
      total,
      accuracy,
      fluency,
      standard,
      integrity,
    },
    words,
    rawXml,
    raw: parsed,
  };
}

function buildAuthUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${XUNFEI_HOST}\ndate: ${date}\nGET ${XUNFEI_PATH} HTTP/1.1`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64');
  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const params = new URLSearchParams({
    authorization: Buffer.from(authorizationOrigin, 'utf8').toString('base64'),
    date,
    host: XUNFEI_HOST,
  });

  console.log('[XunfeiService] Auth signature generated', {
    host: XUNFEI_HOST,
    path: XUNFEI_PATH,
    date,
    apiKeyPrefix: apiKey.slice(0, 6),
  });

  return `${XUNFEI_URL}?${params.toString()}`;
}

function buildReferenceText(text: string) {
  const sanitized = text
    .replace(/[#$%&*{}@]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `\uFEFF[content]\n${sanitized}`;
}

function buildStartFrame(appId: string, referenceText: string) {
  return {
    common: {
      app_id: appId,
    },
    business: {
      sub: 'ise',
      ent: 'en_vip',
      category: 'read_sentence',
      cmd: 'ssb',
      text: buildReferenceText(referenceText),
      tte: 'utf-8',
      ttp_skip: true,
      aue: 'raw',
      auf: 'audio/L16;rate=16000',
      rstcd: 'utf8',
      rst: 'entirety',
      ise_unite: '1',
      extra_ability: 'multi_dimension;syll_phone_err_msg;pitch',
    },
    data: {
      status: 0,
    },
  };
}

function buildAudioFrame(chunk: Buffer, aus: 1 | 2 | 4, status: 1 | 2) {
  return {
    business: {
      cmd: 'auw',
      aus,
      aue: 'raw',
    },
    data: {
      status,
      data: chunk.toString('base64'),
      data_type: 1,
      encoding: 'raw',
    },
  };
}

function getRawPcmBuffer(audioBuffer: Buffer) {
  const isWav =
    audioBuffer.length > 44 &&
    audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE';

  if (!isWav) return audioBuffer;

  let offset = 12;
  while (offset + 8 <= audioBuffer.length) {
    const chunkId = audioBuffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = audioBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;

    if (chunkId === 'data') {
      return audioBuffer.subarray(dataStart, Math.min(dataEnd, audioBuffer.length));
    }

    offset = dataEnd + (chunkSize % 2);
  }

  return audioBuffer.subarray(44);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendAudioFrames(socket: WebSocket, audioBuffer: Buffer) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < audioBuffer.length; offset += FRAME_SIZE) {
    chunks.push(audioBuffer.subarray(offset, offset + FRAME_SIZE));
  }

  if (chunks.length === 0) {
    chunks.push(Buffer.alloc(0));
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const isFirst = index === 0;
    const isLast = index === chunks.length - 1;
    const frame = buildAudioFrame(
      chunks[index],
      isLast ? 4 : isFirst ? 1 : 2,
      isLast ? 2 : 1,
    );
    socket.send(JSON.stringify(frame));
    await sleep(FRAME_INTERVAL_MS);
  }
}

export async function evaluateSpeechWithXunfei({
  audio,
  referenceText,
}: EvaluateSpeechOptions): Promise<SpeechEvaluationResult> {
  const appId = process.env.XUNFEI_APP_ID;
  const apiKey = process.env.XUNFEI_API_KEY;
  const apiSecret = process.env.XUNFEI_API_SECRET;

  console.log('[XunfeiService] Starting evaluation', {
    hasAppId: Boolean(appId),
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
    referenceText,
    audioBytes: audio.byteLength,
  });

  if (!appId || !apiKey || !apiSecret) {
    console.error('[XunfeiService] Missing authentication environment variables');
    throw new Error('XUNFEI_APP_ID, XUNFEI_API_KEY and XUNFEI_API_SECRET must be configured.');
  }
  if (!referenceText.trim()) {
    console.error('[XunfeiService] Missing reference text');
    throw new Error('referenceText is required for Xunfei speech evaluation.');
  }

  const audioBuffer = getRawPcmBuffer(Buffer.from(audio));
  console.log('[XunfeiService] Prepared PCM payload', {
    pcmBytes: audioBuffer.length,
  });

  if (audioBuffer.length === 0) {
    console.error('[XunfeiService] Audio payload is empty after PCM extraction');
    throw new Error('Audio payload is empty.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let latestXml = '';
    const socket = new WebSocket(buildAuthUrl(apiKey, apiSecret));

    let timeout: NodeJS.Timeout;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
      socket.close();
    };

    timeout = setTimeout(() => {
      console.error('[XunfeiService] Timed out waiting for final result');
      finish(() => reject(new Error('Xunfei speech evaluation timed out.')));
    }, SOCKET_TIMEOUT_MS);

    socket.on('open', () => {
      console.log('[XunfeiService] WebSocket connected');
      socket.send(JSON.stringify(buildStartFrame(appId, referenceText)));
      console.log('[XunfeiService] Start frame sent');
      void sendAudioFrames(socket, audioBuffer)
        .then(() => {
          console.log('[XunfeiService] Audio frames sent successfully');
        })
        .catch((error) => {
          console.error('[XunfeiService] Audio frame send failed', error);
          finish(() => reject(error));
        });
    });

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as XunfeiMessage;
        console.log('[XunfeiService] Message received', {
          code: message.code,
          status: message.data?.status,
          hasData: Boolean(message.data?.data),
          message: message.message,
        });

        if (message.data?.data) {
          latestXml = Buffer.from(message.data.data, 'base64').toString('utf8');
          console.log('[XunfeiService] XML payload updated', {
            xmlLength: latestXml.length,
          });
        }

        if (message.data?.status === 2) {
          if (!latestXml) {
            console.error('[XunfeiService] Final status reached but XML payload is empty');
            finish(() => reject(new Error(`Xunfei returned no parsable XML. ${message.message || ''}`.trim())));
            return;
          }
          console.log('[XunfeiService] Final result received, parsing XML');
          finish(() => resolve(parseXunfeiXml(latestXml, referenceText)));
          return;
        }

        if (message.code !== undefined && message.code !== 0) {
          console.error('[XunfeiService] Non-zero code from iFlytek', {
            code: message.code,
            message: message.message,
          });

          if (latestXml) {
            console.log('[XunfeiService] Salvaging recognized text from partial XML despite non-zero code');
            finish(() => resolve(parseXunfeiXml(latestXml, referenceText)));
            return;
          }

          finish(() => reject(new Error(`Xunfei error ${message.code}: ${message.message || 'unknown error'}`)));
        }
      } catch (error) {
        console.error('[XunfeiService] Failed to parse WebSocket message', error);
        finish(() => reject(error));
      }
    });

    socket.on('error', (error) => {
      console.error('[XunfeiService] WebSocket error', error);
      finish(() => reject(error));
    });

    socket.on('close', () => {
      console.log('[XunfeiService] WebSocket closed', { settled });
      if (!settled) {
        finish(() => reject(new Error('Xunfei WebSocket closed before final result.')));
      }
    });
  });
}
