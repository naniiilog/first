import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import type { ChatMessage, LocalRoom, Settings } from './types';

/**
 * 방장의 '마지막으로 읽은 글'과 북마크.
 * 서버에 저장해서 어느 기기·주소에서든 같게 보여요. 이 폰에도 사본을 둬서, 서버가 안 될 때도 써요.
 * 예전에 이 폰에만 있던 것은 처음 열 때 서버로 옮겨요(합쳐요).
 */
const readKey = (roomId: string) => `dabot.read.${roomId}`;
const bookKey = (roomId: string) => `dabot.bookmarks.${roomId}`;

export interface Bookmark {
  id: number;
  authorName: string;
  text: string;
  createdAt: number;
  image: boolean;
  savedAt: number;
}

async function localRead(roomId: string) {
  try {
    return Number(await AsyncStorage.getItem(readKey(roomId))) || 0;
  } catch {
    return 0;
  }
}
async function localBooks(roomId: string): Promise<Bookmark[]> {
  try {
    const raw = await AsyncStorage.getItem(bookKey(roomId));
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}
async function keepLocal(roomId: string, read?: number, books?: Bookmark[]) {
  try {
    if (read) await AsyncStorage.setItem(readKey(roomId), String(read));
    if (books) await AsyncStorage.setItem(bookKey(roomId), JSON.stringify(books));
  } catch {
    // 저장이 안 돼도 앱은 그대로 써요.
  }
}

/** 처음 열 때: 서버 것과 이 폰 것을 합쳐요(읽은 곳은 더 뒤쪽, 북마크는 둘 다). */
export async function loadMarks(s: Settings, room: LocalRoom): Promise<{ readMark: number; bookmarks: Bookmark[] }> {
  const [lr, lb] = await Promise.all([localRead(room.id), localBooks(room.id)]);
  try {
    const srv = await api.marks(s, room);
    const readMark = Math.max(srv.readMark || 0, lr);
    const byId = new Map<number, Bookmark>();
    for (const b of [...(srv.bookmarks ?? []), ...lb]) if (!byId.has(b.id)) byId.set(b.id, b);
    const bookmarks = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
    // 이 폰에만 있던 게 있으면 서버로 올려요.
    const needRead = lr > (srv.readMark || 0);
    const needBooks = bookmarks.length !== (srv.bookmarks ?? []).length;
    if (needRead || needBooks) api.saveMarks(s, room, { ...(needRead ? { readMark } : {}), ...(needBooks ? { bookmarks } : {}) }).catch(() => {});
    keepLocal(room.id, readMark, bookmarks);
    return { readMark, bookmarks };
  } catch {
    return { readMark: lr, bookmarks: lb };
  }
}

const lastSaved = new Map<string, number>();
const lastSent = new Map<string, number>();
/** 읽은 곳 저장: 이 폰엔 바로, 서버엔 10초에 한 번까지(스크롤할 때마다 불려요) */
export function saveReadMark(s: Settings, room: LocalRoom, id: number) {
  if (id <= 0 || (lastSaved.get(room.id) ?? 0) >= id) return;
  lastSaved.set(room.id, id);
  keepLocal(room.id, id);
  const now = Date.now();
  if (now - (lastSent.get(room.id) ?? 0) < 10_000) {
    // 잠깐 뒤에 마지막 값만 보내요.
    setTimeout(() => {
      if (lastSaved.get(room.id) === id) {
        lastSent.set(room.id, Date.now());
        api.saveMarks(s, room, { readMark: id }).catch(() => {});
      }
    }, 10_000);
    return;
  }
  lastSent.set(room.id, now);
  api.saveMarks(s, room, { readMark: id }).catch(() => {});
}

/** 북마크 켜고 끄기. 바뀐 목록을 돌려줘요. */
export async function toggleBookmark(s: Settings, room: LocalRoom, current: Bookmark[], m: Pick<ChatMessage, 'id' | 'authorName' | 'text' | 'createdAt' | 'image'>): Promise<Bookmark[]> {
  const next = current.some((b) => b.id === m.id)
    ? current.filter((b) => b.id !== m.id)
    : [{ id: m.id, authorName: m.authorName, text: m.text, createdAt: m.createdAt, image: !!m.image, savedAt: Date.now() }, ...current];
  await keepLocal(room.id, undefined, next);
  await api.saveMarks(s, room, { bookmarks: next }).catch(() => {});
  return next;
}
