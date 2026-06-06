import { getLevelById } from '@/config/levels';
import { buildNpcSystemPrompt } from '@/config/prompts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const REPORT_MODE_PREFIX = '[SYSTEM_REPORT_MODE]';

type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ClientMessage = {
  role?: unknown;
  content?: unknown;
  text?: unknown;
};

type DeepSeekCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function getText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((message): message is ClientMessage => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      const candidate = message as ClientMessage;
      const content = getText(candidate.content) || getText(candidate.text);

      return (
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        content.length > 0
      );
    })
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: getText(message.content) || getText(message.text),
    }))
    .slice(-10);
}

function extractReply(content: string, shouldCleanNpcReply = true) {
  if (!content) {
    return '';
  }

  const normalizedContent = stripCodeFence(content);

  try {
    const parsed = JSON.parse(normalizedContent);
    if (typeof parsed.reply === 'string') {
      return shouldCleanNpcReply ? cleanNpcReply(parsed.reply) : parsed.reply.trim();
    }
  } catch {
    // DeepSeek may return plain text if the model ignores JSON-only instructions.
  }

  return shouldCleanNpcReply ? cleanNpcReply(normalizedContent) : normalizedContent.trim();
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function cleanNpcReply(text: string) {
  return text
    .replace(/```(?:json)?/gi, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^(confucius|孔子|npc|assistant)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReportSystemPrompt() {
  return `
You are an IELTS speaking coach. Based on the learner's English conversation record, write a Chinese speaking correction report.

Requirements:
1. Point out concrete grammar or vocabulary issues and provide corrected English.
2. Comment on fluency and pronunciation indirectly from the transcript.
3. Give an overall score from 0 to 10.
4. Use clear Markdown in Chinese.
`;
}

async function createChatCompletion(messages: ChatMessage[]) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${await response.text()}`);
  }

  return response.json() as Promise<DeepSeekCompletion>;
}

export async function POST(req: Request) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: 'Missing DEEPSEEK_API_KEY' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const level =
      typeof body.levelId === 'string' || typeof body.levelId === 'number'
        ? getLevelById(body.levelId)
        : undefined;
    const systemPrompt =
      getText(body.systemPrompt) || (level ? buildNpcSystemPrompt(level) : '');
    const history = normalizeHistory(
      body.messages ?? body.history ?? body.conversationHistory,
    );
    const currentMessage =
      getText(body.message) || getText(body.content) || getText(body.prompt);
    const isReportMode = currentMessage.startsWith(REPORT_MODE_PREFIX);
    const effectiveCurrentMessage = isReportMode
      ? currentMessage.slice(REPORT_MODE_PREFIX.length).trim()
      : currentMessage;
    const hasUserContent =
      effectiveCurrentMessage.length > 0 ||
      (!isReportMode && history.some((message) => message.role === 'user'));

    if (isReportMode && !effectiveCurrentMessage) {
      return NextResponse.json({ reply: '暂无足够的对话内容生成报告。' });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system' as const,
        content: isReportMode ? buildReportSystemPrompt() : systemPrompt,
      },
      ...(!isReportMode ? history : []),
      ...(effectiveCurrentMessage
        ? [{ role: 'user' as const, content: effectiveCurrentMessage }]
        : []),
    ].filter((message) => message.content.trim().length > 0);

    if (!hasUserContent || !messages || messages.length === 0) {
      return NextResponse.json({ reply: 'Please say something.' });
    }

    const completion = await createChatCompletion(messages);
    const reply = extractReply(
      completion.choices?.[0]?.message?.content ?? '',
      !isReportMode,
    );

    return NextResponse.json({ reply, text: reply });
  } catch (error) {
    console.error('DeepSeek chat error:', error);

    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 },
    );
  }
}
