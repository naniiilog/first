import Anthropic from '@anthropic-ai/sdk';
import { KEY_ENV, keyFor, type Env, type Route } from './catalog.js';

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

export async function complete(env: Env, r: Route, system: string, turns: Turn[]): Promise<Completion> {
  const apiKey = keyFor(env, r.backend);
  if (!apiKey) throw new UpstreamError(`${r.aiId}: 서버에 ${KEY_ENV[r.backend]}가 설정되지 않았어요.`, 503);
  const fullSystem = r.mimic
    ? `${system}\n\n[연기 지침] 너는 "${r.mimic.label}"(으)로 행동해: ${r.mimic.style}. 실제 외부 행동(전화·결제·검색 등)은 할 수 없으니 할 수 있는 척하지 말고 대화로만 함께해.`
    : system;
  const base = (name: string, fallback: string) => env[`${name}_BASE_URL`]?.trim() || fallback;
  switch (r.backend) {
    case 'anthropic':
      return completeAnthropic(apiKey, base('ANTHROPIC', ''), r.model, fullSystem, turns);
    case 'google':
      return completeGemini(apiKey, base('GOOGLE', 'https://generativelanguage.googleapis.com/v1beta'), r, fullSystem, turns);
    case 'openai':
      return completeOpenAICompatible(apiKey, base('OPENAI', 'https://api.openai.com/v1'), r, fullSystem, turns);
    case 'xai':
      return completeOpenAICompatible(apiKey, base('XAI', 'https://api.x.ai/v1'), r, fullSystem, turns);
    case 'meta':
      return completeOpenAICompatible(apiKey, base('META', 'https://api.meta.ai/v1'), r, fullSystem, turns);
  }
}

async function completeAnthropic(apiKey: string, baseURL: string, model: string, system: string, turns: Turn[]): Promise<Completion> {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  try {
    const response = await client.beta.messages.create({
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
async function completeOpenAICompatible(apiKey: string, base: string, r: Route, system: string, turns: Turn[]): Promise<Completion> {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: r.model,
      messages: [{ role: 'system', content: system }, ...turns],
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UpstreamError(`${r.aiId} 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`, res.status === 429 ? 429 : 502);
  }
  return {
    text: String(data?.choices?.[0]?.message?.content ?? '').trim(),
    inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(data?.usage?.completion_tokens ?? 0),
  };
}

async function completeGemini(apiKey: string, base: string, r: Route, system: string, turns: Turn[]): Promise<Completion> {
  const res = await fetch(`${base}/models/${encodeURIComponent(r.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) {
      throw new UpstreamError('무료 사용량을 다 썼거나 너무 빨리 요청했어요. 잠시 후(또는 내일) 다시 시도해 주세요.', 429);
    }
    throw new UpstreamError(`${r.aiId} 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`, 502);
  }
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim(),
    inputTokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
    outputTokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0) + Number(data?.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
