import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { chat, DEFAULT_APP_TOKEN, DEFAULT_SERVER_URL, fetchAvailable, type AiStatus } from './api';
import { buildSystemPrompt, buildTurns, displayName, pickNextSpeaker, type Mode } from './conversation';
import { loadData, saveData } from './storage';
import { DEFAULT_TOKEN_BUDGET, SYSTEM_ID, USER_ID, type ChatMessage, type Member, type Room, type Settings } from './types';

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 자유 대화에서 봇이 말한 뒤 잠깐 쉬는 시간(ms). 무료 사용량의 분당 제한에 걸리지 않도록 여유를 둬요. */
const FREE_TALK_PAUSE_MS = 4000;

export interface RoomActivity {
  typingMemberId: string | null;
  busy: boolean;
  freeTalk: boolean;
}

const IDLE: RoomActivity = { typingMemberId: null, busy: false, freeTalk: false };

export interface NewMember {
  aiId: string;
  name: string;
}

interface Store {
  ready: boolean;
  rooms: Room[];
  settings: Settings;
  /** 서버에서 쓸 수 있는 AI와 진짜/따라하기 여부. 서버에 못 붙었으면 null */
  available: AiStatus | null;
  activityOf: (roomId: string) => RoomActivity;
  createRoom: (name: string, members: NewMember[]) => string;
  renameRoom: (roomId: string, name: string) => void;
  deleteRoom: (roomId: string) => void;
  clearRoom: (roomId: string) => void;
  inviteMember: (roomId: string, member: NewMember) => void;
  updateMember: (roomId: string, memberId: string, patch: Partial<Pick<Member, 'name' | 'active'>>) => void;
  removeMember: (roomId: string, memberId: string) => void;
  addBudget: (roomId: string, amount: number) => void;
  sendMessage: (roomId: string, text: string) => void;
  setFreeTalk: (roomId: string, on: boolean) => void;
  stopAll: (roomId: string) => void;
  saveSettings: (s: Settings) => void;
  refreshAvailable: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<Settings>({ userName: '나', serverUrl: DEFAULT_SERVER_URL, appToken: DEFAULT_APP_TOKEN });
  const [available, setAvailable] = useState<AiStatus | null>(null);
  const [activity, setActivity] = useState<Record<string, RoomActivity>>({});

  // 비동기 대화 루프가 항상 최신 상태를 읽도록 ref에도 보관해요.
  const roomsRef = useRef(rooms);
  const settingsRef = useRef(settings);
  roomsRef.current = rooms;
  settingsRef.current = settings;
  /** 사용자 메시지에 답할 차례를 기다리는 멤버들 */
  const replyQueue = useRef<Record<string, string[]>>({});
  const freeTalk = useRef<Record<string, boolean>>({});
  const running = useRef<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const data = await loadData();
      if (data) {
        setRooms(data.rooms);
        setSettings((s) => ({ ...s, ...data.settings }));
        settingsRef.current = { ...settingsRef.current, ...data.settings };
      }
      setReady(true);
      setAvailable(await fetchAvailable(settingsRef.current));
    })();
  }, []);

  useEffect(() => {
    if (ready) saveData({ rooms, settings });
  }, [ready, rooms, settings]);

  const patchRoom = useCallback((roomId: string, fn: (room: Room) => Room) => {
    setRooms((prev) => {
      const next = prev.map((r) => (r.id === roomId ? fn(r) : r));
      roomsRef.current = next;
      return next;
    });
  }, []);

  const append = useCallback(
    (roomId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'>) =>
      patchRoom(roomId, (r) => ({ ...r, messages: [...r.messages, { ...msg, id: newId(), createdAt: Date.now() }] })),
    [patchRoom],
  );

  const setAct = useCallback((roomId: string, patch: Partial<RoomActivity>) => {
    setActivity((prev) => ({ ...prev, [roomId]: { ...(prev[roomId] ?? IDLE), ...patch } }));
  }, []);

  const speak = useCallback(
    async (roomId: string, memberId: string, mode: Mode) => {
      const room = roomsRef.current.find((r) => r.id === roomId);
      const me = room?.members.find((m) => m.id === memberId);
      if (!room || !me) return;
      const s = settingsRef.current;
      setAct(roomId, { typingMemberId: memberId });
      try {
        const result = await chat(
          s,
          me.aiId,
          buildSystemPrompt(me, room.members, s.userName, mode),
          buildTurns(me, room.messages, room.members, s.userName, mode),
        );
        const name = displayName(me).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const text = result.text.replace(new RegExp(`^(\\[${name}\\]|${name}\\s*[:：])\\s*`), '') || result.text;
        patchRoom(roomId, (r) => ({ ...r, tokensUsed: r.tokensUsed + result.usage.input + result.usage.output }));
        append(roomId, { authorId: memberId, text });
      } catch (err) {
        append(roomId, { authorId: memberId, text: err instanceof Error ? err.message : String(err), error: true });
        // 오류가 나면 자유 대화를 멈춰서 같은 오류로 계속 요청하지 않게 해요.
        freeTalk.current[roomId] = false;
        setAct(roomId, { freeTalk: false });
      } finally {
        setAct(roomId, { typingMemberId: null });
      }
    },
    [append, patchRoom, setAct],
  );

  /** 방마다 하나만 도는 대화 루프. 답장 대기열을 먼저 처리하고, 자유 대화가 켜져 있으면 계속 이어가요. */
  const kick = useCallback(
    async (roomId: string) => {
      if (running.current[roomId]) return;
      running.current[roomId] = true;
      setAct(roomId, { busy: true });
      try {
        while (true) {
          const room = roomsRef.current.find((r) => r.id === roomId);
          if (!room) break;
          const queue = replyQueue.current[roomId] ?? [];
          const isFree = !!freeTalk.current[roomId];
          if (queue.length === 0 && !isFree) break;

          if (room.tokensUsed >= room.tokenBudget) {
            replyQueue.current[roomId] = [];
            freeTalk.current[roomId] = false;
            setAct(roomId, { freeTalk: false });
            append(roomId, {
              authorId: SYSTEM_ID,
              text: `토큰 한도(${room.tokenBudget.toLocaleString()})에 도달해서 대화를 멈췄어요. 위쪽 토큰 표시를 눌러 한도를 늘릴 수 있어요.`,
            });
            break;
          }

          let speaker: Member | null | undefined;
          let mode: Mode;
          if (queue.length > 0) {
            const nextId = queue.shift();
            speaker = room.members.find((m) => m.id === nextId && m.active);
            mode = 'reply';
          } else {
            speaker = pickNextSpeaker(room.members, room.messages);
            mode = 'free';
            if (!speaker) {
              freeTalk.current[roomId] = false;
              setAct(roomId, { freeTalk: false });
              append(roomId, { authorId: SYSTEM_ID, text: '대화에 참가 중인 봇이 없어서 자유 대화를 멈췄어요.' });
              break;
            }
          }
          if (!speaker) continue;
          await speak(roomId, speaker.id, mode);
          if (freeTalk.current[roomId] && (replyQueue.current[roomId] ?? []).length === 0) {
            await new Promise((r) => setTimeout(r, FREE_TALK_PAUSE_MS));
          }
        }
      } finally {
        running.current[roomId] = false;
        setAct(roomId, { busy: false, typingMemberId: null });
      }
    },
    [append, setAct, speak],
  );

  const stopAll = useCallback(
    (roomId: string) => {
      replyQueue.current[roomId] = [];
      freeTalk.current[roomId] = false;
      setAct(roomId, { freeTalk: false });
    },
    [setAct],
  );

  const value: Store = {
    ready,
    rooms,
    settings,
    available,
    activityOf: (roomId) => activity[roomId] ?? IDLE,
    createRoom: (name, members) => {
      const id = newId();
      const room: Room = {
        id,
        name,
        members: members.map((m) => ({ id: newId(), aiId: m.aiId, name: m.name.trim(), active: true })),
        messages: [],
        createdAt: Date.now(),
        tokensUsed: 0,
        tokenBudget: DEFAULT_TOKEN_BUDGET,
      };
      setRooms((prev) => {
        const next = [room, ...prev];
        roomsRef.current = next;
        return next;
      });
      return id;
    },
    renameRoom: (roomId, name) => patchRoom(roomId, (r) => ({ ...r, name: name.trim() || r.name })),
    deleteRoom: (roomId) => {
      stopAll(roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    },
    clearRoom: (roomId) => {
      stopAll(roomId);
      patchRoom(roomId, (r) => ({ ...r, messages: [] }));
    },
    inviteMember: (roomId, m) => {
      const member: Member = { id: newId(), aiId: m.aiId, name: m.name.trim(), active: true };
      patchRoom(roomId, (r) => ({ ...r, members: [...r.members, member] }));
      append(roomId, { authorId: SYSTEM_ID, text: `${displayName(member)}이(가) 초대됐어요.` });
    },
    updateMember: (roomId, memberId, patch) => {
      const before = roomsRef.current.find((r) => r.id === roomId)?.members.find((m) => m.id === memberId);
      patchRoom(roomId, (r) => ({ ...r, members: r.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)) }));
      if (before && patch.active !== undefined && patch.active !== before.active) {
        if (!patch.active) {
          replyQueue.current[roomId] = (replyQueue.current[roomId] ?? []).filter((id) => id !== memberId);
        }
        append(roomId, {
          authorId: SYSTEM_ID,
          text: patch.active ? `${displayName(before)}이(가) 대화에 다시 참가했어요.` : `${displayName(before)}이(가) 대화 참가를 멈췄어요.`,
        });
      }
    },
    removeMember: (roomId, memberId) => {
      const before = roomsRef.current.find((r) => r.id === roomId)?.members.find((m) => m.id === memberId);
      replyQueue.current[roomId] = (replyQueue.current[roomId] ?? []).filter((id) => id !== memberId);
      patchRoom(roomId, (r) => ({ ...r, members: r.members.filter((m) => m.id !== memberId) }));
      if (before) append(roomId, { authorId: SYSTEM_ID, text: `${displayName(before)}이(가) 방에서 나갔어요.` });
    },
    addBudget: (roomId, amount) => patchRoom(roomId, (r) => ({ ...r, tokenBudget: Math.max(r.tokensUsed, r.tokenBudget) + amount })),
    sendMessage: (roomId, text) => {
      const room = roomsRef.current.find((r) => r.id === roomId);
      if (!room || !text.trim()) return;
      append(roomId, { authorId: USER_ID, text: text.trim() });
      if (!freeTalk.current[roomId]) {
        // 자유 대화가 꺼져 있으면 참가 중인 봇들이 한 번씩 차례로 답해요.
        replyQueue.current[roomId] = room.members.filter((m) => m.active).map((m) => m.id);
      }
      // 자유 대화 중이면 따로 줄 세우지 않아도 다음 봇이 내 말에 반응해요.
      kick(roomId);
    },
    setFreeTalk: (roomId, on) => {
      freeTalk.current[roomId] = on;
      setAct(roomId, { freeTalk: on });
      if (on) kick(roomId);
    },
    stopAll,
    saveSettings: (s) => {
      const next = { ...s, userName: s.userName.trim() || '나', serverUrl: s.serverUrl.trim() };
      setSettings(next);
      settingsRef.current = next;
      fetchAvailable(next).then(setAvailable);
    },
    refreshAvailable: async () => setAvailable(await fetchAvailable(settingsRef.current)),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
