import type { Settings } from './types';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  usage: { input: number; output: number };
}

export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';
export const DEFAULT_APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? '';

const base = (s: Settings) => (s.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
const headers = (s: Settings): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(s.appToken ? { 'x-app-token': s.appToken } : {}),
});

export async function chat(settings: Settings, aiId: string, system: string, turns: Turn[]): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch(`${base(settings)}/chat`, {
      method: 'POST',
      headers: headers(settings),
      body: JSON.stringify({ aiId, system, turns }),
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 설정에서 서버 주소를 확인해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `서버 오류 (${res.status})`);
  return data as ChatResult;
}

/** real: 진짜 그 AI가 답해요 / mimic: 무료 엔진이 그 AI 스타일로 따라 해요 */
export type AiStatus = Record<string, 'real' | 'mimic'>;

/** 서버에서 지금 쓸 수 있는 AI와 진짜/따라하기 여부. 서버에 못 붙으면 null. */
export async function fetchAvailable(settings: Settings): Promise<AiStatus | null> {
  try {
    const res = await fetch(`${base(settings)}/ais`, { headers: headers(settings) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ais && typeof data.ais === 'object' ? data.ais : null;
  } catch {
    return null;
  }
}
