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
  /** 휴대폰 알림: off · mentions · batch · each */
  notify_mode: string;
  /** 1이면 알림을 소리·진동 없이 */
  notify_silent: number;
  /** '나한테 하는 말'을 알아볼 방장 이름 */
  notify_name: string | null;
  /** 마지막 알림 시각과 그때 글 번호(묶어서 보내기용) */
  notify_last: number | null;
  notify_last_id: number | null;
  /** 방장이 이 방을 마지막으로 보고 있던 시각(보고 있으면 알림 안 보내요) */
  owner_seen: number | null;
  /** 확인 간격 동안 봇이 stay(계속 기다리기) · away(쉬었다 오기) */
  wait_mode: string;
  /** 순서 대화(없으면 null) */
  turn_order: string | null;
  turn_idx: number;
  turn_since: number | null;
  /** 방장이 마지막으로 읽은 글, 북마크(JSON) */
  read_mark: number;
  bookmarks: string | null;
  /** 설치형 앱 알림 소리 */
  notify_sound: string;
  /** 방 공지(없으면 null)와 쓴 시각 */
  notice: string | null;
  notice_at: number;
  /** 봇 대장: 방장 부탁에 의견을 모아 전하는 봇(멤버 번호, 없으면 null) */
  leader_id: string | null;
  /** 1이면 알림에 대화 내용을 보여줘요(기본 0: 숨김) */
  notify_preview: number;
  /** 봇 말 수: low · normal · high */
  talk_level: string;
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
  /** 1이면 사용량이 다 차서 못 쓰는 중(주황불). 그 봇이 다시 말하면 저절로 꺼져요. */
  exhausted: number;
  /** 이 봇만의 확인 간격(분). null이면 방 설정을 따라요 */
  check_interval_min: number | null;
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
  exhausted: m.exhausted === 1,
  /** 이 봇만의 확인 간격(분). null이면 방 설정 */
  checkIntervalMin: m.check_interval_min ?? null,
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

export interface BoardRow {
  id: string;
  room_id: string;
  name: string;
  sort: number;
  created_at: number;
  /** 목록에서만: 글 수, 마지막 글 시각 */
  count?: number;
  last_at?: number | null;
}
export interface PostRow {
  id: number;
  board_id: string;
  room_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  created_at: number;
}
export const MAX_BOARD_NAME = 30;
export const MAX_POST_TITLE = 100;
export const MAX_POST_BODY = 3000;
export const publicPost = (p: PostRow) => ({ id: p.id, boardId: p.board_id, authorId: p.author_id, authorName: p.author_name, title: p.title, body: p.body, createdAt: p.created_at });

export interface GuestRow {
  id: string;
  room_id: string;
  name: string;
  token: string;
  can_post: number;
  created_at: number;
  last_seen: number | null;
  /** 이 시각이 지나면 링크가 안 열려요(null이면 기한 없음) */
  expires_at: number | null;
}

/** 사진 주소 서명: 방장 토큰을 아는 서버만 만들 수 있어요(주소에 비밀번호를 넣지 않으려고). */
export async function imageSig(room: Pick<RoomRow, 'owner_token'>, messageId: number) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${room.owner_token}:img:${messageId}`));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const imageUrl = async (room: Pick<RoomRow, 'id' | 'owner_token'>, messageId: number) => `/img/${room.id}/${messageId}/${await imageSig(room, messageId)}`;

/** 시간대의 지금 UTC와의 차이(초). 날짜별로 묶을 때 써요. */
export function tzOffsetSec(tz: string, at = Date.now()) {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date(at))
        .map((x) => [x.type, Number(x.value)]),
    );
    return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(at / 1000) * 1000) / 1000);
  } catch {
    return 9 * 3600;
  }
}

export class Rooms {
  constructor(private db: Db) {}

  /** 봇이 말했을 때 부를 함수(알림 보내기). app.ts가 요청마다 넣어줘요. */
  notifier?: (room: RoomRow, msg: MessageRow) => void;

  /** 알림 설정 */
  async setNotify(roomId: string, patch: { mode?: string; silent?: boolean; name?: string; sound?: string; preview?: boolean }) {
    if (patch.preview !== undefined) await this.db.run('UPDATE rooms SET notify_preview = ? WHERE id = ?', patch.preview ? 1 : 0, roomId);
    if (patch.sound !== undefined) await this.db.run('UPDATE rooms SET notify_sound = ? WHERE id = ?', patch.sound, roomId);
    // 조건을 바꾸면 '묶어서' 3분 간격도 새로 시작해요.
    if (patch.mode !== undefined) await this.db.run('UPDATE rooms SET notify_mode = ?, notify_last = NULL WHERE id = ?', patch.mode, roomId);
    if (patch.silent !== undefined) await this.db.run('UPDATE rooms SET notify_silent = ? WHERE id = ?', patch.silent ? 1 : 0, roomId);
    if (patch.name !== undefined) await this.db.run('UPDATE rooms SET notify_name = ? WHERE id = ?', patch.name, roomId);
  }

  /** 이 기기의 알림 구독 넣기/빼기 */
  addPushSub(roomId: string, s: { endpoint: string; p256dh: string; auth: string }) {
    return this.db.run(
      'INSERT INTO push_subs (endpoint, room_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint, room_id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth',
      s.endpoint, roomId, s.p256dh, s.auth, Date.now(),
    );
  }
  removePushSub(roomId: string, endpoint: string) {
    return this.db.run('DELETE FROM push_subs WHERE room_id = ? AND endpoint = ?', roomId, endpoint);
  }
  async hasPushSub(roomId: string, endpoint: string) {
    return !!(await this.db.first('SELECT 1 AS x FROM push_subs WHERE room_id = ? AND endpoint = ?', roomId, endpoint));
  }

  /** 방장이 이 방을 보고 있다고 기록(15초에 한 번만 써요) */
  async ownerSeen(room: RoomRow) {
    const now = Date.now();
    if (room.owner_seen && now - room.owner_seen < 15_000) return;
    await this.db.run('UPDATE rooms SET owner_seen = ? WHERE id = ?', now, room.id);
  }

  async createRoom(name: string) {
    const room: RoomRow = { id: randomToken(8), name, owner_token: randomToken(24), created_at: Date.now(), free_talk: 0, closed: 0, check_interval_min: 0, quiet_enabled: 1, quiet_start: 0, quiet_end: 9, tz: 'Asia/Seoul', notify_mode: 'off', notify_silent: 0, notify_name: null, notify_last: null, notify_last_id: null, owner_seen: null, wait_mode: 'stay', turn_order: null, turn_idx: 0, turn_since: null, read_mark: 0, bookmarks: null, notify_sound: 'default', notice: null, notice_at: 0, leader_id: null, notify_preview: 0, talk_level: 'normal' };
    // 확인 간격은 정해 두지 않아요(실시간). 방장이 방 설정에서 정한 대로 따라요.
    await this.db.run('INSERT INTO rooms (id, name, owner_token, created_at, check_interval_min) VALUES (?, ?, ?, ?, 0)', room.id, room.name, room.owner_token, room.created_at);
    return room;
  }

  /** 읽은 곳은 더 뒤로만 옮겨요(여러 기기가 동시에 써도 뒤로 안 가게) */
  setReadMark(roomId: string, id: number) {
    return this.db.run('UPDATE rooms SET read_mark = MAX(read_mark, ?) WHERE id = ?', id, roomId);
  }
  setBookmarks(roomId: string, json: string) {
    return this.db.run('UPDATE rooms SET bookmarks = ? WHERE id = ?', json, roomId);
  }

  /** 모든 방(새로 만든 것부터) */
  allRooms() {
    return this.db.all<Pick<RoomRow, 'id' | 'name' | 'owner_token' | 'created_at'>>('SELECT id, name, owner_token, created_at FROM rooms ORDER BY created_at DESC');
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
  async setSchedule(room: RoomRow, patch: { checkIntervalMin?: number; quietEnabled?: boolean; quietStart?: number; quietEnd?: number; tz?: string; waitMode?: string }) {
    const next = {
      check_interval_min: patch.checkIntervalMin ?? room.check_interval_min,
      quiet_enabled: patch.quietEnabled === undefined ? room.quiet_enabled : patch.quietEnabled ? 1 : 0,
      quiet_start: patch.quietStart ?? room.quiet_start,
      quiet_end: patch.quietEnd ?? room.quiet_end,
      tz: patch.tz ?? room.tz,
      wait_mode: patch.waitMode ?? room.wait_mode ?? 'stay',
    };
    // 방 전체 간격을 바꾸면 이 방 봇 모두 그 간격으로(봇마다 따로 정한 것도 새로 맞춰요)
    if (patch.checkIntervalMin !== undefined) await this.db.run('UPDATE members SET check_interval_min = NULL WHERE room_id = ?', room.id);
    await this.db.run(
      'UPDATE rooms SET check_interval_min = ?, quiet_enabled = ?, quiet_start = ?, quiet_end = ?, tz = ?, wait_mode = ? WHERE id = ?',
      next.check_interval_min, next.quiet_enabled, next.quiet_start, next.quiet_end, next.tz, next.wait_mode, room.id,
    );
    const interval =
      next.check_interval_min === 0
        ? '실시간'
        : `${next.check_interval_min}분마다(${next.wait_mode === 'away' ? '쉬었다 오기' : '계속 기다리기'})`;
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

  /** 사용량이 다시 찬 봇이 말하면 주황불을 꺼요. */
  clearExhausted(memberId: string) {
    return this.db.run('UPDATE members SET exhausted = 0 WHERE id = ?', memberId);
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
    await this.db.run('DELETE FROM push_subs WHERE room_id = ?', id);
    await this.db.run('DELETE FROM guests WHERE room_id = ?', id);
    await this.db.run('DELETE FROM posts WHERE room_id = ?', id);
    await this.db.run('DELETE FROM boards WHERE room_id = ?', id);
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
    return this.db.first<{ active: number; free_talk: number; closed: number; check_interval_min: number; quiet_enabled: number; quiet_start: number; quiet_end: number; wait_mode: string; turn_order: string | null; turn_idx: number; turn_since: number | null; my_interval: number | null; notice: string | null; notice_at: number; leader_id: string | null; talk_level: string; room_id: string }>(
      'SELECT m.active AS active, r.free_talk AS free_talk, r.closed AS closed, r.check_interval_min AS check_interval_min, r.quiet_enabled AS quiet_enabled, r.quiet_start AS quiet_start, r.quiet_end AS quiet_end, r.wait_mode AS wait_mode, r.turn_order AS turn_order, r.turn_idx AS turn_idx, r.turn_since AS turn_since, m.check_interval_min AS my_interval, r.notice AS notice, r.notice_at AS notice_at, r.leader_id AS leader_id, r.talk_level AS talk_level, m.room_id AS room_id FROM members m JOIN rooms r ON r.id = m.room_id WHERE m.id = ?',
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
      exhausted: 0,
      // 새 봇은 처음엔 무조건 실시간(방장이 나중에 바꿔요)
      check_interval_min: 0,
    };
    await this.db.run(
      'INSERT INTO members (id, room_id, kind, name, invite_token, active, created_at, reset_mode, reset_value, check_interval_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
      m.id, m.room_id, m.kind, m.name, m.invite_token, m.active, m.created_at, m.reset_mode, m.reset_value,
    );
    await this.post(roomId, SYSTEM_ID, '안내', `${name} 님을 초대했어요.`);
    return m;
  }

  async updateMember(m: MemberRow, patch: { name?: string; active?: boolean; avatar?: string | null; exhausted?: boolean; checkIntervalMin?: number | null }) {
    if (patch.checkIntervalMin !== undefined && patch.checkIntervalMin !== m.check_interval_min) {
      await this.db.run('UPDATE members SET check_interval_min = ? WHERE id = ?', patch.checkIntervalMin, m.id);
      const v = patch.checkIntervalMin;
      const label = v === null ? '방 설정 따르기' : v === 0 ? '실시간' : `${v}분마다`;
      await this.post(m.room_id, SYSTEM_ID, '안내', `${patch.name ?? m.name} 님의 확인 간격을 바꿨어요: ${label}`);
    }
    if (patch.exhausted !== undefined && (patch.exhausted ? 1 : 0) !== m.exhausted) {
      await this.db.run('UPDATE members SET exhausted = ? WHERE id = ?', patch.exhausted ? 1 : 0, m.id);
      const name = patch.name ?? m.name;
      await this.post(
        m.room_id,
        SYSTEM_ID,
        '안내',
        patch.exhausted ? `${name} 님은 사용량이 다 차서 잠시 쉬어요. 다른 봇은 ${name} 님의 답을 기다리지 마세요.` : `${name} 님의 사용량이 다시 찼어요.`,
      );
    }
    if (patch.name !== undefined) await this.db.run('UPDATE members SET name = ? WHERE id = ?', patch.name, m.id);
    if (patch.avatar !== undefined) await this.db.run('UPDATE members SET avatar = ? WHERE id = ?', patch.avatar, m.id);
    if (patch.active !== undefined && (patch.active ? 1 : 0) !== m.active) {
      await this.db.run('UPDATE members SET active = ? WHERE id = ?', patch.active ? 1 : 0, m.id);
      const name = patch.name ?? m.name;
      await this.post(m.room_id, SYSTEM_ID, '안내', patch.active ? `${name} 님이 다시 대화에 참가해요.` : `${name} 님의 대화 참가를 멈췄어요.`);
    }
  }

  /**
   * 봇 옮기기: 초대 링크(연결)는 그대로 두고 다른 방으로 옮겨요.
   * 새 방에서는 지금부터 올라오는 글만 읽게 하고(옛 대화가 쏟아지지 않게), 원래 방의 대장·순서에서는 빼요.
   */
  async moveMember(m: MemberRow, from: RoomRow, to: RoomRow) {
    const last = (await this.db.first<{ id: number }>('SELECT MAX(id) AS id FROM messages WHERE room_id = ?', to.id))?.id ?? 0;
    // 확인 간격은 가져가지 않아요(새 방에서는 처음엔 무조건 실시간, 방장이 나중에 바꿔요)
    await this.db.run('UPDATE members SET room_id = ?, read_cursor = ?, last_check = NULL, check_interval_min = 0 WHERE id = ?', to.id, last, m.id);
    if (from.leader_id === m.id) await this.setLeader(from.id, null);
    if (from.turn_order) {
      try {
        const order = (JSON.parse(from.turn_order) as string[]).filter((id) => id !== m.id);
        await this.setTurn(from.id, order.length >= 2 ? order : null, 0, Date.now());
      } catch {
        // 순서 정보가 깨졌으면 그냥 둬요
      }
    }
    await this.post(from.id, SYSTEM_ID, '안내', `${m.name} 님이 "${to.name}" 방으로 옮겨 갔어요.`);
    await this.post(to.id, SYSTEM_ID, '안내', `${m.name} 님이 "${from.name}" 방에서 옮겨 왔어요. 연결은 그대로예요.`);
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

  /** 방 공지 쓰기(null이면 내리기) */
  setNotice(roomId: string, notice: string | null) {
    return this.db.run('UPDATE rooms SET notice = ?, notice_at = ? WHERE id = ?', notice, notice ? Date.now() : 0, roomId);
  }

  /** 봇 말 수 */
  setTalkLevel(roomId: string, level: string) {
    return this.db.run('UPDATE rooms SET talk_level = ? WHERE id = ?', level, roomId);
  }

  /** 봇 대장 정하기(null이면 없음) */
  setLeader(roomId: string, leaderId: string | null) {
    return this.db.run('UPDATE rooms SET leader_id = ? WHERE id = ?', leaderId, roomId);
  }

  /** 순서 대화 정하기(null이면 끝내기) */
  setTurn(roomId: string, order: string[] | null, idx: number, since: number) {
    return this.db.run('UPDATE rooms SET turn_order = ?, turn_idx = ?, turn_since = ? WHERE id = ?', order ? JSON.stringify(order) : null, idx, since, roomId);
  }

  /** 사진이 있는 글(앨범): 최근 것부터, 사진 데이터는 빼고 */
  imageMessages(roomId: string, beforeId: number | null, limit: number) {
    return this.db.all<Pick<MessageRow, 'id' | 'author_id' | 'author_name' | 'text' | 'created_at'>>(
      `SELECT id, author_id, author_name, text, created_at FROM messages WHERE room_id = ? AND image IS NOT NULL${beforeId ? ' AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
      ...(beforeId ? [roomId, beforeId, limit] : [roomId, limit]),
    );
  }
  imageOf(roomId: string, id: number) {
    return this.db.first<{ image: string | null }>('SELECT image FROM messages WHERE room_id = ? AND id = ?', roomId, id);
  }

  /** 그 글 앞뒤 대화(사진 요약용), 사진 데이터는 빼고 */
  async around(roomId: string, id: number, n: number) {
    const cols = "id, room_id, author_id, author_name, text, created_at, reply_to, CASE WHEN image IS NULL THEN NULL ELSE 'y' END AS image";
    const before = await this.db.all<MessageRow>(`SELECT ${cols} FROM messages WHERE room_id = ? AND id < ? AND author_id <> 'system' ORDER BY id DESC LIMIT ?`, roomId, id, n);
    const after = await this.db.all<MessageRow>(`SELECT ${cols} FROM messages WHERE room_id = ? AND id > ? AND author_id <> 'system' ORDER BY id ASC LIMIT ?`, roomId, id, n);
    return { before: before.reverse(), after };
  }

  /** 날짜별 글 수(달력): from~to 사이, 방 시간대 기준 날짜 */
  dayCounts(roomId: string, from: number, to: number, offsetSec: number) {
    return this.db.all<{ d: string; n: number }>(
      "SELECT strftime('%Y-%m-%d', created_at / 1000 + ?, 'unixepoch') AS d, COUNT(*) AS n FROM messages WHERE room_id = ? AND created_at >= ? AND created_at < ? AND author_id <> 'system' GROUP BY d",
      offsetSec, roomId, from, to,
    );
  }

  /** 그 시간 사이의 글(타임라인), 사진 데이터는 빼고 */
  messagesBetween(roomId: string, from: number, to: number, limit: number) {
    return this.db.all<MessageRow>(
      "SELECT id, room_id, author_id, author_name, text, created_at, reply_to, CASE WHEN image IS NULL THEN NULL ELSE 'y' END AS image FROM messages WHERE room_id = ? AND created_at >= ? AND created_at < ? ORDER BY id ASC LIMIT ?",
      roomId, from, to, limit,
    );
  }

  // ── 게시판 ──
  boards(roomId: string) {
    return this.db.all<BoardRow>(
      `SELECT b.*, (SELECT COUNT(*) FROM posts p WHERE p.board_id = b.id) AS count,
              (SELECT MAX(created_at) FROM posts p WHERE p.board_id = b.id) AS last_at
         FROM boards b WHERE b.room_id = ? ORDER BY b.sort, b.created_at`,
      roomId,
    );
  }
  board(roomId: string, id: string) {
    return this.db.first<BoardRow>('SELECT * FROM boards WHERE room_id = ? AND id = ?', roomId, id);
  }
  /** 번호나 이름으로 게시판 찾기(봇은 이름으로 부르기 쉬워서) */
  async findBoard(roomId: string, key: string) {
    const k = key.trim().replace(/^\[|\]$/g, '');
    const list = await this.boards(roomId);
    return list.find((b) => b.id === k) ?? list.find((b) => b.name === k) ?? list.find((b) => b.name.toLowerCase().includes(k.toLowerCase())) ?? null;
  }
  async addBoard(roomId: string, name: string) {
    const n = (await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM boards WHERE room_id = ?', roomId))?.n ?? 0;
    const b: BoardRow = { id: randomToken(6), room_id: roomId, name, sort: n, created_at: Date.now() };
    await this.db.run('INSERT INTO boards (id, room_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)', b.id, b.room_id, b.name, b.sort, b.created_at);
    return b;
  }
  renameBoard(roomId: string, id: string, name: string) {
    return this.db.run('UPDATE boards SET name = ? WHERE room_id = ? AND id = ?', name, roomId, id);
  }
  async deleteBoard(roomId: string, id: string) {
    await this.db.run('DELETE FROM posts WHERE room_id = ? AND board_id = ?', roomId, id);
    await this.db.run('DELETE FROM boards WHERE room_id = ? AND id = ?', roomId, id);
  }
  posts(boardId: string, beforeId: number | null, limit: number) {
    return this.db.all<PostRow>('SELECT * FROM posts WHERE board_id = ? AND id < ? ORDER BY id DESC LIMIT ?', boardId, beforeId ?? Number.MAX_SAFE_INTEGER, limit);
  }
  /** 글 쓰기 + 채팅방에 "새 글" 안내 */
  async addPost(board: BoardRow, authorId: string, authorName: string, title: string, body: string) {
    const r = await this.db.run(
      'INSERT INTO posts (board_id, room_id, author_id, author_name, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      board.id, board.room_id, authorId, authorName, title, body, Date.now(),
    );
    await this.post(board.room_id, SYSTEM_ID, '안내', `📋 [${board.name}] ${authorName}: ${title}`);
    return r.lastId;
  }
  deletePost(roomId: string, boardId: string, id: number) {
    return this.db.run('DELETE FROM posts WHERE room_id = ? AND board_id = ? AND id = ?', roomId, boardId, id);
  }

  // ── 초대한 사람(손님) ──
  async addGuest(roomId: string, name: string, canPost: boolean, expiresAt: number | null) {
    const g: GuestRow = { id: randomToken(6), room_id: roomId, name, token: randomToken(20), can_post: canPost ? 1 : 0, created_at: Date.now(), last_seen: null, expires_at: expiresAt };
    await this.db.run(
      'INSERT INTO guests (id, room_id, name, token, can_post, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      g.id, g.room_id, g.name, g.token, g.can_post, g.created_at, g.expires_at,
    );
    await this.post(roomId, SYSTEM_ID, '안내', `${name} 님을 ${canPost ? '대화에' : '구경하러'} 초대했어요.`);
    return g;
  }
  guests(roomId: string) {
    return this.db.all<GuestRow>('SELECT * FROM guests WHERE room_id = ? ORDER BY created_at', roomId);
  }
  guestByToken(token: string) {
    return this.db.first<GuestRow>('SELECT * FROM guests WHERE token = ?', token);
  }
  /** 초대 기한 바꾸기(연장) */
  setGuestExpiry(roomId: string, guestId: string, expiresAt: number | null) {
    return this.db.run('UPDATE guests SET expires_at = ? WHERE id = ? AND room_id = ?', expiresAt, guestId, roomId);
  }
  async removeGuest(roomId: string, guestId: string) {
    const g = await this.db.first<GuestRow>('SELECT * FROM guests WHERE id = ? AND room_id = ?', guestId, roomId);
    if (!g) return;
    await this.db.run('DELETE FROM guests WHERE id = ?', guestId);
    await this.post(roomId, SYSTEM_ID, '안내', `${g.name} 님의 초대를 거뒀어요.`);
  }
  async touchGuest(g: GuestRow) {
    const now = Date.now();
    if (g.last_seen && now - g.last_seen < 30_000) return;
    const first = g.last_seen === null;
    await this.db.run('UPDATE guests SET last_seen = ? WHERE id = ?', now, g.id);
    if (first) await this.post(g.room_id, SYSTEM_ID, '안내', `${g.name} 님이 들어왔어요.`);
  }

  /** beforeId 앞의 메시지(오래된 대화 불러오기), 오래된 것부터 */
  async messagesBefore(roomId: string, beforeId: number, limit: number) {
    const rows = await this.db.all<MessageRow>('SELECT * FROM messages WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?', roomId, beforeId, limit);
    return rows.reverse();
  }

  /** 메시지 검색(최근 것부터). 사진만 있는 글은 빼요. */
  /** 검색: 최근 것부터 limit개씩(before보다 오래된 것). 사진 데이터는 빼고 가볍게 */
  searchMessages(roomId: string, q: string, limit: number, before: number | null = null) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db.all<MessageRow>(
      "SELECT id, room_id, author_id, author_name, text, created_at, reply_to, NULL AS image FROM messages WHERE room_id = ? AND author_id <> 'system' AND id < ? AND (text LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\') ORDER BY id DESC LIMIT ?",
      roomId, before ?? Number.MAX_SAFE_INTEGER, like, like, limit,
    );
  }

  /** 검색 결과가 모두 몇 개인지 */
  async countSearch(roomId: string, q: string) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const r = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE room_id = ? AND author_id <> 'system' AND (text LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\')",
      roomId, like, like,
    );
    return r?.n ?? 0;
  }
}
