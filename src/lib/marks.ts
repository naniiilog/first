import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from './types';

/** 이 휴대폰에만 저장해요: 마지막으로 읽은 글, 북마크 */
const readKey = (roomId: string) => `dabot.read.${roomId}`;
const bookKey = (roomId: string) => `dabot.bookmarks.${roomId}`;

export async function getReadMark(roomId: string): Promise<number> {
  try {
    return Number(await AsyncStorage.getItem(readKey(roomId))) || 0;
  } catch {
    return 0;
  }
}
const lastSaved = new Map<string, number>();
export async function setReadMark(roomId: string, id: number) {
  // 같은 값이거나 예전 글이면 다시 쓰지 않아요(스크롤할 때마다 불려요).
  if (id <= 0 || (lastSaved.get(roomId) ?? 0) >= id) return;
  lastSaved.set(roomId, id);
  try {
    await AsyncStorage.setItem(readKey(roomId), String(id));
  } catch {
    // 저장이 안 돼도 앱은 그대로 써요.
  }
}

/** 북마크: 나중에 다시 보려고 표시한 글(글 내용도 같이 저장해 목록에서 바로 보여줘요) */
export interface Bookmark {
  id: number;
  authorName: string;
  text: string;
  createdAt: number;
  image: boolean;
  savedAt: number;
}
export async function getBookmarks(roomId: string): Promise<Bookmark[]> {
  try {
    const raw = await AsyncStorage.getItem(bookKey(roomId));
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}
/** 북마크 켜고 끄기. 바뀐 목록을 돌려줘요. */
export async function toggleBookmark(roomId: string, m: ChatMessage): Promise<Bookmark[]> {
  const list = await getBookmarks(roomId);
  const next = list.some((b) => b.id === m.id)
    ? list.filter((b) => b.id !== m.id)
    : [{ id: m.id, authorName: m.authorName, text: m.text, createdAt: m.createdAt, image: !!m.image, savedAt: Date.now() }, ...list];
  try {
    await AsyncStorage.setItem(bookKey(roomId), JSON.stringify(next));
  } catch {
    // 저장이 안 되면 이번 화면에서만 보여요.
  }
  return next;
}
