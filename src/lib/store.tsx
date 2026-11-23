import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, DEFAULT_APP_TOKEN, DEFAULT_SERVER_URL, type RoomInfo } from './api';
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
  /** 앱 비밀번호를 이 기기에 저장(빈 문자열이면 잠그기) */
  setPassword: (password: string) => void;
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
    saveSettings: (s) => setSettings({ ...s, userName: s.userName.trim() || '나', serverUrl: s.serverUrl.trim() }),
    setPassword: (password) => setSettings((s) => ({ ...s, appToken: password })),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** 열려 있는 방의 메시지와 멤버를 서버에서 주기적으로 받아와요. */
export function useLiveRoom(roomId: string | undefined, opts: { messages?: boolean } = {}) {
  const watchMessages = opts.messages ?? true;
  const { rooms, settings, setRoomName } = useStore();
  const room = rooms.find((r) => r.id === roomId);
  // 전에 받아 둔 방 정보가 있으면 화면을 바로 그려요(서버 응답을 기다리지 않게).
  const cached = roomId ? api.cachedRoom(roomId) : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>(cached?.members ?? []);
  const [membersLoaded, setMembersLoaded] = useState(!!cached);
  const [freeTalk, setFreeTalk] = useState(cached?.room.freeTalk ?? false);
  const [closed, setClosed] = useState(cached?.room.closed ?? false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo['room'] | null>(cached?.room ?? null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const lastId = useRef<number | null>(null);
  /** 버튼을 누른 직후 잠깐은 서버의 옛 상태로 화면을 덮어쓰지 않아요(버튼 반응을 바로 보여주려고). */
  const holdUntil = useRef(0);
  const hold = () => {
    holdUntil.current = Date.now() + 4000;
  };

  const refreshMembers = useCallback(async () => {
    if (!room) return;
    try {
      const res = await api.getRoom(settings, room);
      if (Date.now() < holdUntil.current) return;
      setMembers(res.members);
      setMembersLoaded(true);
      setFreeTalk(res.room.freeTalk);
      setClosed(res.room.closed);
      setRoomInfo(res.room);
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

  // 방 화면은 방마다 따로 열리므로(화면 하나 = 방 하나) 여기서 상태를 초기화할 필요는 없어요.
  useEffect(() => {
    if (!room) return;
    const first = setTimeout(() => {
      if (watchMessages) refreshMessages();
      refreshMembers();
    }, 0);
    // 멤버 화면처럼 메시지가 필요 없는 곳에서는 메시지를 확인하지 않아요.
    const m = watchMessages ? setInterval(refreshMessages, 2000) : undefined;
    const b = setInterval(refreshMembers, 5000);
    return () => {
      clearTimeout(first);
      if (m) clearInterval(m);
      clearInterval(b);
    };
  }, [room, refreshMessages, refreshMembers, watchMessages]);

  /**
   * 화면을 먼저 바꾸고 서버에 알려요. 서버가 실패하면 원래대로 되돌리고 오류를 돌려줘요.
   * (버튼을 눌렀을 때 서버 응답을 기다리느라 늦게 반응하던 문제를 고쳐요)
   */
  const optimistic = useCallback(
    async (apply: () => () => void, request: () => Promise<unknown>) => {
      hold();
      const undo = apply();
      try {
        await request();
        holdUntil.current = 0;
        refreshMembers();
        if (watchMessages) refreshMessages();
        return null;
      } catch (e) {
        holdUntil.current = 0;
        undo();
        return e instanceof Error ? e.message : String(e);
      }
    },
    [refreshMembers, refreshMessages, watchMessages],
  );

  const toggleMember = (m: Member) =>
    optimistic(
      () => {
        setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, active: !m.active } : x)));
        return () => setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, active: m.active } : x)));
      },
      () => api.updateMember(settings, room!, m.id, { active: !m.active }),
    );

  /** 봇 상태를 한 번에 정하기: 참가(초록) · 사용량 소진(주황) · 쉬기(빨강) */
  const setMemberState = (m: Member, next: { active: boolean; exhausted: boolean }) =>
    optimistic(
      () => {
        setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, ...next } : x)));
        return () => setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, active: m.active, exhausted: m.exhausted } : x)));
      },
      () =>
        api.updateMember(settings, room!, m.id, {
          ...(next.active !== m.active ? { active: next.active } : {}),
          ...(next.exhausted !== !!m.exhausted ? { exhausted: next.exhausted } : {}),
        }),
    );

  /** 이 봇만의 확인 간격(null이면 방 설정 따르기) */
  const setMemberInterval = (m: Member, minutes: number | null) =>
    optimistic(
      () => {
        setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, checkIntervalMin: minutes } : x)));
        return () => setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, checkIntervalMin: m.checkIntervalMin ?? null } : x)));
      },
      () => api.updateMember(settings, room!, m.id, { checkIntervalMin: minutes }),
    );

  /** 사용량 소진(주황불) 켜고 끄기 */
  const toggleExhausted = (m: Member) =>
    optimistic(
      () => {
        setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, exhausted: !m.exhausted } : x)));
        return () => setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, exhausted: m.exhausted } : x)));
      },
      () => api.updateMember(settings, room!, m.id, { exhausted: !m.exhausted }),
    );

  const toggleFreeTalk = () => {
    const before = freeTalk;
    return optimistic(
      () => {
        setFreeTalk(!before);
        return () => setFreeTalk(before);
      },
      () => api.setFreeTalk(settings, room!, !before),
    );
  };

  const setRoomClosed = (next: boolean) => {
    const before = closed;
    return optimistic(
      () => {
        setClosed(next);
        return () => setClosed(before);
      },
      () => api.setClosed(settings, room!, next),
    );
  };

  /** 보낸 메시지를 바로 화면에 보여주고(임시 번호), 서버 번호가 오면 바꿔요. */
  const sendMessage = async (text: string, opts: { replyTo?: number | null; image?: string | null } = {}) => {
    if (!room) return null;
    const tempId = -Date.now();
    const temp: ChatMessage = {
      id: tempId,
      authorId: 'owner',
      authorName: settings.userName,
      text,
      createdAt: Date.now(),
      replyTo: opts.replyTo ?? null,
      image: opts.image ?? null,
      pending: true,
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const res = await api.send(settings, room, text, opts);
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? { ...m, id: res.id, pending: false } : m));
      });
      return null;
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return e instanceof Error ? e.message : String(e);
    }
  };

  return {
    room,
    messages,
    members,
    membersLoaded,
    setMembers,
    freeTalk,
    closed,
    roomInfo,
    error,
    gone,
    refreshMessages,
    refreshMembers,
    toggleMember,
    toggleExhausted,
    setMemberState,
    setMemberInterval,
    toggleFreeTalk,
    setRoomClosed,
    sendMessage,
  };
}
