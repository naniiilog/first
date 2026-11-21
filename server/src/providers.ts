import Anthropic from '@anthropic-ai/sdk';
import { KEY_ENV, type AiEntry } from './catalog.js';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** 한 번 답할 때 쓸 수 있는 최대 출력 토큰(생각하는 토큰 포함). */
const MAX_OUTPUT_TOKENS = 1500;

const key = (entry: AiEntry) => process.env[KEY_ENV[entry.backend]]?.trim() ?? '';

let anthropic: Anthropic | null = null;
const getAnthropic = () => (anthropic ??= new Anthropic({ apiKey: key({ backend: 'anthropic' } as AiEntry) }));

export async function complete(entry: AiEntry, system: string, turns: Turn[]): Promise<Completion> {
  if (!key(entry)) throw new UpstreamError(`${entry.id}: 서버에 ${KEY_ENV[entry.backend]}가 설정되지 않았어요.`, 503);
  const fullSystem = entry.mimic
    ? `${system}\n\n[연기 지침] 너는 "${entry.mimic.label}" 스타일의 AI야: ${entry.mimic.style}. 실제로 전화·결제 같은 외부 행동은 할 수 없으니, 할 수 있는 척하지 말고 대화로만 도와줘.`
    : system;
  switch (entry.backend) {
    case 'anthropic':
      return completeAnthropic(entry.model, fullSystem, turns);
    case 'google':
      return completeGemini(entry, fullSystem, turns);
    case 'openai':
      return completeOpenAICompatible(entry, 'https://api.openai.com/v1', fullSystem, turns);
    case 'xai':
      return completeOpenAICompatible(entry, 'https://api.x.ai/v1', fullSystem, turns);
    case 'meta':
      return completeOpenAICompatible(entry, 'https://api.meta.ai/v1', fullSystem, turns);
  }
}

async function completeAnthropic(model: string, system: string, turns: Turn[]): Promise<Completion> {
  try {
    const response = await getAnthropic().beta.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: turns,
      // 단체 채팅은 짧은 대화라 낮은 effort로 토큰을 아껴요.
      output_config: { effort: 'low' },
      // 안전 분류기가 거절하면 서버 쪽에서 다른 모델로 자동 재시도해요.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') {
      throw new UpstreamError('이 요청에는 답하지 않기로 했어요.', 422);
    }
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new UpstreamError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
    if (err instanceof Anthropic.APIError) throw new UpstreamError(`Claude 오류 (${err.status ?? '네트워크'}): ${err.message}`);
    throw err;
  }
}

/** OpenAI, xAI(그록), Meta(뮤즈)는 같은 Chat Completions 형식을 써요. */
async function completeOpenAICompatible(entry: AiEntry, defaultBase: string, system: string, turns: Turn[]): Promise<Completion> {
  const base = process.env[`${entry.backend.toUpperCase()}_BASE_URL`]?.trim() || defaultBase;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key(entry)}` },
    body: JSON.stringify({
      model: entry.model,
      messages: [{ role: 'system', content: system }, ...turns],
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UpstreamError(`${entry.id} 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`, res.status === 429 ? 429 : 502);
  }
  return {
    text: String(data?.choices?.[0]?.message?.content ?? '').trim(),
    inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(data?.usage?.completion_tokens ?? 0),
  };
}

async function completeGemini(entry: AiEntry, system: string, turns: Turn[]): Promise<Completion> {
  const base = process.env.GOOGLE_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta';
  const res = await fetch(`${base}/models/${encodeURIComponent(entry.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key(entry) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UpstreamError(`gemini 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`, res.status === 429 ? 429 : 502);
  }
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim(),
    inputTokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
    outputTokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0) + Number(data?.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
