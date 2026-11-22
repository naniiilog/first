import { resetForKind } from './usage.js';
import type { Db } from './db.js';

export const OWNER_ID = 'owner';
export const SYSTEM_ID = 'system';
export const MAX_TEXT = 1000;

export interface RoomRow {
  id: string;
  name: string;
  owner_token: string;
  created_at: number;
  free_talk: number;
  /** 1이면 '봇 모두 쉬게 하기' 상태: 에이전트가 들어와도 바로 대화를 마치라고 안내해요 */
  closed: number;
  /** 봇이 방을 확인하는 간격(분). 0이면 실시간 */
  check_interval_min: number;
  /** 매너타임: 이 시간에는 봇이 확인도 말도 안 해요(방장이 이름을 부르면 예외) */
  quiet_enabled: number;
  quiet_start: number;
  quiet_end: number;
  /** 매너타임을 계산할 시간대 */
  tz: string;
}

export interface MemberRow {
  id: string;
  room_id: string;
  kind: string;
  name: string;
  invite_token: string;
  active: number;
  created_at: number;
  last_seen: number | null;
  /** 프로필: 'emoji:🦊:#hex' 또는 작은 사진(data:image/...) 또는 null(기본) */
  avatar: string | null;
  /** 이 에이전트가 마지막으로 읽은 메시지 번호(서버가 대신 기억해요) */
  read_cursor: number;
  /** 마지막으로 방을 확인한 시각(확인 간격 계산용) */
  last_check: number | null;
  /** 이번 사용 주기 시작 시각과 그동안 센 양 */
  use_start: number | null;
  use_calls: number;
  use_sent: number;
  use_in: number;
  use_out: number;
  /** 초기화 주기: 'daily'(매일 reset_value시) | 'hours'(reset_value시간마다) */
  reset_mode: string;
  reset_value: number;
}

export interface MessageRow {
  id: number;
  room_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: number;
  /** 답장한 원래 메시지 번호 */
  reply_to: number | null;
  /** 사진(data:image/...;base64,...) */
  image: string | null;
}

/** 추측하기 어려운 무작위 문자열(초대 링크·방장 토큰에 써요) */
export function randomToken(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
}

export const publicMember = (m: MemberRow) => ({
  id: m.id,
  kind: m.kind,
  name: m.name,
  active: m.active === 1,
  joined: m.last_seen !== null,
  avatar: m.avatar ?? null,
  // 분 단위로만 알려줘요(에이전트가 확인할 때마다 값이 바뀌면 '바뀐 게 없으면 304'가 안 먹혀서).
  lastSeen: m.last_seen === null ? null : Math.floor(m.last_seen / 60_000) * 60_000,
  createdAt: m.created_at,
});

export const publicMessage = (m: MessageRow) => ({
  id: m.id,
  authorId: m.author_id,
  authorName: m.author_name,
  text: m.text,
  createdAt: m.created_at,
  replyTo: m.reply_to ?? null,
  image: m.image ?? null,
});

const pad2 = (n: number) => String(n).padStart(2, '0');

export class Rooms {
  constructor(private db: Db) {}

  async createRoom(name: string) {
    const room: RoomRow = { id: randomToken(8), name, owner_token: randomToken(24), created_at: Date.now(), free_talk: 0, closed: 0, check_interval_min: 30, quiet_enabled: 1, quiet_start: 0, quiet_end: 9, tz: 'Asia/Seoul' };
    await this.db.run('INSERT INTO rooms (id, name, owner_token, created_at) VALUES (?, ?, ?, ?)', room.id, room.name, room.owner_token, room.created_at);
    return room;
  }

  room(id: string) {
    return this.db.first<RoomRow>('SELECT * FROM rooms WHERE id = ?', id);
  }

  renameRoom(id: string, name: string) {
    return this.db.run('UPDATE rooms SET name = ? WHERE id = ?', name, id);
  }

  async setFreeTalk(room: RoomRow, on: boolean) {
    if ((on ? 1 : 0) === room.free_talk) return;
    await this.db.run('UPDATE rooms SET free_talk = ? WHERE id = ?', on ? 1 : 0, room.id);
    if (!on) {
      await this.post(room.id, SYSTEM_ID, '안내', '자동대화를 껐어요. 이제 이름을 불러야 답해요.');
      return;
    }
    // 다봇은 멈춘 봇을 깨울 수 없어요. 켤 때 누가 아직 연결돼 있고 누구를 다시 불러야 하는지 알려줘요.
    const active = (await this.members(room.id)).filter((m) => m.active === 1);
    const now = Date.now();
    // 확인 간격이 있는 방이면 그 간격(+2분) 안에 확인한 봇도 아직 연결된 걸로 봐요.
    const window = room.check_interval_min > 0 ? room.check_interval_min * 60_000 + 120_000 : 90_000;
    const online = active.filter((m) => m.last_seen !== null && now - m.last_seen < window);
    const away = active.filter((m) => !online.includes(m));
    const parts = ['자동대화를 켰어요.'];
    if (active.length) {
      parts.push(`지금 연결된 봇: ${online.length ? online.map((m) => m.name).join(', ') : '없음'}`);
      if (away.length) {
        parts.push(`다시 불러야 하는 봇: ${away.map((m) => m.name).join(', ')} → 멤버 화면의 '다시 부르기'를 누르거나, 그 AI 앱에서 "다봇 방에 다시 들어가서 대화해줘"라고 말해 주세요.`);
      } else {
        parts.push('모두 연결돼 있어요.');
      }
    }
    await this.post(room.id, SYSTEM_ID, '안내', parts.join('\n'));
  }

  /** 확인 간격·매너타임 바꾸기 */
  async setSchedule(room: RoomRow, patch: { checkIntervalMin?: number; quietEnabled?: boolean; quietStart?: number; quietEnd?: number; tz?: string }) {
    const next = {
      check_interval_min: patch.checkIntervalMin ?? room.check_interval_min,
      quiet_enabled: patch.quietEnabled === undefined ? room.quiet_enabled : patch.quietEnabled ? 1 : 0,
      quiet_start: patch.quietStart ?? room.quiet_start,
      quiet_end: patch.quietEnd ?? room.quiet_end,
      tz: patch.tz ?? room.tz,
    };
    await this.db.run(
      'UPDATE rooms SET check_interval_min = ?, quiet_enabled = ?, quiet_start = ?, quiet_end = ?, tz = ? WHERE id = ?',
      next.check_interval_min, next.quiet_enabled, next.quiet_start, next.quiet_end, next.tz, room.id,
    );
    const interval = next.check_interval_min === 0 ? '실시간' : `${next.check_interval_min}분마다`;
    const quiet = next.quiet_enabled ? `매너타임 ${pad2(next.quiet_start)}:00~${pad2(next.quiet_end)}:00` : '매너타임 없음';
    await this.post(room.id, SYSTEM_ID, '안내', `방 설정을 바꿨어요. 봇 확인: ${interval} · ${quiet}`);
  }

  /** 확인 간격 계산용으로 '마지막 확인 시각'을 남겨요. */
  /** 사용량 더하기. fresh면 새 주기를 start부터 시작해요. */
  addUsage(memberId: string, fresh: boolean, start: number, u: { inChars: number; outChars: number; sent: number }) {
    if (fresh) {
      return this.db.run(
        'UPDATE members SET use_start = ?, use_calls = 1, use_in = ?, use_out = ?, use_sent = ? WHERE id = ?',
        start, u.inChars, u.outChars, u.sent, memberId,
      );
    }
    return this.db.run(
      'UPDATE members SET use_calls = use_calls + 1, use_in = use_in + ?, use_out = use_out + ?, use_sent = use_sent + ? WHERE id = ?',
      u.inChars, u.outChars, u.sent, memberId,
    );
  }

  setReset(memberId: string, mode: string, value: number) {
    return this.db.run('UPDATE members SET reset_mode = ?, reset_value = ? WHERE id = ?', mode, value, memberId);
  }

  /** 지금 바로 0으로 */
  clearUsage(memberId: string) {
    return this.db.run('UPDATE members SET use_start = NULL, use_calls = 0, use_in = 0, use_out = 0, use_sent = 0 WHERE id = ?', memberId);
  }

  /** 봇별 누적 메시지 수 */
  messageCounts(roomId: string) {
    return this.db.all<{ author_id: string; n: number }>('SELECT author_id, COUNT(*) AS n FROM messages WHERE room_id = ? GROUP BY author_id', roomId);
  }

  markChecked(memberId: string) {
    return this.db.run('UPDATE members SET last_check = ? WHERE id = ?', Date.now(), memberId);
  }

  /** 방장이 afterId 뒤에 쓴 글(확인 간격·매너타임 예외 판단용) */
  ownerMessagesAfter(roomId: string, afterId: number) {
    return this.db.all<Pick<MessageRow, 'id' | 'text'>>(
      'SELECT id, text FROM messages WHERE room_id = ? AND author_id = ? AND id > ? ORDER BY id LIMIT 50',
      roomId, OWNER_ID, afterId,
    );
  }

  /** 봇 모두 쉬게 하기 / 다시 부르기 (대화 내용과 초대 링크는 그대로) */
  async setClosed(room: RoomRow, closed: boolean) {
    if ((closed ? 1 : 0) === room.closed) return;
    await this.db.run('UPDATE rooms SET closed = ? WHERE id = ?', closed ? 1 : 0, room.id);
    await this.post(
      room.id,
      SYSTEM_ID,
      '안내',
      closed
        ? '봇들을 모두 쉬게 했어요. 대화 내용과 초대 링크는 그대로이고, 봇들은 토큰을 쓰지 않아요.'
        : '봇들을 다시 불렀어요. 각 에이전트 앱에서 "다봇 방에 다시 들어가"라고 말해 주세요.',
    );
  }

  async deleteRoom(id: string) {
    await this.db.run('DELETE FROM messages WHERE room_id = ?', id);
    await this.db.run('DELETE FROM members WHERE room_id = ?', id);
    await this.db.run('DELETE FROM rooms WHERE id = ?', id);
  }

  members(roomId: string) {
    return this.db.all<MemberRow>('SELECT * FROM members WHERE room_id = ? ORDER BY created_at', roomId);
  }

  member(roomId: string, memberId: string) {
    return this.db.first<MemberRow>('SELECT * FROM members WHERE room_id = ? AND id = ?', roomId, memberId);
  }

  /** 기다리는 동안 가볍게 확인하는 용도: 참가 상태와 방의 자동대화 상태를 한 번에 읽어요. 없으면 null(내보내짐). */
  memberStatus(memberId: string) {
    return this.db.first<{ active: number; free_talk: number; closed: number }>(
      'SELECT m.active AS active, r.free_talk AS free_talk, r.closed AS closed FROM members m JOIN rooms r ON r.id = m.room_id WHERE m.id = ?',
      memberId,
    );
  }

  /** 내가 마지막으로 말한 뒤에 다른 사람이 보낸 메시지들(안내 제외) */
  messagesSinceMine(roomId: string, memberId: string) {
    return this.db.all<MessageRow>(
      `SELECT * FROM messages WHERE room_id = ? AND author_id NOT IN (?, ?)
         AND id > (SELECT COALESCE(MAX(id), 0) FROM messages WHERE room_id = ? AND author_id = ?)
       ORDER BY id DESC LIMIT 200`,
      roomId, memberId, SYSTEM_ID, roomId, memberId,
    );
  }

  memberByInvite(token: string) {
    return this.db.first<MemberRow>('SELECT * FROM members WHERE invite_token = ?', token);
  }

  async addMember(roomId: string, kind: string, name: string) {
    const m: MemberRow = {
      id: randomToken(6),
      room_id: roomId,
      kind,
      name,
      invite_token: randomToken(18),
      active: 1,
      created_at: Date.now(),
      last_seen: null,
      avatar: null,
      read_cursor: 0,
      last_check: null,
      use_start: null,
      use_calls: 0,
      use_sent: 0,
      use_in: 0,
      use_out: 0,
      reset_mode: resetForKind(kind).mode,
      reset_value: resetForKind(kind).value,
    };
    await this.db.run(
      'INSERT INTO members (id, room_id, kind, name, invite_token, active, created_at, reset_mode, reset_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      m.id, m.room_id, m.kind, m.name, m.invite_token, m.active, m.created_at, m.reset_mode, m.reset_value,
    );
    await this.post(roomId, SYSTEM_ID, '안내', `${name} 님을 초대했어요.`);
    return m;
  }

  async updateMember(m: MemberRow, patch: { name?: string; active?: boolean; avatar?: string | null }) {
    if (patch.name !== undefined) await this.db.run('UPDATE members SET name = ? WHERE id = ?', patch.name, m.id);
    if (patch.avatar !== undefined) await this.db.run('UPDATE members SET avatar = ? WHERE id = ?', patch.avatar, m.id);
    if (patch.active !== undefined && (patch.active ? 1 : 0) !== m.active) {
      await this.db.run('UPDATE members SET active = ? WHERE id = ?', patch.active ? 1 : 0, m.id);
      const name = patch.name ?? m.name;
      await this.post(m.room_id, SYSTEM_ID, '안내', patch.active ? `${name} 님이 다시 대화에 참가해요.` : `${name} 님의 대화 참가를 멈췄어요.`);
    }
  }

  async removeMember(m: MemberRow) {
    await this.db.run('DELETE FROM members WHERE id = ?', m.id);
    await this.post(m.room_id, SYSTEM_ID, '안내', `${m.name} 님이 나갔어요.`);
  }

  touch(m: MemberRow) {
    const first = m.last_seen === null;
    m.last_seen = Date.now();
    return this.db.run('UPDATE members SET last_seen = ? WHERE id = ?', m.last_seen, m.id).then(async () => {
      if (first) await this.post(m.room_id, SYSTEM_ID, '안내', `${m.name} 님이 들어왔어요.`);
    });
  }

  async post(roomId: string, authorId: string, authorName: string, text: string, opts: { replyTo?: number | null; image?: string | null } = {}) {
    const createdAt = Date.now();
    const r = await this.db.run(
      'INSERT INTO messages (room_id, author_id, author_name, text, created_at, reply_to, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      roomId, authorId, authorName, text.slice(0, MAX_TEXT), createdAt, opts.replyTo ?? null, opts.image ?? null,
    );
    return r.lastId;
  }

  /** 서버가 기억하는 '마지막으로 읽은 번호'를 앞으로만 옮겨요. */
  setCursor(memberId: string, id: number) {
    return this.db.run('UPDATE members SET read_cursor = MAX(read_cursor, ?) WHERE id = ?', id, memberId);
  }

  /** 내가 마지막으로 보낸 메시지(같은 말 반복 막기용) */
  lastMessageBy(roomId: string, authorId: string) {
    return this.db.first<MessageRow>('SELECT * FROM messages WHERE room_id = ? AND author_id = ? ORDER BY id DESC LIMIT 1', roomId, authorId);
  }

  message(roomId: string, id: number) {
    return this.db.first<MessageRow>('SELECT * FROM messages WHERE room_id = ? AND id = ?', roomId, id);
  }

  /** 차례대로 답하기용: 방장의 가장 최근 질문과 그 뒤 메시지들(번호·작성자·시간·글만) */
  relayRows(roomId: string) {
    return this.db.all<Pick<MessageRow, 'id' | 'author_id' | 'created_at' | 'text'>>(
      `SELECT id, author_id, created_at, text FROM messages
        WHERE room_id = ? AND id >= COALESCE((SELECT MAX(id) FROM messages WHERE room_id = ? AND author_id = ?), 0)
        ORDER BY id LIMIT 200`,
      roomId, roomId, OWNER_ID,
    );
  }

  /** afterId 다음 메시지들(오래된 순). afterId가 없으면 최근 limit개. */
  async messages(roomId: string, afterId: number | null, limit: number) {
    if (afterId === null) {
      const rows = await this.db.all<MessageRow>('SELECT * FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?', roomId, limit);
      return rows.reverse();
    }
    return this.db.all<MessageRow>('SELECT * FROM messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT ?', roomId, afterId, limit);
  }
}
