import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildSystemPrompt, buildTurns } from './conversation';
import { PRESET_BOTS } from './presets';
import { complete } from './providers';
import { loadData, loadKeys, saveData, saveKeys } from './storage';
import { USER_ID, type ApiKeys, type Bot, type ChatMessage, type Room } from './types';

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface RoomActivity {
  /** 지금 답장을 쓰고 있는 봇 id */
  typingBotId: string | null;
  running: boolean;
}

interface Store {
  ready: boolean;
  bots: Bot[];
  rooms: Room[];
  userName: string;
  keys: ApiKeys;
  activity: Record<string, RoomActivity>;
  botsById: Record<string, Bot>;
  saveBot: (bot: Bot) => void;
  deleteBot: (id: string) => void;
  createRoom: (name: string, botIds: string[]) => string;
  updateRoom: (id: string, patch: Partial<Pick<Room, 'name' | 'botIds'>>) => void;
  deleteRoom: (id: string) => void;
  clearRoom: (id: string) => void;
  setUserName: (name: string) => void;
  setKeys: (keys: ApiKeys) => Promise<void>;
  sendMessage: (roomId: string, text: string) => Promise<void>;
  runDebate: (roomId: string, rounds: number, topic?: string) => Promise<void>;
  stop: (roomId: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [userName, setUserNameState] = useState('나');
  const [keys, setKeysState] = useState<ApiKeys>({ anthropic: '', openai: '', google: '' });
  const [activity, setActivity] = useState<Record<string, RoomActivity>>({});

  // 비동기 대화 루프에서 항상 최신 상태를 읽기 위한 ref
  const roomsRef = useRef(rooms);
  const botsRef = useRef(bots);
  const keysRef = useRef(keys);
  const userNameRef = useRef(userName);
  const cancelled = useRef<Record<string, boolean>>({});
  roomsRef.current = rooms;
  botsRef.current = bots;
  keysRef.current = keys;
  userNameRef.current = userName;

  useEffect(() => {
    (async () => {
      const [data, savedKeys] = await Promise.all([loadData(), loadKeys()]);
      if (data) {
        setBots(data.bots);
        setRooms(data.rooms);
        setUserNameState(data.userName || '나');
      } else {
        setBots(PRESET_BOTS);
      }
      setKeysState(savedKeys);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) saveData({ bots, rooms, userName });
  }, [ready, bots, rooms, userName]);

  const botsById = useMemo(() => Object.fromEntries(bots.map((b) => [b.id, b])), [bots]);

  const patchRoom = useCallback((id: string, fn: (room: Room) => Room) => {
    setRooms((prev) => {
      const next = prev.map((r) => (r.id === id ? fn(r) : r));
      roomsRef.current = next;
      return next;
    });
  }, []);

  const appendMessage = useCallback(
    (roomId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
      patchRoom(roomId, (r) => ({
        ...r,
        messages: [...r.messages, { ...msg, id: newId(), createdAt: Date.now() }],
      }));
    },
    [patchRoom],
  );

  const setRoomActivity = useCallback((roomId: string, a: RoomActivity) => {
    setActivity((prev) => ({ ...prev, [roomId]: a }));
  }, []);

  /** 봇 한 명이 현재 대화를 보고 한 마디 합니다. */
  const botSpeak = useCallback(
    async (roomId: string, botId: string, mode: 'reply' | 'debate') => {
      const room = roomsRef.current.find((r) => r.id === roomId);
      const byId = Object.fromEntries(botsRef.current.map((b) => [b.id, b]));
      const bot = byId[botId];
      if (!room || !bot) return;
      const roomBots = room.botIds.map((id) => byId[id]).filter(Boolean);
      setRoomActivity(roomId, { typingBotId: botId, running: true });
      try {
        const text = await complete({
          provider: bot.provider,
          model: bot.model,
          apiKey: keysRef.current[bot.provider],
          system: buildSystemPrompt(bot, roomBots, userNameRef.current, mode),
          turns: buildTurns(bot, room.messages, byId, userNameRef.current, mode),
        });
        // 모델이 습관적으로 이름표를 붙이면 제거
        const name = escapeRegExp(bot.name);
        const cleaned = text.replace(new RegExp(`^(\\[${name}\\]|${name}\\s*[:：])\\s*`), '') || text;
        if (!cancelled.current[roomId]) appendMessage(roomId, { authorId: botId, text: cleaned });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendMessage(roomId, { authorId: botId, text: message, error: true });
      }
    },
    [appendMessage, setRoomActivity],
  );

  const runSequence = useCallback(
    async (roomId: string, order: string[], mode: 'reply' | 'debate') => {
      cancelled.current[roomId] = false;
      setRoomActivity(roomId, { typingBotId: null, running: true });
      for (const botId of order) {
        if (cancelled.current[roomId]) break;
        await botSpeak(roomId, botId, mode);
      }
      setRoomActivity(roomId, { typingBotId: null, running: false });
    },
    [botSpeak, setRoomActivity],
  );

  const sendMessage = useCallback(
    async (roomId: string, text: string) => {
      const room = roomsRef.current.find((r) => r.id === roomId);
      if (!room || !text.trim()) return;
      appendMessage(roomId, { authorId: USER_ID, text: text.trim() });
      await runSequence(roomId, room.botIds, 'reply');
    },
    [appendMessage, runSequence],
  );

  const runDebate = useCallback(
    async (roomId: string, rounds: number, topic?: string) => {
      const room = roomsRef.current.find((r) => r.id === roomId);
      if (!room || room.botIds.length === 0) return;
      if (topic?.trim()) {
        appendMessage(roomId, { authorId: USER_ID, text: `토론 주제: ${topic.trim()}` });
      }
      const order: string[] = [];
      for (let i = 0; i < rounds; i++) order.push(...room.botIds);
      await runSequence(roomId, order, 'debate');
    },
    [appendMessage, runSequence],
  );

  const stop = useCallback((roomId: string) => {
    cancelled.current[roomId] = true;
  }, []);

  const value: Store = {
    ready,
    bots,
    rooms,
    userName,
    keys,
    activity,
    botsById,
    saveBot: (bot) =>
      setBots((prev) => (prev.some((b) => b.id === bot.id) ? prev.map((b) => (b.id === bot.id ? bot : b)) : [...prev, bot])),
    deleteBot: (id) => {
      setBots((prev) => prev.filter((b) => b.id !== id));
      setRooms((prev) => prev.map((r) => ({ ...r, botIds: r.botIds.filter((b) => b !== id) })));
    },
    createRoom: (name, botIds) => {
      const id = newId();
      const room: Room = { id, name, botIds, messages: [], createdAt: Date.now() };
      setRooms((prev) => {
        const next = [room, ...prev];
        roomsRef.current = next;
        return next;
      });
      return id;
    },
    updateRoom: (id, patch) => patchRoom(id, (r) => ({ ...r, ...patch })),
    deleteRoom: (id) => {
      cancelled.current[id] = true;
      setRooms((prev) => prev.filter((r) => r.id !== id));
    },
    clearRoom: (id) => patchRoom(id, (r) => ({ ...r, messages: [] })),
    setUserName: (name) => setUserNameState(name.trim() || '나'),
    setKeys: async (next) => {
      setKeysState(next);
      await saveKeys(next);
    },
    sendMessage,
    runDebate,
    stop,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
