/**
 * 서버가 아는 AI 목록.
 * - native: 그 회사의 실제 API를 호출해요.
 * - mimic: 공개 API가 없는 서비스라, Claude가 그 서비스 스타일을 따라 연기해요.
 * 모델 이름은 환경 변수로 바꿀 수 있어요.
 */
export type Backend = 'anthropic' | 'openai' | 'google' | 'xai' | 'meta';

export interface AiEntry {
  id: string;
  backend: Backend;
  model: string;
  mimic?: { label: string; style: string };
}

const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

const CLAUDE_MODEL = env('CLAUDE_MODEL', 'claude-opus-5-5');

const mimic = (id: string, label: string, style: string): AiEntry => ({
  id,
  backend: 'anthropic',
  model: CLAUDE_MODEL,
  mimic: { label, style },
});

export const CATALOG: Record<string, AiEntry> = {
  chatgpt: { id: 'chatgpt', backend: 'openai', model: env('OPENAI_MODEL', 'gpt-5') },
  gemini: { id: 'gemini', backend: 'google', model: env('GEMINI_MODEL', 'gemini-2.5-flash') },
  claude: { id: 'claude', backend: 'anthropic', model: CLAUDE_MODEL },
  muse: { id: 'muse', backend: 'meta', model: env('META_MODEL', 'muse-spark-1.1') },
  grok: { id: 'grok', backend: 'xai', model: env('XAI_MODEL', 'grok-4') },
  pickle: mimic('pickle', '피클', '전화 걸기, 예약, 환불처럼 실제로 일을 대신 처리해 주는 실행형 AI 비서. 말보다 행동 계획을 먼저 제안하는 편'),
  buoy: mimic('buoy', '부이', '일상 업무를 척척 도와주는 국내 개인 AI 에이전트. 친근하고 꼼꼼하게 할 일을 정리해 주는 편'),
  keyring: mimic('keyring', '키링', '늘 곁에 달고 다니는 듯한 가볍고 다정한 국내 개인 AI 에이전트. 짧고 귀엽게 말하는 편'),
  q: mimic('q', '큐', '질문(Q)을 잘 던지는 AI 에이전트. 핵심을 짚는 질문으로 대화를 이끄는 편'),
  instinct: mimic('instinct', '인스팅트', '직관적으로 빠르게 판단하고 바로 실행하는 AI 에이전트. 결론부터 말하는 편'),
};

export const KEY_ENV: Record<Backend, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  xai: 'XAI_API_KEY',
  meta: 'META_API_KEY',
};

export function isAvailable(entry: AiEntry): boolean {
  return Boolean(process.env[KEY_ENV[entry.backend]]?.trim());
}
