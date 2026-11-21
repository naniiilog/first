import Anthropic from '@anthropic-ai/sdk';
import type { ProviderId } from './types';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  keyHint: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    defaultModel: 'claude-opus-5-5',
    keyHint: 'sk-ant-...',
  },
  openai: {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    defaultModel: 'gpt-5',
    keyHint: 'sk-...',
  },
  google: {
    id: 'google',
    label: 'Gemini (Google)',
    defaultModel: 'gemini-2.5-flash',
    keyHint: 'AIza...',
  },
};

/** 각 공급자에게 보낼 공통 대화 형식 */
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  provider: ProviderId;
  model: string;
  apiKey: string;
  system: string;
  turns: Turn[];
}

export class ProviderError extends Error {}

export async function complete(req: CompletionRequest): Promise<string> {
  if (!req.apiKey) {
    throw new ProviderError(`${PROVIDERS[req.provider].label} API 키가 설정되지 않았어요. 설정에서 입력해 주세요.`);
  }
  switch (req.provider) {
    case 'anthropic':
      return completeAnthropic(req);
    case 'openai':
      return completeOpenAI(req);
    case 'google':
      return completeGoogle(req);
  }
}

async function completeAnthropic(req: CompletionRequest): Promise<string> {
  // 앱이 사용자의 기기에서 사용자 본인의 키로 직접 호출하므로 브라우저/RN 환경 호출을 허용합니다.
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.beta.messages.create({
      model: req.model,
      max_tokens: 4000,
      system: req.system,
      messages: req.turns,
      // 채팅은 짧은 대화라 낮은 effort로 빠르게 답하게 합니다.
      output_config: { effort: 'low' },
      // 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도합니다.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('Claude가 이 요청에 답하지 않기로 했어요.');
    }
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    return text || '(빈 응답)';
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ProviderError('Claude API 키가 올바르지 않아요.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ProviderError('Claude 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new ProviderError(`Claude 오류 (${err.status ?? '네트워크'}): ${err.message}`);
    }
    throw err;
  }
}

async function completeOpenAI(req: CompletionRequest): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [{ role: 'system', content: req.system }, ...req.turns],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ProviderError(`ChatGPT 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`);
  }
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  return text?.trim() || '(빈 응답)';
}

async function completeGoogle(req: CompletionRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': req.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      })),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ProviderError(`Gemini 오류 (${res.status}): ${data?.error?.message ?? '알 수 없는 오류'}`);
  }
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  return text || '(빈 응답)';
}
