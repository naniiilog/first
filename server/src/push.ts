/**
 * 휴대폰 알림(웹 푸시). 다봇이 꺼져 있어도 봇이 말하면 알림을 보내요.
 * - 표준 웹 푸시(RFC 8291 암호화 + VAPID 서명)를 Web Crypto로 직접 만들어요(따로 받는 라이브러리 없음).
 * - VAPID 열쇠는 처음 쓸 때 만들어 app_settings에 넣어 둬요.
 * - 알림 조건은 방마다: off(끔) · mentions(나한테 하는 말만) · batch(모든 글, 몇 분에 한 번 묶어서) · each(글마다)
 * - 매너타임에는 보내지 않고, 방장이 지금 그 방을 보고 있으면 보내지 않아요.
 */
import type { Db } from './db.js';
import { OWNER_ID, type MessageRow, type RoomRow } from './rooms.js';

export type NotifyMode = 'off' | 'mentions' | 'batch' | 'each';
export const NOTIFY_MODES: NotifyMode[] = ['off', 'mentions', 'batch', 'each'];
/** 묶어서 보낼 때 최소 간격 */
const BATCH_MS = 3 * 60_000;
/** 방장이 이 시간 안에 그 방을 봤으면 알림을 보내지 않아요 */
const WATCHING_MS = 20_000;

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string): Bytes => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ── VAPID 열쇠 ──
interface Vapid {
  publicKey: string; // base64url, 65바이트(앱이 구독할 때 써요)
  privateJwk: JsonWebKey;
}
let vapidCache: Promise<Vapid> | null = null;
export function vapid(db: Db): Promise<Vapid> {
  vapidCache ??= (async () => {
    const row = await db.first<{ value: string }>("SELECT value FROM app_settings WHERE key = 'vapid'");
    if (row) return JSON.parse(row.value) as Vapid;
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const v: Vapid = {
      publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)),
      privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    };
    // 동시에 두 번 만들어도 처음 것만 남게 해요.
    await db.run("INSERT INTO app_settings (key, value) VALUES ('vapid', ?) ON CONFLICT(key) DO NOTHING", JSON.stringify(v));
    const saved = await db.first<{ value: string }>("SELECT value FROM app_settings WHERE key = 'vapid'");
    return saved ? (JSON.parse(saved.value) as Vapid) : v;
  })().catch((e) => {
    vapidCache = null;
    throw e;
  });
  return vapidCache;
}

async function vapidHeader(v: Vapid, endpoint: string, subject: string) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

/** RFC 8291(aes128gcm)로 알림 내용을 암호화해요. 테스트에서도 써요. */
export async function encryptPayload(p256dh: string, authSecret: string, payload: Bytes) {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export interface PushSub {
  endpoint: string;
  room_id: string;
  p256dh: string;
  auth: string;
}

export const NOTIFY_SOUNDS = ['default', 'salang', 'pogeun', 'pop', 'tok', 'marimba', 'bogeul', 'vibrate', 'silent'];
/** 설치형 앱 알림 칸(앱의 nativePush.ts와 같은 이름) */
const channelFor = (sound: string, silent: boolean) =>
  silent || sound === 'silent' ? 'quiet' : sound === 'vibrate' ? 'vibrate' : sound === 'default' || !NOTIFY_SOUNDS.includes(sound) ? 'chat' : `s2_${sound}`;

/** 설치형 앱(Expo 푸시)으로 보내기. 기기가 없어졌으면 false */
async function sendExpo(token: string, d: { title: string; body: string; url: string; silent: boolean; sound?: string; tag?: string }): Promise<boolean> {
  const channelId = channelFor(d.sound ?? 'default', d.silent);
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: token,
      title: d.title,
      body: d.body,
      data: { url: d.url },
      channelId,
      sound: channelId === 'quiet' || channelId === 'vibrate' ? null : 'default',
      priority: 'high',
    }),
  });
  const out = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } } };
  if (out.data?.status === 'error') {
    if (out.data.details?.error === 'DeviceNotRegistered') return false;
    console.error('[push:expo]', JSON.stringify(out.data).slice(0, 200));
  }
  return true;
}

/** 알림 하나 보내기. 구독이 없어졌으면(404/410) false */
async function sendOne(v: Vapid, sub: PushSub, data: unknown, subject: string): Promise<boolean> {
  if (sub.endpoint.startsWith('expo:')) return sendExpo(sub.endpoint.slice(5), data as { title: string; body: string; url: string; silent: boolean });
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(data)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(v, sub.endpoint, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) console.error('[push]', res.status, (await res.text()).slice(0, 200));
  return true;
}

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 그 방의 시간대에서 지금이 매너타임인지(agent.ts의 quietState와 같은 계산) */
function quietNow(room: RoomRow, now: number) {
  if (room.quiet_enabled !== 1 || room.quiet_start === room.quiet_end) return false;
  let h: number;
  try {
    h = Number(new Intl.DateTimeFormat('en-US', { timeZone: room.tz || 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now))) % 24;
  } catch {
    h = new Date(now + 9 * 3600_000).getUTCHours();
  }
  const { quiet_start: s, quiet_end: e } = room;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/**
 * 봇이 말했을 때 방장에게 알림을 보낼지 정하고 보내요.
 * origin: 알림을 누르면 열 주소와 VAPID 'sub'에 써요.
 */
export async function notifyBotMessage(db: Db, room: RoomRow, msg: MessageRow, origin: string) {
  const mode = (room.notify_mode || 'off') as NotifyMode;
  if (mode === 'off') return;
  const now = Date.now();
  if (quietNow(room, now)) return;
  if (room.owner_seen && now - room.owner_seen < WATCHING_MS) return;

  let title = room.name;
  // 기본은 대화 내용을 알림에 싣지 않아요(알림 서비스를 거치지 않게). 방 설정에서 켜면 보여줘요.
  const preview = room.notify_preview === 1;
  let body = preview ? `${msg.author_name}: ${clip(msg.text || '[사진]')}` : `${msg.author_name}의 새 메시지`;
  let tag = `room-${room.id}`;
  if (mode === 'mentions') {
    const name = (room.notify_name || '').trim();
    // 이름이 한 글자('나' 등)면 거의 모든 글에 들어가서, 그때는 내 글에 단 답장만 알려요.
    const named = name.length >= 2 && msg.text.includes(name);
    const replied = msg.reply_to ? (await db.first<{ author_id: string }>('SELECT author_id FROM messages WHERE id = ? AND room_id = ?', msg.reply_to, room.id))?.author_id === OWNER_ID : false;
    if (!named && !replied) return;
    tag = `room-${room.id}-${msg.id}`;
  } else if (mode === 'batch') {
    if (room.notify_last && now - room.notify_last < BATCH_MS) return;
    const since = room.notify_last_id ?? 0;
    const n = (await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE room_id = ? AND id > ? AND author_id NOT IN ('owner','system')", room.id, since))?.n ?? 1;
    if (n > 1) body = preview ? `${msg.author_name}: ${clip(msg.text || '[사진]', 80)} 외 ${n - 1}개` : `새 메시지 ${n}개`;
  } else {
    tag = `room-${room.id}-${msg.id}`;
  }

  const subs = await db.all<PushSub>('SELECT endpoint, room_id, p256dh, auth FROM push_subs WHERE room_id = ?', room.id);
  if (!subs.length) return;
  await db.run('UPDATE rooms SET notify_last = ?, notify_last_id = ? WHERE id = ?', now, msg.id, room.id);
  const v = await vapid(db);
  const data = { title, body, tag, url: `/room/${room.id}`, silent: room.notify_silent === 1, sound: room.notify_sound || 'default' };
  for (const sub of subs) {
    const alive = await sendOne(v, sub, data, origin).catch((e) => {
      console.error('[push]', e);
      return true;
    });
    if (!alive) await db.run('DELETE FROM push_subs WHERE endpoint = ? AND room_id = ?', sub.endpoint, sub.room_id);
  }
}

/** 알림 설정 화면의 '시험 알림' */
export async function sendTest(db: Db, room: RoomRow, origin: string) {
  const subs = await db.all<PushSub>('SELECT endpoint, room_id, p256dh, auth FROM push_subs WHERE room_id = ?', room.id);
  const v = await vapid(db);
  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const ok = await sendOne(v, sub, { title: room.name, body: '다봇 알림이 잘 와요 🔔', tag: `test-${room.id}`, url: `/room/${room.id}`, silent: room.notify_silent === 1, sound: room.notify_sound || 'default' }, origin).catch((e) => {
      console.error('[push]', e);
      return null;
    });
    if (ok === true) sent++;
    else if (ok === false) await db.run('DELETE FROM push_subs WHERE endpoint = ? AND room_id = ?', sub.endpoint, sub.room_id);
    else failed++;
  }
  return { sent, failed };
}
