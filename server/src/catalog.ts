/**
 * 서버가 아는 AI 목록과 "누가 실제로 답할지" 정하는 규칙.
 *
 * - real: 그 회사의 키가 서버에 있으면 진짜 그 AI가 답해요(유료).
 * - mimic: 키가 없거나 공개 API가 없는 AI는 무료 엔진(기본: 제미나이 무료 사용량)이 그 AI 스타일로 연기해요.
 *
 * GEMINI_API_KEY 하나만 있으면 10종 모두 무료로 쓸 수 있어요.
 */
export type Backend = 'anthropic' | 'openai' | 'google' | 'xai' | 'meta';
export type Env = Record<string, string | undefined>;

interface AiDef {
  id: string;
  label: string;
  /** 진짜로 연결할 수 있는 API (없으면 항상 따라하기) */
  real?: { backend: Backend; modelEnv: string; defaultModel: string };
  /** 따라하기 할 때 쓰는 스타일 설명 */
  style: string;
}

const AIS: AiDef[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    real: { backend: 'openai', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-5' },
    style: 'OpenAI의 ChatGPT 스타일. 친절하고 정리를 잘하며, 필요하면 항목을 나눠 설명하는 편',
  },
  {
    id: 'gemini',
    label: '제미나이',
    real: { backend: 'google', modelEnv: 'GEMINI_MODEL', defaultModel: 'gemini-2.5-flash' },
    style: 'Google의 제미나이 스타일. 호기심 많고 정보와 사실 확인을 좋아하는 편',
  },
  {
    id: 'claude',
    label: '클로드',
    real: { backend: 'anthropic', modelEnv: 'CLAUDE_MODEL', defaultModel: 'claude-opus-5-5' },
    style: 'Anthropic의 클로드 스타일. 차분하고 사려 깊으며 장단점을 균형 있게 짚는 편',
  },
  {
    id: 'muse',
    label: '뮤즈',
    real: { backend: 'meta', modelEnv: 'META_MODEL', defaultModel: 'muse-spark-1.1' },
    style: 'Meta의 뮤즈 스타일. 창의적이고 감각적인 아이디어를 잘 내는 편',
  },
  {
    id: 'grok',
    label: '그록봇',
    real: { backend: 'xai', modelEnv: 'XAI_MODEL', defaultModel: 'grok-4' },
    style: 'xAI의 그록 스타일. 재치 있고 장난스러우며 거침없이 말하는 편(무례하진 않게)',
  },
  { id: 'pickle', label: '피클', style: '전화 걸기, 예약, 환불처럼 일을 대신 처리해 주는 실행형 AI 비서 스타일. 말보다 행동 계획을 먼저 제안하는 편' },
  { id: 'buoy', label: '부이', style: '일상 업무를 척척 도와주는 국내 개인 AI 에이전트 스타일. 친근하고 꼼꼼하게 할 일을 정리해 주는 편' },
  { id: 'keyring', label: '키링', style: '늘 곁에 달고 다니는 듯한 가볍고 다정한 개인 AI 에이전트 스타일. 짧고 귀엽게 말하는 편' },
  { id: 'q', label: '큐', style: '질문(Q)을 잘 던지는 AI 에이전트 스타일. 핵심을 짚는 질문으로 대화를 이끄는 편' },
  { id: 'instinct', label: '인스팅트', style: '직관적으로 빠르게 판단하는 AI 에이전트 스타일. 결론부터 말하는 편' },
];

export const KEY_ENV: Record<Backend, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  xai: 'XAI_API_KEY',
  meta: 'META_API_KEY',
};

export const keyFor = (env: Env, backend: Backend) => env[KEY_ENV[backend]]?.trim() ?? '';

export interface Route {
  aiId: string;
  mode: 'real' | 'mimic';
  backend: Backend;
  model: string;
  /** mimic일 때 시스템 프롬프트에 덧붙일 연기 지침 */
  mimic?: { label: string; style: string };
}

/** 따라하기에 쓸 무료 엔진. 기본은 제미나이, 없으면 클로드 키로 대신해요. */
function mimicEngine(env: Env): { backend: Backend; model: string } | null {
  if (keyFor(env, 'google')) return { backend: 'google', model: env.FREE_MODEL?.trim() || 'gemini-2.5-flash' };
  if (keyFor(env, 'anthropic')) return { backend: 'anthropic', model: env.CLAUDE_MODEL?.trim() || 'claude-opus-5-5' };
  return null;
}

/** 이 AI의 요청을 실제로 어디로 보낼지 정해요. 쓸 수 없으면 null. */
export function route(env: Env, aiId: string): Route | null {
  const def = AIS.find((a) => a.id === aiId);
  if (!def) return null;
  // 제미나이는 무료 키가 곧 진짜 제미나이라 항상 real로 처리돼요.
  if (def.real && keyFor(env, def.real.backend) && env[`${def.real.backend.toUpperCase()}_REAL`] !== 'off') {
    return { aiId, mode: 'real', backend: def.real.backend, model: env[def.real.modelEnv]?.trim() || def.real.defaultModel };
  }
  const engine = mimicEngine(env);
  if (!engine) return null;
  return { aiId, mode: 'mimic', ...engine, mimic: { label: def.label, style: def.style } };
}

/** 앱에 알려줄 AI별 상태 */
export function status(env: Env): Record<string, 'real' | 'mimic'> {
  const out: Record<string, 'real' | 'mimic'> = {};
  for (const a of AIS) {
    const r = route(env, a.id);
    if (r) out[a.id] = r.mode;
  }
  return out;
}
