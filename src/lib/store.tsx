import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, DEFAULT_APP_TOKEN, DEFAULT_SERVER_URL } from './api';
import { loadData, saveData } from './storage';
import type { ChatMessage, LocalRoom, Member, Settings } from './types';

interface Store {
  ready: boolean;
  rooms: LocalRoom[];
  settings: Settings;
  createRoom: (name: string) => Promise<LocalRoom>;
  forgetRoom: (id: string) => void;
  setRoomName: (id: string, name: string) => void;
  saveSettings: (s: Settings) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<LocalRoom[]>([]);
  const [settings, setSettings] = useState<Settings>({ userName: '나', serverUrl: DEFAULT_SERVER_URL, appToken: DEFAULT_APP_TOKEN });

  useEffect(() => {
    loadData().then((data) => {
      if (data) {
        setRooms(data.rooms);
        setSettings((s) => ({ ...s, ...data.settings }));
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) saveData({ rooms, settings });
  }, [ready, rooms, settings]);

  const value: Store = {
    ready,
    rooms,
    settings,
    createRoom: async (name) => {
      const res = await api.createRoom(settings, name);
      const room: LocalRoom = { id: res.room.id, name: res.room.name, ownerToken: res.ownerToken, createdAt: Date.now() };
      setRooms((prev) => [room, ...prev]);
      return room;
    },
    forgetRoom: (id) => setRooms((prev) => prev.filter((r) => r.id !== id)),
    setRoomName: (id, name) => setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r))),
    saveSettings: (s) => setSettings({ ...s, userName: s.userName.trim() || '나', serverUrl: s.serverUrl.trim(), appToken: s.appToken.trim() }),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** 열려 있는 방의 메시지와 멤버를 서버에서 주기적으로 받아와요. */
export function useLiveRoom(roomId: string | undefined) {
  const { rooms, settings, setRoomName } = useStore();
  const room = rooms.find((r) => r.id === roomId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [freeTalk, setFreeTalk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const lastId = useRef<number | null>(null);

  const refreshMembers = useCallback(async () => {
    if (!room) return;
    try {
      const res = await api.getRoom(settings, room);
      setMembers(res.members);
      setFreeTalk(res.room.freeTalk);
      if (res.room.name !== room.name) setRoomName(room.id, res.room.name);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('찾을 수 없') || msg.includes('방장이 아니')) setGone(true);
      setError(msg);
    }
  }, [room, settings, setRoomName]);

  const refreshMessages = useCallback(async () => {
    if (!room) return;
    try {
      const res = await api.messages(settings, room, lastId.current);
      if (res.messages.length) {
        lastId.current = res.messages[res.messages.length - 1].id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [room, settings]);

  useEffect(() => {
    lastId.current = null;
    setMessages([]);
    setMembers([]);
    setGone(false);
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    refreshMessages();
    refreshMembers();
    const m = setInterval(refreshMessages, 2000);
    const b = setInterval(refreshMembers, 5000);
    return () => {
      clearInterval(m);
      clearInterval(b);
    };
  }, [room?.id, refreshMessages, refreshMembers]);

  return { room, messages, members, freeTalk, error, gone, refreshMessages, refreshMembers };
}
