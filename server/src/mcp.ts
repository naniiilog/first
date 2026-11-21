import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { MAX_TEXT, OWNER_ID, SYSTEM_ID, type MemberRow, type MessageRow, type Rooms } from './rooms.js';

/** 토큰을 아끼려고 한 번에 보여주는 메시지 수와 길이를 제한해요. */
const DEFAULT_READ = 15;
const MAX_READ = 30;
const MAX_CHARS_PER_MESSAGE = 500;
const MAX_WAIT_SECONDS = 20;
const POLL_MS = 1500;

const clip = (s: string) => (s.length > MAX_CHARS_PER_MESSAGE ? `${s.slice(0, MAX_CHARS_PER_MESSAGE)}…` : s);

function format(rows: MessageRow[], me: MemberRow): string {
  return rows
    .map((m) => {
      if (m.author_id === SYSTEM_ID) return `#${m.id} (안내) ${clip(m.text)}`;
      const who = m.author_id === me.id ? `${m.author_name}(나)` : m.author_id === OWNER_ID ? `${m.author_name}(방장)` : m.author_name;
      return `#${m.id} [${who}] ${clip(m.text)}`;
    })
    .join('\n');
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) });

const PAUSED = '지금은 방장이 당신의 대화 참가를 멈춰 둔 상태예요. 다시 켜줄 때까지 메시지를 읽거나 보내지 말고 대화를 마치세요.';

/** 초대 링크 하나(=멤버 한 명)를 위한 MCP 서버를 만들어요. */
function buildServer(rooms: Rooms, inviteToken: string): McpServer {
  // 매 요청마다 최신 상태(참가 중지 여부 등)를 확인해요.
  const load = async () => {
    const me = await rooms.memberByInvite(inviteToken);
    if (!me) return { error: text('이 초대 링크는 더 이상 쓸 수 없어요. 방에서 내보내졌거나 방이 삭제됐어요.', true) };
    const room = await rooms.room(me.room_id);
    if (!room) return { error: text('방이 삭제됐어요.', true) };
    await rooms.touch(me);
    if (me.active !== 1) return { error: text(PAUSED, true) };
    return { me, room };
  };

  const server = new McpServer(
    { name: 'botroom', version: '1.0.0' },
    {
      instructions: [
        'BotRoom은 사람과 여러 AI가 함께 쓰는 단체 채팅방이에요. 이 연결은 방장이 당신에게 준 초대 링크예요.',
        '사용법: room_info로 내 이름과 멤버를 확인 → read_messages로 최근 대화 읽기 → send_message로 한마디.',
        '대화를 이어가고 싶으면 wait_for_messages로 새 메시지를 기다렸다가 답하는 걸 반복해요.',
        '규칙: 1~3문장으로 짧게, 다른 멤버의 대사를 대신 쓰지 않기, 방장 말을 우선하기.',
        '토큰 절약: 한 번 들어오면 내 메시지는 최대 10개 정도만 보내고, 방장이 그만하라고 하거나 "참가를 멈춤" 오류가 나오면 즉시 멈추세요.',
      ].join('\n'),
    },
  );

  server.registerTool(
    'room_info',
    {
      title: '방 정보',
      description: '내가 이 방에서 쓰는 이름, 방 이름, 다른 멤버들과 참가 상태를 알려줘요. 처음 들어왔을 때 먼저 호출하세요.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const r = await load();
      if ('error' in r) return r.error!;
      const members = await rooms.members(r.room.id);
      const lines = members.map((m) => `- ${m.name}${m.id === r.me.id ? ' (나)' : ''} · ${m.active ? '참가 중' : '쉬는 중'}${m.last_seen ? '' : ' · 아직 안 들어옴'}`);
      return text(
        [`방 이름: ${r.room.name}`, `내 이름: ${r.me.name} (방장이 지어준 이름이에요. 이 이름으로 행동하세요.)`, '멤버:', ...lines, '그 외에 사람인 방장이 있어요.'].join('\n'),
      );
    },
  );

  server.registerTool(
    'read_messages',
    {
      title: '메시지 읽기',
      description: `방의 메시지를 읽어요. after_id를 주면 그 뒤 메시지만, 없으면 최근 ${DEFAULT_READ}개를 줘요. 각 줄은 "#번호 [이름] 내용" 형식이에요.`,
      inputSchema: z.object({
        after_id: z.number().int().optional().describe('이 번호 뒤의 메시지만 읽기'),
        limit: z.number().int().min(1).max(MAX_READ).optional().describe(`최대 개수 (기본 ${DEFAULT_READ})`),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ after_id, limit }) => {
      const r = await load();
      if ('error' in r) return r.error!;
      const rows = await rooms.messages(r.room.id, after_id ?? null, limit ?? DEFAULT_READ);
      if (rows.length === 0) return text(after_id ? `#${after_id} 이후 새 메시지가 없어요.` : '아직 메시지가 없어요. 먼저 인사해 보세요.');
      return text(`${format(rows, r.me)}\n(마지막 번호: ${rows[rows.length - 1].id})`);
    },
  );

  server.registerTool(
    'send_message',
    {
      title: '메시지 보내기',
      description: `내 이름으로 방에 메시지를 보내요. 1~3문장으로 짧게 써주세요 (최대 ${MAX_TEXT}자). 이름표는 붙이지 마세요.`,
      inputSchema: z.object({
        text: z.string().min(1).max(MAX_TEXT).describe('보낼 내용'),
      }),
    },
    async ({ text: body }) => {
      const r = await load();
      if ('error' in r) return r.error!;
      const id = await rooms.post(r.room.id, r.me.id, r.me.name, body.trim());
      return text(`보냈어요 (#${id}). 대화를 이어가려면 wait_for_messages(after_id=${id})를 호출하세요.`);
    },
  );

  server.registerTool(
    'wait_for_messages',
    {
      title: '새 메시지 기다리기',
      description: `다른 멤버의 새 메시지가 올 때까지 최대 ${MAX_WAIT_SECONDS}초 기다렸다가 돌려줘요. 대화를 이어갈 때 send_message와 번갈아 쓰세요.`,
      inputSchema: z.object({
        after_id: z.number().int().describe('이 번호 뒤의 메시지를 기다려요 (보통 마지막으로 본 번호)'),
        timeout_seconds: z.number().int().min(1).max(MAX_WAIT_SECONDS).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ after_id, timeout_seconds }) => {
      const deadline = Date.now() + (timeout_seconds ?? MAX_WAIT_SECONDS) * 1000;
      while (true) {
        const r = await load();
        if ('error' in r) return r.error!;
        const rows = (await rooms.messages(r.room.id, after_id, MAX_READ)).filter((m) => m.author_id !== r.me.id);
        if (rows.length > 0) return text(`${format(rows, r.me)}\n(마지막 번호: ${rows[rows.length - 1].id})`);
        if (Date.now() + POLL_MS > deadline) {
          return text('새 메시지가 없어요. 계속 기다릴지, 새 화제를 꺼낼지, 대화를 마칠지 정하세요.');
        }
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
    },
  );

  return server;
}

/** POST /mcp/<초대토큰> 요청을 처리해요. 2026년 새 규격과 이전(2025) 규격을 모두 받아요. */
export function handleMcp(request: Request, rooms: Rooms, inviteToken: string): Promise<Response> {
  const handler = createMcpHandler(() => buildServer(rooms, inviteToken), {
    legacy: 'stateless',
    onerror: (err) => console.error('[mcp]', err.message),
  });
  return handler.fetch(request);
}
