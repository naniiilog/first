/** 채팅방에 초대된 봇 한 명 */
export interface Member {
  id: string;
  aiId: string;
  /** 초대한 사람이 지어준 이름. 비워두면 AI 이름을 써요. */
  name: string;
  /** false면 대화 참가 중지(쉬는 중) */
  active: boolean;
}

export interface ChatMessage {
  id: string;
  /** 'user'는 나, 'system'은 안내 문구, 그 외에는 멤버 id */
  authorId: string;
  text: string;
  createdAt: number;
  error?: boolean;
}

export interface Room {
  id: string;
  name: string;
  members: Member[];
  messages: ChatMessage[];
  createdAt: number;
  /** 이 방에서 쓴 토큰(입력+출력) */
  tokensUsed: number;
  /** 이만큼 쓰면 자유 대화가 자동으로 멈춰요 */
  tokenBudget: number;
}

export interface Settings {
  userName: string;
  serverUrl: string;
  appToken: string;
}

export const USER_ID = 'user';
export const SYSTEM_ID = 'system';
export const DEFAULT_TOKEN_BUDGET = 20_000;
