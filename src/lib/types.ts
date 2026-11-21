export type ProviderId = 'anthropic' | 'openai' | 'google';

export interface Bot {
  id: string;
  name: string;
  emoji: string;
  color: string;
  provider: ProviderId;
  model: string;
  /** 성격·역할 설명. 시스템 프롬프트로 들어갑니다. */
  persona: string;
}

export interface ChatMessage {
  id: string;
  /** 'user'는 나, 그 외에는 봇 id */
  authorId: string;
  text: string;
  createdAt: number;
  error?: boolean;
}

export interface Room {
  id: string;
  name: string;
  botIds: string[];
  messages: ChatMessage[];
  createdAt: number;
}

export type ApiKeys = Record<ProviderId, string>;

export const USER_ID = 'user';
