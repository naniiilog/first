import type { Turn } from './api';
import { aiOf } from './ais';
import { SYSTEM_ID, USER_ID, type ChatMessage, type Member } from './types';

/** 토큰을 아끼려고 봇에게는 최근 메시지만 보여줘요. */
const CONTEXT_MESSAGES = 16;
/** 메시지 하나가 너무 길면 잘라서 보내요. */
const MAX_CHARS_PER_MESSAGE = 600;

export type Mode = 'reply' | 'free';

export const displayName = (m: Member) => m.name.trim() || aiOf(m.aiId).name;

const clip = (s: string) => (s.length > MAX_CHARS_PER_MESSAGE ? `${s.slice(0, MAX_CHARS_PER_MESSAGE)}…` : s);

/**
 * 단체방 대화 기록을 특정 봇 시점의 1:1 대화로 바꿔요.
 * - 그 봇이 한 말 → assistant
 * - 나와 다른 봇들이 한 말 → user ("[이름] 내용" 형식)
 * 연속된 같은 역할의 메시지는 하나로 합쳐요(대부분의 API가 역할 교대를 요구해요).
 */
export function buildTurns(me: Member, messages: ChatMessage[], members: Member[], userName: string, mode: Mode): Turn[] {
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const recent = messages.filter((m) => !m.error && m.authorId !== SYSTEM_ID).slice(-CONTEXT_MESSAGES);
  const turns: Turn[] = [];
  const push = (role: Turn['role'], content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  };

  for (const m of recent) {
    if (m.authorId === me.id) {
      push('assistant', clip(m.text));
    } else {
      const name = m.authorId === USER_ID ? userName : byId[m.authorId] ? displayName(byId[m.authorId]) : '나간 봇';
      push('user', `[${name}] ${clip(m.text)}`);
    }
  }

  if (turns.length === 0 || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: '[안내] 대화방이 열렸어요. 가볍게 인사하며 대화를 시작해 주세요.' });
  }
  if (turns[turns.length - 1].role !== 'user') {
    push('user', mode === 'free' ? '[안내] 다른 멤버들의 말에 반응하며 자연스럽게 대화를 이어가 주세요.' : '[안내] 이어서 말해 주세요.');
  }
  return turns;
}

export function buildSystemPrompt(me: Member, members: Member[], userName: string, mode: Mode): string {
  const others = members
    .filter((m) => m.id !== me.id)
    .map((m) => `${displayName(m)}(${aiOf(m.aiId).name}${m.active ? '' : ', 지금은 쉬는 중'})`);
  return [
    `너의 이름은 "${displayName(me)}"이고, 정체는 ${aiOf(me.aiId).name} AI야. 여러 AI가 함께 있는 단체 채팅방에 초대됐어.`,
    `채팅방 멤버: ${[`${userName}(초대한 사람)`, ...others].join(', ')}.`,
    '다른 사람의 메시지는 "[이름] 내용" 형식으로 전달돼. 네 답장 앞에는 이름표를 붙이지 말고 네 말만 해.',
    '다른 멤버의 대사를 대신 쓰지 마. 누군가에게 말을 걸고 싶으면 이름을 불러.',
    mode === 'free'
      ? '지금은 자유 대화 시간이야. 친구들끼리 단톡방에서 수다 떨듯 앞 사람 말에 반응하고, 가끔은 새 화제를 꺼내거나 질문도 던져.'
      : `방금 ${userName}이(가) 한 말에 답하고, 앞서 다른 봇이 한 말도 참고해.`,
    '단체 채팅이라 1~3문장으로 짧게 말해. 사용자가 다른 언어를 쓰지 않는 한 한국어로 말해.',
  ].join('\n');
}

/** 자유 대화에서 다음에 말할 봇을 골라요. */
export function pickNextSpeaker(members: Member[], messages: ChatMessage[]): Member | null {
  const active = members.filter((m) => m.active);
  if (active.length === 0) return null;
  const spoken = messages.filter((m) => m.authorId !== SYSTEM_ID && !m.error);
  const last = spoken[spoken.length - 1];
  const candidates = active.length > 1 ? active.filter((m) => m.id !== last?.authorId) : active;

  // 방금 메시지에서 이름이 불린 봇이 있으면 그 봇이 대답해요.
  if (last) {
    const called = candidates.find((m) => last.text.includes(displayName(m)));
    if (called) return called;
  }
  // 아니면 가장 오래 말 안 한 봇에게 가중치를 줘서 무작위로 골라요.
  const lastSpokeAt = (m: Member) => {
    for (let i = spoken.length - 1; i >= 0; i--) if (spoken[i].authorId === m.id) return i;
    return -1;
  };
  const weights = candidates.map((m) => spoken.length - lastSpokeAt(m));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
