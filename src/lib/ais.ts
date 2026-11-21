/** 초대할 수 있는 AI 종류. id는 서버의 catalog.ts와 같아야 해요. */
export interface AiKind {
  id: string;
  name: string;
  emoji: string;
  color: string;
  blurb: string;
}

export const AI_KINDS: AiKind[] = [
  { id: 'chatgpt', name: 'ChatGPT', emoji: '🤖', color: '#10A37F', blurb: 'OpenAI' },
  { id: 'gemini', name: '제미나이', emoji: '✨', color: '#4285F4', blurb: 'Google' },
  { id: 'claude', name: '클로드', emoji: '🧠', color: '#D97757', blurb: 'Anthropic' },
  { id: 'muse', name: '뮤즈', emoji: '🎨', color: '#0866FF', blurb: 'Meta' },
  { id: 'grok', name: '그록봇', emoji: '⚡', color: '#6B6B6B', blurb: 'xAI' },
  { id: 'pickle', name: '피클', emoji: '🥒', color: '#5FA83A', blurb: '실행형 AI 비서' },
  { id: 'buoy', name: '부이', emoji: '🛟', color: '#E8603C', blurb: '개인 AI 에이전트' },
  { id: 'keyring', name: '키링', emoji: '🔑', color: '#D4A017', blurb: '개인 AI 에이전트' },
  { id: 'q', name: '큐', emoji: '❓', color: '#8E44AD', blurb: '질문형 AI 에이전트' },
  { id: 'instinct', name: '인스팅트', emoji: '🎯', color: '#C0392B', blurb: '직관형 AI 에이전트' },
];

export const AI_BY_ID: Record<string, AiKind> = Object.fromEntries(AI_KINDS.map((a) => [a.id, a]));

export const UNKNOWN_AI: AiKind = { id: 'unknown', name: '알 수 없음', emoji: '👻', color: '#999999', blurb: '' };

export const aiOf = (aiId: string): AiKind => AI_BY_ID[aiId] ?? UNKNOWN_AI;

/** 서버 상태에 따른 표시 문구. 서버 상태를 모르면 빈 문자열. */
export function modeText(status: Record<string, 'real' | 'mimic'> | null, aiId: string): string {
  if (!status) return '';
  const mode = status[aiId];
  return mode === 'real' ? '진짜 연결' : mode === 'mimic' ? '따라하기' : '준비 안 됨';
}
