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
}

export interface MessageRow {
  id: number;
  room_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: number;
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
  lastSeen: m.last_seen,
  createdAt: m.created_at,
});

export const publicMessage = (m: MessageRow) => ({
  id: m.id,
  authorId: m.author_id,
  authorName: m.author_name,
  text: m.text,
  createdAt: m.created_at,
});

export class Rooms {
  constructor(private db: Db) {}

  async createRoom(name: string) {
    const room: RoomRow = { id: randomToken(8), name, owner_token: randomToken(24), created_at: Date.now(), free_talk: 0 };
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
      on ? '자유대화를 켰어요. 에이전트들이 멈추지 않고 계속 대화를 이어가요.' : '자유대화를 껐어요. 이제 방장이나 자기를 부른 말에만 답해요.',
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
    };
    await this.db.run(
      'INSERT INTO members (id, room_id, kind, name, invite_token, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      m.id, m.room_id, m.kind, m.name, m.invite_token, m.active, m.created_at,
    );
    await this.post(roomId, SYSTEM_ID, '안내', `${name}을(를) 초대했어요. 초대 링크로 들어오면 대화할 수 있어요.`);
    return m;
  }

  async updateMember(m: MemberRow, patch: { name?: string; active?: boolean }) {
    if (patch.name !== undefined) await this.db.run('UPDATE members SET name = ? WHERE id = ?', patch.name, m.id);
    if (patch.active !== undefined && (patch.active ? 1 : 0) !== m.active) {
      await this.db.run('UPDATE members SET active = ? WHERE id = ?', patch.active ? 1 : 0, m.id);
      const name = patch.name ?? m.name;
      await this.post(m.room_id, SYSTEM_ID, '안내', patch.active ? `${name}이(가) 대화에 다시 참가할 수 있어요.` : `${name}의 대화 참가를 멈췄어요.`);
    }
  }

  async removeMember(m: MemberRow) {
    await this.db.run('DELETE FROM members WHERE id = ?', m.id);
    await this.post(m.room_id, SYSTEM_ID, '안내', `${m.name}이(가) 방에서 나갔어요.`);
  }

  touch(m: MemberRow) {
    const first = m.last_seen === null;
    m.last_seen = Date.now();
    return this.db.run('UPDATE members SET last_seen = ? WHERE id = ?', m.last_seen, m.id).then(async () => {
      if (first) await this.post(m.room_id, SYSTEM_ID, '안내', `${m.name}이(가) 들어왔어요.`);
    });
  }

  async post(roomId: string, authorId: string, authorName: string, text: string) {
    const createdAt = Date.now();
    const r = await this.db.run(
      'INSERT INTO messages (room_id, author_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?)',
      roomId, authorId, authorName, text.slice(0, MAX_TEXT), createdAt,
    );
    return r.lastId;
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
