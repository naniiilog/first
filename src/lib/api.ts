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

async function call<T>(s: Settings, path: string, init: { method?: string; body?: unknown; ownerToken?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base(s)}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(s.appToken ? { 'x-app-token': s.appToken } : {}),
        ...(init.ownerToken ? { Authorization: `Bearer ${init.ownerToken}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 설정에서 서버 주소를 확인해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `서버 오류 (${res.status})`);
  return data as T;
}

export type AuthStatus = { passwordSet: boolean; ok: boolean };

export const api = {
  authStatus: (s: Settings) => call<AuthStatus>(s, '/api/auth'),
  setupPassword: (s: Settings, password: string) => call(s, '/api/auth/setup', { method: 'POST', body: { password } }),
  changePassword: (s: Settings, password: string) => call(s, '/api/auth/change', { method: 'POST', body: { password } }),

  createRoom: (s: Settings, name: string) =>
    call<{ room: { id: string; name: string }; ownerToken: string }>(s, '/api/rooms', { method: 'POST', body: { name } }),

  getRoom: (s: Settings, r: LocalRoom) =>
    call<{ room: { id: string; name: string; freeTalk: boolean }; members: Member[] }>(s, `/api/rooms/${r.id}`, { ownerToken: r.ownerToken }),

  renameRoom: (s: Settings, r: LocalRoom, name: string) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: { name }, ownerToken: r.ownerToken }),

  setFreeTalk: (s: Settings, r: LocalRoom, freeTalk: boolean) =>
    call(s, `/api/rooms/${r.id}`, { method: 'PATCH', body: { freeTalk }, ownerToken: r.ownerToken }),

  deleteRoom: (s: Settings, r: LocalRoom) => call(s, `/api/rooms/${r.id}`, { method: 'DELETE', ownerToken: r.ownerToken }),

  messages: (s: Settings, r: LocalRoom, after: number | null) =>
    call<{ messages: ChatMessage[] }>(s, `/api/rooms/${r.id}/messages${after !== null ? `?after=${after}` : ''}`, { ownerToken: r.ownerToken }),

  lastMessage: async (s: Settings, r: LocalRoom) =>
    (await call<{ messages: ChatMessage[] }>(s, `/api/rooms/${r.id}/messages?limit=1`, { ownerToken: r.ownerToken })).messages[0] ?? null,

  send: (s: Settings, r: LocalRoom, text: string) =>
    call<{ id: number }>(s, `/api/rooms/${r.id}/messages`, { method: 'POST', body: { text, authorName: s.userName }, ownerToken: r.ownerToken }),

  invite: (s: Settings, r: LocalRoom, kind: string, name: string, defaultName: string) =>
    call<{ member: Member; inviteUrl: string }>(s, `/api/rooms/${r.id}/members`, {
      method: 'POST',
      body: { kind, name, defaultName },
      ownerToken: r.ownerToken,
    }),

  inviteUrl: (s: Settings, r: LocalRoom, memberId: string) =>
    call<{ inviteUrl: string }>(s, `/api/rooms/${r.id}/members/${memberId}/invite`, { ownerToken: r.ownerToken }),

  updateMember: (s: Settings, r: LocalRoom, memberId: string, patch: { name?: string; active?: boolean; avatar?: string | null }) =>
    call(s, `/api/rooms/${r.id}/members/${memberId}`, { method: 'PATCH', body: patch, ownerToken: r.ownerToken }),

  removeMember: (s: Settings, r: LocalRoom, memberId: string) =>
    call(s, `/api/rooms/${r.id}/members/${memberId}`, { method: 'DELETE', ownerToken: r.ownerToken }),
};
