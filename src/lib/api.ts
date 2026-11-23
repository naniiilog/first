import { Platform } from 'react-native';
import type { ChatMessage, LocalRoom, Member, Settings } from './types';

/**
 * 서버 주소. 웹 앱은 서버와 같은 주소에서 열리므로(Cloudflare에 함께 배포) 그 주소를 그대로 써요.
 * 휴대폰 앱(Expo Go)은 EXPO_PUBLIC_API_URL 또는 설정 화면의 주소를 써요.
 */
const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL || (webOrigin && !webOrigin.startsWith('http://localhost:8081') ? webOrigin : 'http://localhost:8787');
export const DEFAULT_APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? '';

const base = (s: Settings) => (s.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');

async function request(s: Settings, path: string, init: { method?: string; body?: unknown; ownerToken?: string; headers?: Record<string, string> } = {}) {
  try {
    return await fetch(`${base(s)}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(s.appToken ? { 'x-app-token': s.appToken } : {}),
        ...(init.ownerToken ? { Authorization: `Bearer ${init.ownerToken}` } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 설정에서 서버 주소를 확인해 주세요.');
  }
}

async function call<T>(s: Settings, path: string, init: { method?: string; body?: unknown; ownerToken?: string } = {}): Promise<T> {
  const res = await request(s, path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `서버 오류 (${res.status})`);
  return data as T;
}

export type AuthStatus = { passwordSet: boolean; ok: boolean };

export interface RoomInfo {
  room: {
    id: string;
    name: string;
    freeTalk: boolean;
    closed: boolean;
    /** 봇 확인 간격(분, 0이면 실시간) */
    checkIntervalMin?: number;
    quietEnabled?: boolean;
    quietStart?: number;
    quietEnd?: number;
    tz?: string;
    /** 지금 매너타임인지 */
    quietNow?: boolean;
    notifyMode?: NotifyMode;
    notifySilent?: boolean;
    /** 확인 간격 동안 봇이 stay(계속 기다리기) · away(쉬었다 오기) */
    waitMode?: 'stay' | 'away';
  };
  members: Member[];
}
const roomCache = new Map<string, { etag: string; data: RoomInfo }>();

/** 휴대폰 알림 조건: 끔 · 나한테 하는 말만 · 모든 글(묶어서) · 모든 글(하나하나) */
export type NotifyMode = 'off' | 'mentions' | 'batch' | 'each';

/** 봇 사용량 대시보드 응답 */
export interface UsageMember {
  id: string;
  kind: string;
  name: string;
  avatar: string | null;
  active: boolean;
  exhausted: boolean;
  joined: boolean;
  online: boolean;
  lastSeen: number | null;
  totalMessages: number;
  reset: { mode: 'daily' | 'hours'; value: number };
  usage: { since: number | null; resetAt: number | null; calls: number; sent: number; inChars: number; outChars: number };
}
export interface UsageInfo {
  now: number;
  tz: string;
  members: UsageMember[];
}

export const api = {
  authStatus: (s: Settings) => call<AuthStatus>(s, '/api/auth'),
  setupPassword: (s: Settings, password: string) => call(s, '/api/auth/setup', { method: 'POST', body: { password } }),
  changePassword: (s: Settings, password: string) => call(s, '/api/auth/change', { method: 'POST', body: { password } }),

  createRoom: (s: Settings, name: string) =>
    call<{ room: { id: string; name: string }; ownerToken: string }>(s, '/api/rooms', { method: 'POST', body: { name } }),

  /** 방 정보·멤버. 바뀐 게 없으면 서버가 304만 보내고, 지난번 받은 걸 그대로 써요(프로필 사진을 매번 안 받아서 빨라요). */
  getRoom: async (s: Settings, r: LocalRoom): Promise<RoomInfo> => {
    const cached = roomCache.get(r.id);
    const res = await request(s, `/api/rooms/${r.id}`, {
      ownerToken: r.ownerToken,
      headers: cached ? { 'If-None-Match': cached.etag } : {},
    });
    if (res.status === 304 && cached) return cached.data;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `서버 오류 (${res.status})`);
    const etag = res.headers.get('ETag');
    if (etag) roomCache.set(r.id, { etag, data });
    return data as RoomInfo;
  },

  /** 마지막으로 받은 방 정보(있으면 화면을 바로 그릴 때 써요) */
  cachedRoom: (roomId: string): RoomInfo | null => roomCache.get(roomId)?.data ?? null,

  renameRoom: (s: Settings, r: LocalRoom, name: string) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: { name }, ownerToken: r.ownerToken }),

  setFreeTalk: (s: Settings, r: LocalRoom, freeTalk: boolean) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: { freeTalk }, ownerToken: r.ownerToken }),

  /** 확인 간격·매너타임 바꾸기 */
  setSchedule: (
    s: Settings,
    r: LocalRoom,
    patch: { checkIntervalMin?: number; quietEnabled?: boolean; quietStart?: number; quietEnd?: number; tz?: string; waitMode?: 'stay' | 'away' },
  ) => call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: patch, ownerToken: r.ownerToken }),

  /** 봇 모두 쉬게 하기(true) / 다시 부르기(false) */
  setClosed: (s: Settings, r: LocalRoom, closed: boolean) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: { closed }, ownerToken: r.ownerToken }),

  deleteRoom: (s: Settings, r: LocalRoom) => call(s, `/api/rooms/${r.id}`, { method: 'DELETE', ownerToken: r.ownerToken }),

  messages: (s: Settings, r: LocalRoom, after: number | null) =>
    call<{ messages: ChatMessage[] }>(s, `/api/rooms/${r.id}/messages${after !== null ? `?after=${after}` : ''}`, { ownerToken: r.ownerToken }),

  lastMessage: async (s: Settings, r: LocalRoom) =>
    (await call<{ messages: ChatMessage[] }>(s, `/api/rooms/${r.id}/messages?limit=1`, { ownerToken: r.ownerToken })).messages[0] ?? null,

  send: (s: Settings, r: LocalRoom, text: string, opts: { replyTo?: number | null; image?: string | null } = {}) =>
    call<{ id: number }>(s, `/api/rooms/${r.id}/messages`, {
      method: 'POST',
      body: { text, authorName: s.userName, replyTo: opts.replyTo ?? null, image: opts.image ?? null },
      ownerToken: r.ownerToken,
    }),

  invite: (s: Settings, r: LocalRoom, kind: string, name: string, defaultName: string) =>
    call<{ member: Member; inviteUrl: string }>(s, `/api/rooms/${r.id}/members`, {
      method: 'POST',
      body: { kind, name, defaultName },
      ownerToken: r.ownerToken,
    }),

  inviteUrl: (s: Settings, r: LocalRoom, memberId: string) =>
    call<{ inviteUrl: string }>(s, `/api/rooms/${r.id}/members/${memberId}/invite`, { ownerToken: r.ownerToken }),

  updateMember: (s: Settings, r: LocalRoom, memberId: string, patch: { name?: string; active?: boolean; avatar?: string | null; exhausted?: boolean; checkIntervalMin?: number | null }) =>
    call(s, `/api/rooms/${r.id}/members/${memberId}`, { method: 'PATCH', body: patch, ownerToken: r.ownerToken }),

  /** 휴대폰 알림 */
  pushKey: (s: Settings) => call<{ publicKey: string }>(s, '/api/push/key'),
  pushStatus: (s: Settings, r: LocalRoom, endpoint: string) =>
    call<{ subscribed: boolean }>(s, `/api/rooms/${r.id}/push?endpoint=${encodeURIComponent(endpoint)}`, { ownerToken: r.ownerToken }),
  pushSubscribe: (s: Settings, r: LocalRoom, subscription: unknown) =>
    call(s, `/api/rooms/${r.id}/push`, { method: 'POST', body: { subscription }, ownerToken: r.ownerToken }),
  pushUnsubscribe: (s: Settings, r: LocalRoom, endpoint: string) =>
    call(s, `/api/rooms/${r.id}/push`, { method: 'DELETE', body: { endpoint }, ownerToken: r.ownerToken }),
  pushTest: (s: Settings, r: LocalRoom) => call<{ sent: number; failed: number }>(s, `/api/rooms/${r.id}/push/test`, { method: 'POST', ownerToken: r.ownerToken }),
  /** 알림 조건·소리 */
  setNotify: (s: Settings, r: LocalRoom, patch: { notifyMode?: NotifyMode; notifySilent?: boolean; notifyName?: string }) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: patch, ownerToken: r.ownerToken }),

  /** 봇 사용량(오늘 0시부터) */
  usage: (s: Settings, r: LocalRoom) => call<UsageInfo>(s, `/api/rooms/${r.id}/usage`, { ownerToken: r.ownerToken }),

  removeMember: (s: Settings, r: LocalRoom, memberId: string) =>
    call(s, `/api/rooms/${r.id}/members/${memberId}`, { method: 'DELETE', ownerToken: r.ownerToken }),
};
