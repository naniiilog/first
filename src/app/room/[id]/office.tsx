import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotStateSheet } from '../../../components/BotStateSheet';
import { Avatar } from '../../../components/ui';
import { api, type Guest } from '../../../lib/api';
import { lookOf, type Look } from '../../../lib/avatar';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { OWNER_ID, SYSTEM_ID, type ChatMessage, type Member } from '../../../lib/types';

/** 말풍선을 띄워 두는 시간: 이 안에 말한 사람 머리 위에 마지막 말이 떠요 */
const BUBBLE_MS = 3 * 60_000;

/** 자리에 앉는 한 사람(방장·초대한 사람·봇) */
interface Seat {
  id: string;
  name: string;
  look: Look;
  badge?: string;
  state: 'talking' | 'here' | 'away' | 'new';
  member?: Member;
}

/** 회의실: 참가자들이 회의 탁자에 둘러앉아 있고, 방금 말한 사람 머리 위에 말풍선이 떠요. */
export default function OfficeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useStore();
  const live = useLiveRoom(id);
  const { room, messages, members, freeTalk, closed, roomInfo } = live;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<string | null>(null);

  // 초대한 사람 목록과 '지금' 시각(말풍선이 사라지게)
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

  const W = Math.min(width - 24, 640);
  const H = Math.round(W * 1.2);
  const leaderId = roomInfo?.leaderId ?? null;

  // ── 자리: 방장 → 초대한 사람 → 참가 중인 봇(가나다) ──
  const seated = members.filter((m) => m.active && !m.exhausted).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const lounge = members.filter((m) => !m.active || m.exhausted).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const seats: Seat[] = [
    { id: OWNER_ID, name: settings.userName === '나' ? '나 (방장)' : `${settings.userName}`, look: { emoji: '🧑‍💼', color: '#7C9CFF' }, badge: '👑', state: 'here' },
    ...guests.map<Seat>((g) => ({ id: `guest:${g.id}`, name: g.name, look: { emoji: '🙂', color: '#8FC1FF' }, state: g.online ? 'here' : g.joined ? 'away' : 'new' })),
    ...seated.map<Seat>((m) => ({
      id: m.id,
      name: m.name,
      look: lookOf(m.kind, m.avatar),
      badge: m.id === leaderId ? '🎖️' : undefined,
      state: m.online ? 'talking' : m.joined ? 'away' : 'new',
      member: m,
    })),
  ];

  // ── 탁자 둘레에 고르게 앉혀요(방장은 맨 위 가운데) ──
  const cx = W / 2;
  const cy = H * 0.56;
  const rx = W * 0.37;
  const ry = H * 0.29;
  const avatarSize = seats.length > 12 ? 34 : seats.length > 8 ? 40 : 46;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, seats.length);
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  };

  // ── 말풍선: 최근 3분 안에 말한 사람 중 가장 최근 2명은 말풍선, 나머지는 💬 표시 ──
  const lastBy = new Map<string, ChatMessage>();
  for (const m of messages) if (m.authorId !== SYSTEM_ID && now - m.createdAt < BUBBLE_MS) lastBy.set(m.authorId, m);
  const recent = [...lastBy.values()].sort((a, b) => b.createdAt - a.createdAt);
  const bubbles = recent.slice(0, 2);
  const chatted = new Set(recent.slice(2).map((m) => m.authorId));
  const newest = bubbles[0]?.authorId;

  const turnNames = roomInfo?.turnOrder?.map((mid) => members.find((m) => m.id === mid)?.name ?? '?') ?? null;
  const turnNow = roomInfo?.turnCurrent ? members.find((m) => m.id === roomInfo.turnCurrent)?.name : null;
  const clock = new Date(now);
  const hhmm = `${clock.getHours()}:${String(clock.getMinutes()).padStart(2, '0')}`;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 12, gap: 12, alignItems: 'center', paddingBottom: insets.bottom + 24 }}>
      <Stack.Screen options={{ title: `🏢 ${room.name} 회의실` }} />

      {/* 회의실 그림 */}
      <View style={[styles.room, { width: W, height: H }]}>
        {/* 벽: 창문 · 화이트보드(공지) · 시계 */}
        <View style={[styles.wall, { height: H * 0.2 }]}>
          <View style={styles.window}>
            <Text style={{ fontSize: 22 }}>{clock.getHours() >= 6 && clock.getHours() < 19 ? '☀️' : '🌙'}</Text>
          </View>
          <View style={styles.board}>
            <Text style={styles.boardTitle}>📌 공지</Text>
            <Text style={styles.boardText} numberOfLines={3}>
              {roomInfo?.notice || '아직 공지가 없어요'}
            </Text>
          </View>
          <View style={styles.clock}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#334' }}>{hhmm}</Text>
          </View>
        </View>
        <Text style={[styles.deco, { left: 8, top: H * 0.22 }]}>🪴</Text>
        <Text style={[styles.deco, { right: 8, top: H * 0.22 }]}>🗄️</Text>
        <Text style={[styles.deco, { left: 8, bottom: 6 }]}>🚪</Text>
        <Text style={[styles.deco, { right: 8, bottom: 6 }]}>🪴</Text>

        {/* 회의 탁자 */}
        <View style={[styles.table, { left: cx - W * 0.27, top: cy - H * 0.17, width: W * 0.54, height: H * 0.34, borderRadius: W }]}>
          <Text style={{ fontSize: 16 }}>☕ 📄 💻 📄 ☕</Text>
          <Text style={styles.tableText}>
            {closed ? '🌙 모두 쉬는 중' : freeTalk ? '🗣️ 자동대화 중' : '🤫 부르면 답해요'}
            {roomInfo?.quietNow ? ' · 매너타임' : ''}
          </Text>
          {turnNames ? (
            <Text style={styles.tableSub} numberOfLines={2}>
              순서: {turnNames.join(' → ')}
              {turnNow ? `\n지금: ${turnNow}` : ''}
            </Text>
          ) : null}
        </View>

        {/* 자리 */}
        {seats.map((s, i) => {
          const p = pos(i);
          const box = avatarSize + 28;
          return (
            <Pressable
              key={s.id}
              disabled={!s.member}
              onPress={() => s.member && setPicked(s.member.id)}
              accessibilityLabel={`${s.name} ${stateLabel(s.state)}`}
              style={[styles.seat, { left: p.x - box / 2, top: p.y - avatarSize / 2 - 6, width: box }]}
            >
              <View style={[styles.chair, { width: avatarSize + 10, height: avatarSize + 10, borderRadius: (avatarSize + 10) * 0.35 }]} />
              <Bob active={s.id === newest}>
                <View style={[styles.ring, { borderColor: ringColor(s.state), opacity: s.state === 'away' || s.state === 'new' ? 0.55 : 1 }]}>
                  <Avatar bot={s.look} size={avatarSize} />
                </View>
              </Bob>
              {s.badge ? <Text style={styles.badge}>{s.badge}</Text> : null}
              <View style={styles.nameTag}>
                <View style={[styles.dot, { backgroundColor: ringColor(s.state) }]} />
                <Text style={styles.nameText} numberOfLines={1}>
                  {s.name}
                </Text>
              </View>
              {s.state === 'away' ? <Text style={styles.zz}>💤</Text> : chatted.has(s.id) ? <Text style={styles.zz}>💬</Text> : null}
            </Pressable>
          );
        })}

        {/* 말풍선: 위쪽 자리는 아래로, 아래쪽 자리는 위로 띄워요 */}
        {bubbles.map((m) => {
          const i = seats.findIndex((s) => s.id === m.authorId);
          if (i < 0) return null;
          const p = pos(i);
          const bw = Math.min(180, W * 0.46);
          const left = Math.max(4, Math.min(W - bw - 4, p.x - bw / 2));
          return (
            <View
              key={m.id}
              pointerEvents="none"
              style={[
                styles.bubble,
                { width: bw, left, opacity: m.authorId === newest ? 1 : 0.82 },
                // 늘 머리 위에 띄워요
                { bottom: H - (p.y - avatarSize / 2 - 8), zIndex: m.authorId === newest ? 3 : 2 },
                m.authorId === newest && { borderColor: '#F59E0B', borderWidth: 2 },
              ]}
            >
              <Text style={styles.bubbleText} numberOfLines={3}>
                <Text style={{ fontWeight: '800' }}>{seats[i].name}: </Text>
                {m.image && !m.text ? '📷 사진' : m.text}
              </Text>
              <View style={[styles.tail, { left: Math.max(8, Math.min(bw - 20, p.x - left - 6)), borderTopColor: m.authorId === newest ? '#F59E0B' : '#D6DAE4' }]} />
            </View>
          );
        })}
      </View>

      {/* 휴게실: 쉬는 봇 · 사용량 소진 봇 */}
      <View style={[styles.lounge, { width: W }]}>
        <Text style={{ fontWeight: '800', color: '#5B4636' }}>☕ 휴게실 {lounge.length ? `· ${lounge.length}명` : ''}</Text>
        {lounge.length ? (
          <View style={styles.loungeRow}>
            {lounge.map((m) => (
              <Pressable key={m.id} onPress={() => setPicked(m.id)} style={styles.loungeItem}>
                <Avatar bot={lookOf(m.kind, m.avatar)} size={30} dim />
                <Text style={{ fontSize: 11, color: '#5B4636' }} numberOfLines={1}>
                  {m.exhausted && m.active ? '😴 ' : '🛋️ '}
                  {m.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#8A7564', fontSize: 12 }}>쉬는 봇이 없어요. 모두 회의 중!</Text>
        )}
      </View>

      {/* 보는 법 */}
      <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18, width: W }}>
        🟢 대화 중 · ⚪ 연결 끊김(💤, 다시 불러야 해요) · 🔵 아직 안 들어옴 · 👑 방장 · 🎖️ 봇 대장{'\n'}
        말풍선은 최근 3분 안에 한 말이에요(노란 테두리가 가장 최근, 💬는 그 전에 말한 사람). 봇을 누르면 상태를 바꿀 수 있어요.
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

const stateLabel = (s: Seat['state']) => (s === 'talking' ? '대화 중' : s === 'here' ? '있음' : s === 'away' ? '연결 끊김' : '아직 안 들어옴');
const ringColor = (s: Seat['state']) => (s === 'talking' || s === 'here' ? '#22C55E' : s === 'away' ? '#A0A6B4' : '#7C9CFF');

/** 가장 최근에 말한 사람은 살짝 통통 튀어요 */
function Bob({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      y.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -4, duration: 380, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(y, { toValue: 0, duration: 380, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, y]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  room: { backgroundColor: '#EADBC6', borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: '#C9B193' },
  wall: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: '#DDE6F1', borderBottomWidth: 4, borderBottomColor: '#B9C6D8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10 },
  window: { width: 46, height: '62%', borderRadius: 6, backgroundColor: '#BFE3FF', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  board: { flex: 1, height: '78%', backgroundColor: '#FFFFFF', borderRadius: 6, borderWidth: 3, borderColor: '#9AA6B8', paddingHorizontal: 8, paddingVertical: 4 },
  boardTitle: { fontSize: 10, fontWeight: '800', color: '#C2410C' },
  boardText: { fontSize: 11, color: '#223', lineHeight: 15 },
  clock: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#334', alignItems: 'center', justifyContent: 'center' },
  deco: { position: 'absolute', fontSize: 24 },
  table: { position: 'absolute', backgroundColor: '#B98A5E', borderWidth: 6, borderColor: '#9A6E45', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 16 },
  tableText: { color: '#FFF8EE', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  tableSub: { color: '#FFEBD2', fontSize: 11, textAlign: 'center' },
  seat: { position: 'absolute', alignItems: 'center' },
  chair: { position: 'absolute', top: -5, backgroundColor: '#6B7FA8', opacity: 0.85 },
  ring: { borderWidth: 3, borderRadius: 999, padding: 1, backgroundColor: '#FFFFFF' },
  badge: { position: 'absolute', top: -8, right: 4, fontSize: 16 },
  zz: { position: 'absolute', top: -10, left: 2, fontSize: 14 },
  nameTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, maxWidth: '100%' },
  nameText: { fontSize: 10, fontWeight: '700', color: '#223', flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bubble: { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: '#D6DAE4', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tail: { position: 'absolute', bottom: -8, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  bubbleText: { fontSize: 11, color: '#223', lineHeight: 15 },
  lounge: { backgroundColor: '#F3E6D3', borderRadius: 16, borderWidth: 2, borderColor: '#D9C2A3', padding: 12, gap: 8 },
  loungeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  loungeItem: { alignItems: 'center', gap: 2, width: 64 },
});
