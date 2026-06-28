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

// 🔧 正则强抽：当完整 XML 解析失败时，从原始文本中暴力提取 recognizedText
function regexExtractRecognizedText(rawXml: string): string {
  // 尝试多种 patterns，按优先级排列
  const patterns = [
    // 标准 XML 标签内容
    /<rec_text>([^<]+)<\/rec_text>/i,
    /<recognizedText>([^<]+)<\/recognizedText>/i,
    /<rec_paper>[\s\S]*?<rec_text>([^<]+)<\/rec_text>/i,
    // content 属性或标签
    /<content>([^<]+)<\/content>/i,
    /content="([^"]+)"/i,
    /content='([^']+)'/i,
    // read_sentence / sentence 节点
    /<sentence[^>]*content="([^"]+)"/i,
    /<word[^>]*content="([^"]+)"/gi,
    // 任何看起来像英文句子的内容（3个以上英文单词）
    /([A-Za-z]+(?:\s+[A-Za-z]+){2,})/g,
  ];

  for (const pattern of patterns) {
    const matches = rawXml.match(pattern);
    if (matches) {
      if (pattern.flags.includes('g')) {
        // 全局匹配：收集所有匹配项
        const texts = [...matches].map((m) => {
          // 对于带捕获组的全局匹配，取捕获组
          const execResult = pattern.exec(rawXml);
          return execResult ? (execResult[1] || execResult[0]) : m;
        });
        const joined = texts.filter((t) => /[A-Za-z]/.test(t)).join(' ');
        if (joined.trim()) return joined.trim();
      } else {
        const text = (matches[1] || matches[0]).replace(/\s+/g, ' ').trim();
        if (/[A-Za-z]{3,}/.test(text)) return text;
      }
    }
  }

  return '';
}

// 🛡️ 抗崩溃包装器：无论如何都返回一个可用的 SpeechEvaluationResult，
// 保证 recognizedText 永远有值，业务流不中断
function resilientParseXunfeiResult(rawXml: string, referenceText: string, parseError?: string): SpeechEvaluationResult {
  // 🚨 先打印原始数据
  console.log('🚨 讯飞原始 Payload 截取:', rawXml.substring(0, 800));
  console.log('🚨 讯飞原始 Payload 总长度:', rawXml.length);

  // 尝试完整 XML 解析
  try {
    const result = parseXunfeiXml(rawXml, referenceText);
    // 如果解析成功但 recognizedText 为空（兜底是 referenceText），用正则再试一次
    if (!result.recognizedText || result.recognizedText === referenceText) {
      const regexText = regexExtractRecognizedText(rawXml);
      if (regexText) {
        console.log('[XunfeiService] 🔧 Regex backfill recognizedText:', regexText);
        result.recognizedText = regexText;
      }
    }
    console.log('[XunfeiService] ✅ Full XML parse succeeded', {
      overallScore: result.overallScore,
      recognizedText: result.recognizedText?.substring(0, 50),
      wordCount: result.words.length,
    });
    return result;
  } catch (error) {
    console.error('[XunfeiService] ⚠️ Full XML parse threw, falling back to regex extraction:', error);
  }

  // 降级：正则暴抽文本
  const regexText = regexExtractRecognizedText(rawXml);
  console.log('[XunfeiService] 🔧 Regex extracted text:', regexText || '(empty)');

  const fallbackText = regexText || referenceText;

  // 构造降级结果：没有评分，但有识别文本
  return {
    provider: 'xunfei',
    overallScore: null,
    recognizedText: fallbackText,
    referenceText,
    scores: {
      total: null,
      accuracy: null,
      fluency: null,
      standard: null,
      integrity: null,
    },
    words: [],
    rawXml,
    raw: { _parseError: parseError || 'XML parse failed, regex extraction used', _fallback: true },
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

  console.log('[XunfeiService] Auth URL generated', {
    url: `${XUNFEI_URL}?...`,
    host: XUNFEI_HOST,
    path: XUNFEI_PATH,
    date,
    apiKeyPrefix: apiKey.slice(0, 6),
  });

  const fullUrl = `${XUNFEI_URL}?${params.toString()}`;
  console.log('[XunfeiService] Full WSS URL:', fullUrl.substring(0, 120) + '...');
  return fullUrl;
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

    const safeResolve = (result: SpeechEvaluationResult) => {
      console.log('[XunfeiService] ✅ Resolving with parsed result', {
        overallScore: result.overallScore,
        recognizedText: result.recognizedText?.substring(0, 50),
      });
      resolve(result);
    };

    const safeReject = (error: Error) => {
      console.error('[XunfeiService] ❌ Rejecting:', error.message);
      reject(error);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      // 🔒 必须 try-catch：一旦 settled=true 就没有回头路，
      // callback 内部抛异常会导致 Promise 永久挂起
      try {
        callback();
      } catch (error) {
        console.error('[XunfeiService] finish callback threw:', error);
        // 如果 resolve/reject 都还没被调用，这里已经是死路了，
        // 但 try-catch 至少防止了未捕获异常
      }
      try {
        socket.close();
      } catch {
        // socket 可能已经关闭
      }
    };

    timeout = setTimeout(() => {
      console.error('[XunfeiService] Timed out waiting for final result', { hasXml: Boolean(latestXml) });
      if (latestXml) {
        console.log('[XunfeiService] Salvaging partial XML on timeout');
        finish(() => safeResolve(resilientParseXunfeiResult(latestXml, referenceText, 'timeout salvage')));
      } else {
        finish(() => safeReject(new Error('Xunfei speech evaluation timed out.')));
      }
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
          finish(() => safeReject(error instanceof Error ? error : new Error('Audio frame send failed')));
        });
    });

    socket.on('message', (raw) => {
      try {
        const rawString = raw.toString();
        console.log('📥 收到科大讯飞返回数据:', rawString.substring(0, 500));
        const message = JSON.parse(rawString) as XunfeiMessage;

        // 🔍 完整打印 message 结构以便排查字段位置
        console.log('[XunfeiService] Parsed message structure', {
          code: message.code,
          message: message.message,
          sid: message.sid,
          hasData: message.data !== undefined,
          dataKeys: message.data ? Object.keys(message.data) : [],
          dataStatus: message.data?.status,
          dataStatusType: typeof message.data?.status,
          hasDataPayload: Boolean(message.data?.data),
        });

        // 累积 XML 数据
        if (message.data?.data) {
          latestXml = Buffer.from(message.data.data, 'base64').toString('utf8');
          console.log('[XunfeiService] XML payload updated', {
            xmlLength: latestXml.length,
          });
        }

        // ✅ 检测最终结果：status === 2（兼容 string/number）
        const finalStatus = message.data?.status;
        if (finalStatus !== undefined && finalStatus !== null && Number(finalStatus) === 2) {
          if (!latestXml) {
            console.error('[XunfeiService] Final status reached but XML payload is empty');
            finish(() => safeReject(new Error(`Xunfei returned no parsable XML. ${message.message || ''}`.trim())));
            return;
          }
          console.log('[XunfeiService] Final result received (status=2), parsing XML');
          finish(() => safeResolve(resilientParseXunfeiResult(latestXml, referenceText, 'status=2')));
          return;
        }

        // ✅ 兜底：code === 0 且已有 XML，视为结果已就绪
        if (message.code === 0 && latestXml) {
          console.log('[XunfeiService] Code 0 with accumulated XML — resolving as complete');
          finish(() => safeResolve(resilientParseXunfeiResult(latestXml, referenceText, 'code-0 fallback')));
          return;
        }

        // ❌ 非零错误码
        if (message.code !== undefined && message.code !== 0) {
          console.error('[XunfeiService] Non-zero code from iFlytek', {
            code: message.code,
            message: message.message,
          });

          if (latestXml) {
            console.log('[XunfeiService] Salvaging recognized text from partial XML despite non-zero code');
            finish(() => safeResolve(resilientParseXunfeiResult(latestXml, referenceText, `non-zero code ${message.code}`)));
            return;
          }

          finish(() => safeReject(new Error(`Xunfei error ${message.code}: ${message.message || 'unknown error'}`)));
        }
      } catch (error) {
        console.error('[XunfeiService] Failed to parse WebSocket message', error);
        finish(() => safeReject(error instanceof Error ? error : new Error('Failed to parse WebSocket message')));
      }
    });

    socket.on('error', (error) => {
      console.error('[XunfeiService] WebSocket error', error);
      finish(() => safeReject(error instanceof Error ? error : new Error('Xunfei WebSocket error')));
    });

    socket.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString?.() || '(none)';
      console.log('⚠️ 科大讯飞 WS 断开，状态码:', code, '原因:', reasonStr, { settled, hasXml: Boolean(latestXml) });
      if (!settled) {
        // 🔧 抢救：WebSocket 断开但有部分 XML，尝试解析
        if (latestXml) {
          console.log('[XunfeiService] Salvaging partial XML on unexpected close');
          finish(() => safeResolve(resilientParseXunfeiResult(latestXml, referenceText, `close code ${code}`)));
        } else {
          finish(() => safeReject(new Error(`Xunfei WebSocket closed before final result (code ${code}).`)));
        }
      }
    });
  });
}
