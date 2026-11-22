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

export class Rooms {
  constructor(private db: Db) {}

  async createRoom(name: string) {
    const room: RoomRow = { id: randomToken(8), name, owner_token: randomToken(24), created_at: Date.now(), free_talk: 0, closed: 0 };
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
    await this.post(
      room.id,
      SYSTEM_ID,
      '안내',
      on ? '자동대화를 켰어요. 에이전트들이 멈추지 않고 계속 대화를 이어가요.' : '자동대화를 껐어요. 이제 이름을 불러야 답해요.',
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
    };
    await this.db.run(
      'INSERT INTO members (id, room_id, kind, name, invite_token, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      m.id, m.room_id, m.kind, m.name, m.invite_token, m.active, m.created_at,
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
