import { validateLevelTasks } from '@/lib/ai/taskValidatorService';
import type { ChatMessage, TaskValidationResult } from '@/lib/types';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const EMPTY_VALIDATION: TaskValidationResult = {
  task_1: false,
  task_2: false,
  task_3: false,
};

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((message): message is ChatMessage => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      const candidate = message as Partial<ChatMessage>;
      const text =
        typeof candidate.text === 'string'
          ? candidate.text
          : typeof candidate.content === 'string'
            ? candidate.content
            : '';

      return (
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        text.trim().length > 0
      );
    })
    .map((message) => ({
      role: message.role,
      text:
        typeof message.text === 'string'
          ? message.text.trim()
          : (message.content ?? '').trim(),
      content:
        typeof message.content === 'string'
          ? message.content.trim()
          : message.text.trim(),
    }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const history = normalizeHistory(
      body.messages ?? body.history ?? body.conversationHistory,
    );

    if (!history || history.length === 0) {
      return NextResponse.json(EMPTY_VALIDATION);
    }

    const result = await validateLevelTasks({
      levelId:
        typeof body.levelId === 'string' || typeof body.levelId === 'number'
          ? body.levelId
          : 1,
      history,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('DeepSeek validate-tasks error:', error);
    return NextResponse.json(EMPTY_VALIDATION);
  }
}
