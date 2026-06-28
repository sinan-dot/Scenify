import { getLevelById } from '@/config/levels';
import type { ChatMessage, TaskValidationResult } from '@/lib/types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const EMPTY_VALIDATION: TaskValidationResult = {
  task_1: false,
  task_2: false,
  task_3: false,
};

type CompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function normalizeHistory(history: ChatMessage[]): CompletionMessage[] {
  return history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role,
      content: msg.text || msg.content || '',
    }))
    .filter((msg) => msg.content.trim().length > 0)
    .slice(-24);
}

function getLearnerText(history: ChatMessage[]) {
  return history
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.text || msg.content || '')
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function hasMeaningfulEnglish(text: string) {
  const words = text.match(/[a-z]+(?:'[a-z]+)?/gi) ?? [];
  const weakOnly = /^(yes|yeah|ok|okay|no|hi|hello|thanks|thank you|i don't know|dont know)$/i;
  return words.length >= 3 && !weakOnly.test(text.trim());
}

function mergeValidationResults(
  modelResult: TaskValidationResult,
  fallbackResult: TaskValidationResult,
): TaskValidationResult {
  return {
    task_1: modelResult.task_1 || fallbackResult.task_1,
    task_2: modelResult.task_2 || fallbackResult.task_2,
    task_3: modelResult.task_3 || fallbackResult.task_3,
  };
}

function validateLevelTasksLocally(levelId: number | string, history: ChatMessage[]): TaskValidationResult {
  const text = getLearnerText(history);
  if (!hasMeaningfulEnglish(text)) return EMPTY_VALIDATION;

  const normalizedLevelId = typeof levelId === 'number'
    ? levelId
    : Number(String(levelId).replace(/^level-/i, ''));

  if (normalizedLevelId === 1) {
    return {
      task_1: hasAny(text, [
        'respect',
        'pay my respects',
        'visit',
        'come here',
        'dear master',
        'master lao',
        'admire',
      ]),
      task_2: hasAny(text, [
        'benevolence',
        'ren',
        'tao',
        'kindness',
        'loving people',
        'love people',
        'inaction',
        'follow nature',
        'following nature',
      ]),
      task_3: hasAny(text, [
        'difference',
        'different',
        'same',
        'similar',
        'both',
        'farewell',
        'goodbye',
        'thank you',
        'thanks',
      ]) && hasAny(text, ['tao', 'benevolence', 'ren', 'nature', 'kindness']),
    };
  }

  if (normalizedLevelId === 2) {
    return {
      task_1: hasAny(text, [
        'mozi',
        'non-aggression',
        'non aggression',
        'universal love',
        'love all people',
        'oppose war',
      ]),
      task_2: hasAny(text, [
        'give up attacking song',
        'stop attacking song',
        'do not attack song',
        "don't attack song",
        'stop the war',
        'war is harmful',
        'people suffer',
      ]),
      task_3: hasAny(text, [
        'prove',
        'cannot capture song',
        'cannot take song',
        'siege',
        'defend',
        'weapons',
        'gongshu',
        'reason',
        'benefit',
      ]),
    };
  }

  return EMPTY_VALIDATION;
}

function parseValidationResult(content: string): TaskValidationResult {
  if (!content?.trim()) return EMPTY_VALIDATION;

  // Strip markdown code fences that LLMs sometimes wrap around JSON
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      task_1: parsed.task_1 === true,
      task_2: parsed.task_2 === true,
      task_3: parsed.task_3 === true,
    };
  } catch (error) {
    console.error('Task validator JSON parse failed:', cleaned.substring(0, 120), error);
    return EMPTY_VALIDATION;
  }
}

async function createChatCompletion(messages: CompletionMessage[]) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0,
      max_tokens: 128,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek validator API error: ${await response.text()}`);
  }

  return response.json() as Promise<DeepSeekCompletion>;
}

export async function validateLevelTasks({
  levelId,
  history,
}: {
  levelId: number | string;
  history: ChatMessage[];
}): Promise<TaskValidationResult> {
  const localValidation = validateLevelTasksLocally(levelId, history);

  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('DEEPSEEK_API_KEY is not configured; task validation skipped.');
    return localValidation;
  }

  const normalizedHistory = normalizeHistory(history);
  if (!normalizedHistory || normalizedHistory.length === 0) {
    return localValidation;
  }

  const level = getLevelById(levelId);
  const taskRules = level.tasks
    .map((task) => `${task.id}: ${task.title} - ${task.description}`)
    .join('\n');

  const systemPrompt = `
You are a strict task completion auditor for an English speaking game.
Evaluate ONLY the learner's messages (ignore assistant/NPC messages).

CRITICAL RULES — apply all of them:
1. Mark a task true ONLY when the learner has EXPLICITLY and SPECIFICALLY addressed that task's core requirement in their own words.
2. A long sentence that vaguely touches many topics does NOT satisfy any task. Each task requires a dedicated, clear statement.
3. Single short responses ("yes", "ok", "I agree", "that's right", "I understand") NEVER satisfy any task alone.
4. Restating or paraphrasing what the NPC just said does NOT count.
5. A task must be independently satisfied — one sentence cannot unlock multiple tasks simultaneously unless it contains clearly distinct, specific content for each.
6. When in doubt, return false. Heavily err on the side of false.
7. Cumulative evaluation: if the learner clearly completed a task in an earlier turn, keep it true.

Tasks (each must be INDEPENDENTLY and EXPLICITLY satisfied):
${taskRules}

Output JSON only. No markdown, no comments.
{"task_1": boolean, "task_2": boolean, "task_3": boolean}
`;

  const messages: CompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...normalizedHistory,
  ];

  if (!messages || messages.length === 0) {
    return EMPTY_VALIDATION;
  }

  try {
    const completion = await createChatCompletion(messages);
    // Use model result as authoritative source — do NOT OR with local fallback here,
    // as that allows keyword-only heuristics to bypass the strict LLM check.
    return parseValidationResult(completion.choices?.[0]?.message?.content ?? '');
  } catch (error) {
    console.error('Task validator request failed:', error);
    return localValidation; // only fall back to local heuristics when API is down
  }
}
