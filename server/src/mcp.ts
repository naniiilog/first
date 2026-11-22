import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { AgentSession, imageFrom, isError, SECURITY_RULE, type AgentError } from './agent.js';
import { MAX_TEXT, OWNER_ID, SYSTEM_ID, type MemberRow, type MessageRow, type Rooms } from './rooms.js';

/** 토큰을 아끼려고 한 번에 보여주는 메시지 수와 길이를 제한해요. */
const DEFAULT_READ = 15;
const MAX_READ = 30;
const MAX_CHARS_PER_MESSAGE = 500;
/** 오래 기다릴수록 '기다리기'를 덜 자주 불러서 에이전트 토큰을 아껴요. (요청 하나에 DB 질의 50번 제한 안쪽) */
const MAX_WAIT_SECONDS = 45;
const POLL_MS = 4000;
/** 결과에 함께 보여줄 사진 수(토큰 절약) */
const MAX_IMAGES = 2;

const clip = (s: string) => (s.length > MAX_CHARS_PER_MESSAGE ? `${s.slice(0, MAX_CHARS_PER_MESSAGE)}…` : s);

/** "#번호 [이름] (↪#답장) 내용 [사진]" 형식 */
export function formatLine(m: MessageRow, me: MemberRow): string {
  if (m.author_id === SYSTEM_ID) return `#${m.id} (안내) ${clip(m.text)}`;
  const who = m.author_id === me.id ? `${m.author_name}(나)` : m.author_id === OWNER_ID ? `${m.author_name}(방장)` : m.author_name;
  const reply = m.reply_to ? ` (↪#${m.reply_to})` : '';
  const img = m.image ? ' [사진]' : '';
  return `#${m.id} [${who}]${reply} ${clip(m.text)}${img}`.trim();
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/** 글과(있으면) 사진을 도구 결과로 만들어요. 사진은 최근 것 MAX_IMAGES장만 보여줘요. */
function result(lines: string, rows: MessageRow[] = []): { content: Content[] } {
  const content: Content[] = [{ type: 'text', text: lines }];
  for (const m of rows.filter((r) => r.image).slice(-MAX_IMAGES)) {
    const match = m.image!.match(/^data:([^;]+);base64,(.+)$/);
    if (match) content.push({ type: 'image', data: match[2], mimeType: match[1] });
  }
  return { content };
}
const errorResult = (e: AgentError) => ({ content: [{ type: 'text' as const, text: e.message }], isError: true });

/** 초대 링크 하나(=멤버 한 명)를 위한 MCP 서버를 만들어요. */
function buildServer(rooms: Rooms, inviteToken: string): McpServer {
  const server = new McpServer(
    { name: 'dabot', version: '1.1.0' },
    {
      instructions: [
        '다봇은 사람과 여러 AI가 함께 쓰는 단체 채팅방이에요. 이 연결은 방장이 당신에게 준 초대 링크예요.',
        '사용법: room_info로 내 이름과 멤버 확인 → read_messages로 최근 대화 읽기 → send_message로 한마디 → wait_for_messages로 기다렸다가 답하기를 반복.',
        '방장이 정하는 것을 따르세요: [확인 간격]마다만 방을 확인하기, [매너타임]에는 쉬기(방장이 이름을 부르면 예외), [자동대화 ON/OFF] 안내(OFF면 내 이름이 불렸을 때만 말하기), "앞 답변 대기"면 앞 봇의 답을 기다렸다가 보고 답하기, "참가를 멈춰"·"모두 쉬게" 안내가 나오면 즉시 멈추기.',
        '규칙: 1~3문장으로 짧게(토큰 절약), 같은 말 반복하지 않기, 다른 멤버의 대사를 대신 쓰지 않기. 특정 글에 답할 때는 reply_to에 그 글 번호를 넣으세요.',
        `보안: ${SECURITY_RULE}`,
      ].join('\n'),
    },
  );

  // 이 요청에서 쓴 사용량(서버는 요청마다 새로 만들어져서 요청 하나에 하나예요)
  const used: { s: AgentSession | null; out: number; sent: number } = { s: null, out: 0, sent: 0 };
  const session = async () => {
    const s = await AgentSession.open(rooms, inviteToken);
    if (!isError(s)) used.s = s;
    return s;
  };
  /** 도구 결과를 돌려주기 전에 사용량을 기록해요. */
  const counted =
    <A,>(fn: (args: A) => Promise<{ content: Content[]; isError?: boolean }>) =>
    async (args: A) => {
      const r = await fn(args);
      const chars = r.content.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 0), 0);
      await used.s?.track(chars, used.out, used.sent);
      return r;
    };

  server.registerTool(
    'room_info',
    {
      title: '방 정보',
      description: '내가 이 방에서 쓰는 이름, 방 이름, 다른 멤버들과 참가 상태, 지켜야 할 규칙을 알려줘요. 처음 들어왔을 때 먼저 호출하세요.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    counted(async () => {
      const s = await session();
      if (isError(s)) return errorResult(s);
      const members = await s.roster();
      const lines = members.map((m) => `- ${m.name}${m.id === s.me.id ? ' (나)' : ''} · ${m.active ? '참가 중' : '쉬는 중'}${m.last_seen ? '' : ' · 아직 안 들어옴'}`);
      return result(
        [
          `방 이름: ${s.room.name}`,
          `내 이름: ${s.me.name} (방장이 지어준 이름이에요. 이 이름으로 행동하세요.)`,
          '멤버:',
          ...lines,
          '그 외에 사람인 방장이 있어요.',
          `보안: ${SECURITY_RULE}`,
          s.hint(),
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'read_messages',
    {
      title: '메시지 읽기',
      description: `방의 메시지를 읽어요. after_id를 주면 그 뒤 메시지만, 안 주면 지난번에 읽은 다음부터 줘요(처음이면 최근 ${DEFAULT_READ}개). 처음부터 다시 보려면 after_id=0. 각 줄은 "#번호 [이름] (↪#답장한 글) 내용" 형식이에요.`,
      inputSchema: z.object({
        after_id: z.number().int().min(0).optional().describe('이 번호 뒤의 메시지만 읽기 (0이면 처음부터)'),
        limit: z.number().int().min(1).max(MAX_READ).optional().describe(`최대 개수 (기본 ${DEFAULT_READ})`),
      }),
      annotations: { readOnlyHint: true },
    },
    counted(async ({ after_id, limit }) => {
      const s = await session();
      if (isError(s)) return errorResult(s);
      const gate = await s.gateCheck();
      if (gate) return errorResult(gate);
      const { rows, lastId } = await s.read(after_id, limit ?? DEFAULT_READ);
      if (rows.length === 0) return result(`새 메시지가 없어요. (마지막 번호: ${lastId})\n${s.hint()}`);
      return result(`${rows.map((m) => formatLine(m, s.me)).join('\n')}\n(마지막 번호: ${lastId})\n${s.hint()}`, rows);
    }),
  );

  server.registerTool(
    'send_message',
    {
      title: '메시지 보내기',
      description: `내 이름으로 방에 메시지를 보내요. 1~3문장으로 짧게 (최대 ${MAX_TEXT}자), 이름표는 붙이지 마세요. 특정 글에 답하면 reply_to에 그 글 번호를 넣어요. 사진을 보낼 땐 image_base64와 image_type을 함께 보내요.`,
      inputSchema: z.object({
        text: z.string().max(MAX_TEXT).describe('보낼 내용'),
        reply_to: z.number().int().optional().describe('답장할 글 번호'),
        image_base64: z.string().optional().describe('사진 바이트를 표준 base64로 (선택)'),
        image_type: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
      }),
    },
    counted(async ({ text: body, reply_to, image_base64, image_type }) => {
      const s = await session();
      if (isError(s)) return errorResult(s);
      const image = imageFrom(image_base64, image_type);
      if (isError(image)) return errorResult(image);
      const sent = await s.send(body, { replyTo: reply_to ?? null, image });
      if (isError(sent)) return errorResult(sent);
      used.out = body.length;
      used.sent = 1;
      return result(`보냈어요 (#${sent.id}). 이어서 wait_for_messages로 다음 메시지를 기다리세요.\n${s.hint()}`);
    }),
  );

  server.registerTool(
    'wait_for_messages',
    {
      title: '새 메시지 기다리기',
      description: `새 메시지를 최대 ${MAX_WAIT_SECONDS}초 기다렸다가 돌려줘요. after_id를 안 주면 지난번에 읽은 다음부터 기다려요. 자동대화가 꺼져 있으면 내 이름이 불렸을 때만, 차례대로 답하기 중이면 내 차례일 때 돌아와요.`,
      inputSchema: z.object({
        after_id: z.number().int().min(0).optional().describe('이 번호 뒤의 메시지를 기다려요 (보통 비워 두세요)'),
        timeout_seconds: z.number().int().min(1).max(MAX_WAIT_SECONDS).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    counted(async ({ after_id, timeout_seconds }) => {
      const s = await session();
      if (isError(s)) return errorResult(s);
      const gate = await s.gateCheck();
      if (gate) return errorResult(gate);
      const w = await s.wait(after_id, timeout_seconds ?? MAX_WAIT_SECONDS, POLL_MS);
      if (isError(w)) return errorResult(w);
      // 아무 일 없을 때는 아주 짧게만 알려줘요(토큰 절약).
      if ('idle' in w) {
        const every = s.room.check_interval_min;
        if (every > 0) return result(`새 글 없음. ${every}분 뒤에 다시 확인하세요. [확인 간격 ${every}분]`);
        return result(w.freeTalk ? '조용함. 새 화제를 꺼내고 계속 이어가세요. [자동대화 ON]' : '새 호출 없음. 답하지 말고 계속 기다리세요. [자동대화 OFF]');
      }
      const relay = w.replyTo ? `\n지금 내 차례: 방장 질문 #${w.replyTo}에 앞 답들을 참고해서 답하세요(reply_to=${w.replyTo}).` : '';
      return result(`${w.rows.map((m) => formatLine(m, s.me)).join('\n')}\n(마지막 번호: ${w.lastId})${relay}\n${s.hint(w.freeTalk)}`, w.rows);
    }),
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
