import type { Turn } from './providers';
import { USER_ID, type Bot, type ChatMessage } from './types';

/**
 * 단체방 대화 기록을 특정 봇 시점의 1:1 대화로 바꿉니다.
 * - 그 봇이 한 말 → assistant
 * - 나와 다른 봇들이 한 말 → user ("[이름] 내용" 형식으로 누가 말했는지 표시)
 * 연속된 같은 역할의 메시지는 하나로 합칩니다(대부분의 API가 역할 교대를 요구).
 */
export function buildTurns(
  bot: Bot,
  messages: ChatMessage[],
  botsById: Record<string, Bot>,
  userName: string,
  mode: 'reply' | 'debate',
): Turn[] {
  const turns: Turn[] = [];
  const push = (role: Turn['role'], content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  };

  for (const m of messages) {
    if (m.error) continue;
    if (m.authorId === bot.id) {
      push('assistant', m.text);
    } else {
      const name = m.authorId === USER_ID ? userName : botsById[m.authorId]?.name ?? '알 수 없는 봇';
      push('user', `[${name}] ${m.text}`);
    }
  }

  // 대화는 user로 시작하고 user로 끝나야 합니다.
  if (turns.length === 0 || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: '[시스템] 대화방이 열렸어요.' });
  }
  if (turns[turns.length - 1].role !== 'user') {
    push(
      'user',
      mode === 'debate'
        ? '[시스템] 이어서 다른 멤버의 의견에 반응하며 대화를 계속해 주세요.'
        : '[시스템] 이어서 말해 주세요.',
    );
  }
  return turns;
}

export function buildSystemPrompt(bot: Bot, roomBots: Bot[], userName: string, mode: 'reply' | 'debate'): string {
  const others = roomBots.filter((b) => b.id !== bot.id).map((b) => b.name);
  const members = [userName, ...others].join(', ');
  return [
    `너의 이름은 "${bot.name}"이고, 여러 AI가 함께 있는 단체 채팅방에 참여하고 있어.`,
    `너의 성격과 역할: ${bot.persona || '친절하고 똑똑한 대화 상대'}`,
    `채팅방의 다른 멤버: ${members || '없음'}.`,
    '다른 사람의 메시지는 "[이름] 내용" 형식으로 전달돼. 네 답장 앞에는 이름표를 붙이지 말고 네 말만 해.',
    '다른 멤버를 흉내 내거나 그들의 대사를 대신 쓰지 마.',
    mode === 'debate'
      ? '지금은 봇들끼리 토론 중이야. 앞 사람 말에 동의하거나 반박하면서 자기 관점을 분명히 드러내.'
      : '방금 들어온 메시지에 답하고, 필요하면 앞서 다른 봇이 한 말도 참고해.',
    '단체 채팅이니까 2~4문장 정도로 짧고 자연스럽게 말해. 사용자가 다른 언어를 쓰지 않는 한 한국어로 답해.',
  ].join('\n');
}
