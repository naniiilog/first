import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotStateSheet } from '../../../components/BotStateSheet';
import { OWNER_SKIN, PixelOffice, SKINS, officeHeight, type Char } from '../../../components/PixelOffice';
import { api, type Guest } from '../../../lib/api';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { OWNER_ID, SYSTEM_ID, type ChatMessage } from '../../../lib/types';

/** 말풍선을 띄워 두는 시간 */
const BUBBLE_MS = 3 * 60_000;

/** 회의실: 도트 게임처럼 캐릭터들이 사무실을 돌아다니고, 말하면 머리 위에 말풍선이 떠요. */
export default function OfficeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useStore();
  const live = useLiveRoom(id);
  const { room, messages, members, freeTalk, closed, roomInfo } = live;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    let alive = true;
    const load = () => api.guests(settings, room).then((r) => alive && setGuests(r.guests)).catch(() => {});
    const first = setTimeout(load, 0);
    const g = setInterval(load, 20_000);
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(g);
      clearInterval(tick);
    };
  }, [room, settings]);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;

  const leaderId = roomInfo?.leaderId ?? null;

  // 말풍선: 최근 3분 안에 말한 사람 중 가장 최근 2명
  const lastBy = new Map<string, ChatMessage>();
  for (const m of messages) if (m.authorId !== SYSTEM_ID && now - m.createdAt < BUBBLE_MS) lastBy.set(m.authorId, m);
  const recent = [...lastBy.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  const bubbleOf = (cid: string) => {
    const i = recent.findIndex((m) => m.authorId === cid);
    if (i < 0) return undefined;
    const m = recent[i];
    return { text: m.image && !m.text ? '📷 사진' : m.text, newest: i === 0 };
  };

  // 캐릭터 그림이 방 안에서 겹치지 않게: 들어온 순서대로 30가지 중 하나씩(방장 그림은 빼고)
  const pool = Array.from({ length: SKINS }, (_, i) => i).filter((i) => i !== OWNER_SKIN);
  const order = [...guests.map((g) => `guest:${g.id}`), ...[...members].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).map((m) => m.id)];
  const skinFor = (cid: string) => pool[Math.max(0, order.indexOf(cid)) % pool.length];

  const chars: Char[] = [
    { id: OWNER_ID, name: settings.userName === '나' ? '나' : settings.userName, kind: 'owner', state: 'here', badge: '👑', bubble: bubbleOf(OWNER_ID) },
    ...guests.map<Char>((g) => ({
      id: `guest:${g.id}`,
      name: g.name,
      kind: 'guest',
      skin: skinFor(`guest:${g.id}`),
      state: g.online ? 'here' : g.joined ? 'away' : 'new',
      bubble: bubbleOf(`guest:${g.id}`),
    })),
    ...members.map<Char>((m) => ({
      id: m.id,
      name: m.name,
      kind: 'bot',
      skin: skinFor(m.id),
      state: !m.active || m.exhausted ? 'rest' : m.online ? 'talking' : m.joined ? 'away' : 'new',
      badge: m.id === leaderId ? '🎖️' : undefined,
      bubble: bubbleOf(m.id),
      onPress: () => setPicked(m.id),
    })),
  ];

  const turnNow = roomInfo?.turnCurrent ? members.find((m) => m.id === roomInfo.turnCurrent)?.name : null;
  const status = closed ? '모두 쉬는 중' : turnNow ? `순서: ${turnNow} 차례` : freeTalk ? '자동대화 중' : '부르면 답해요';
  const clock = new Date(now);
  const hhmm = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
  const officeH = officeHeight(height);

  return (
    <ScrollView style={{ backgroundColor: '#1A1424' }} contentContainerStyle={{ paddingVertical: 8, gap: 10, alignItems: 'center', paddingBottom: insets.bottom + 24 }}>
      <Stack.Screen options={{ title: `🏢 ${room.name}` }} />
      <PixelOffice height={officeH} viewWidth={width} chars={chars} notice={roomInfo?.notice ?? ''} status={status} clock={hhmm} />
      <Text style={{ color: '#CFC6E0', fontSize: 12, lineHeight: 18, width: width - 24 }}>
        ↔️ 좌우로 밀어서 사무실 전체를 볼 수 있어요.{'\n'}
        🟩 대화 중(돌아다녀요) · ⬜ 연결 끊김(컴퓨터 자리에서 z z, 다시 불러야 해요) · 🟦 아직 안 옴(출입문 앞) · 🟥 쉬는 중(소파·빈백){'\n'}
        👑 방장 · 🎖️ 봇 대장 · 말하면 회의실 의자로 걸어가서 머리 위에 말풍선이 떠요(노란 테두리가 가장 최근). 봇을 누르면 상태를 바꿀 수 있어요.{'\n'}
        캐릭터 그림: Kenney (kenney.nl, CC0)
      </Text>

      <BotStateSheet
        member={members.find((m) => m.id === picked) ?? null}
        onClose={() => setPicked(null)}
        onProfile={() => {}}
        onPick={(m, state) => live.setMemberState(m, { active: state !== 'off', exhausted: state === 'off' ? !!m.exhausted : state === 'exhausted' })}
        roomInterval={roomInfo?.checkIntervalMin ?? 0}
        onInterval={(m, v) => live.setMemberInterval(m, v)}
        leader={!!picked && picked === leaderId}
        onLeader={(m, on) => api.setBoard(settings, room, { leaderId: on ? m.id : null }).then(() => live.refreshMembers()).catch(() => {})}
      />
    </ScrollView>
  );
}
