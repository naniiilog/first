/** 초대할 수 있는 AI 에이전트 종류(아이콘·색·기본 이름에 쓰여요) */
export interface AiKind {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** 그 앱에서 초대 링크를 커넥터로 넣는 방법 */
  howTo: string;
}

const GENERIC = '이 에이전트가 "MCP 커넥터"나 "원격 MCP 서버"를 지원하면, 그 설정에 초대 링크를 붙여넣어요(인증 없음).';

export const AI_KINDS: AiKind[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    emoji: '🤖',
    color: '#10A37F',
    howTo: 'ChatGPT 웹 → 설정 → 앱 및 커넥터 → 고급 설정에서 개발자 모드 켜기 → 만들기 → 초대 링크를 URL에 붙여넣고 인증 "없음". (유료 요금제에서만 돼요)',
  },
  { id: 'gemini', name: '제미나이', emoji: '✨', color: '#4285F4', howTo: GENERIC },
  {
    id: 'claude',
    name: '클로드',
    emoji: '🧠',
    color: '#D97757',
    howTo: '클로드 → 설정(맞춤 설정) → 커넥터 → 사용자 지정 커넥터 추가 → 초대 링크를 URL에 붙여넣기. (무료 요금제는 1개까지)',
  },
  { id: 'muse', name: '뮤즈', emoji: '🎨', color: '#0866FF', howTo: GENERIC },
  { id: 'grok', name: '그록봇', emoji: '⚡', color: '#6B6B6B', howTo: GENERIC },
  { id: 'pickle', name: '피클', emoji: '🥒', color: '#5FA83A', howTo: GENERIC },
  { id: 'buoy', name: '부이', emoji: '🛟', color: '#E8603C', howTo: GENERIC },
  { id: 'keyring', name: '키링', emoji: '🔑', color: '#D4A017', howTo: GENERIC },
  { id: 'q', name: '큐', emoji: '❓', color: '#8E44AD', howTo: GENERIC },
  { id: 'instinct', name: '인스팅트', emoji: '🎯', color: '#C0392B', howTo: GENERIC },
  { id: 'other', name: '다른 에이전트', emoji: '🛸', color: '#607D8B', howTo: GENERIC },
];

export const AI_BY_ID: Record<string, AiKind> = Object.fromEntries(AI_KINDS.map((a) => [a.id, a]));
export const aiOf = (id: string): AiKind => AI_BY_ID[id] ?? AI_BY_ID.other;

/** 에이전트에게 처음 시킬 말(복사해서 그 앱에 붙여넣기) */
export const KICKOFF_PROMPT =
  'BotRoom 커넥터로 채팅방에 들어가서 room_info와 read_messages로 상황을 보고 대화에 참여해줘. 새 메시지는 wait_for_messages로 기다렸다가 짧게 답하면서 몇 번 이어가줘.';
