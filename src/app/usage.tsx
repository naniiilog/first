import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/ui';
import { api, type UsageInfo, type UsageMember } from '../lib/api';
import { aiOf } from '../lib/ais';
import { lookOf } from '../lib/avatar';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import type { LocalRoom } from '../lib/types';

/** 글자 수 → 토큰 수(대략). 한국어는 1.5자에 1토큰 정도로 어림잡아요. */
const tokensOf = (chars: number) => Math.round(chars / 1.5);
const fmt = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : n.toLocaleString('ko-KR'));

/** 봇 한 명의 오늘 사용량 카드 */
function BotCard({ m, max }: { m: UsageMember; max: number }) {
  const t = useTheme();
  const u = m.usage;
  const tokIn = tokensOf(u.inChars);
  const tokOut = tokensOf(u.outChars);
  const tok = tokIn + tokOut;
  const share = max > 0 ? tok / max : 0;
  const ai = aiOf(m.kind);
  const status = !m.active
    ? { c: '#EF4444', t: '쉬는 중' }
    : m.exhausted
      ? { c: '#F59E0B', t: '사용량 소진' }
      : m.online
        ? { c: '#22C55E', t: '대화 중' }
        : { c: '#9CA3AF', t: '대기' };

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={styles.head}>
        <Avatar bot={lookOf(m.kind, m.avatar)} size={40} dim={!m.active} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{m.name}</Text>
          <Text style={{ color: t.subtext, fontSize: 12 }}>
            {ai.name} · 누적 메시지 {fmt(m.totalMessages)}개
          </Text>
        </View>
        <View style={[styles.status, { backgroundColor: status.c + '22' }]}>
          <View style={[styles.dot, { backgroundColor: status.c }]} />
          <Text style={{ color: status.c, fontSize: 11, fontWeight: '700' }}>{status.t}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="오늘 보낸 메시지" value={`${fmt(u.sent)}개`} />
        <Stat label="방 확인" value={`${fmt(u.calls)}번`} />
        <Stat label="토큰(추정)" value={`약 ${fmt(tok)}`} />
      </View>
      <View style={[styles.barBg, { backgroundColor: t.input }]}>
        <View style={[styles.bar, { width: `${Math.max(share > 0 ? 3 : 0, Math.round(share * 100))}%`, backgroundColor: ai.color }]} />
      </View>
      <Text style={{ color: t.subtext, fontSize: 11 }}>
        읽은 양 약 {fmt(tokIn)} · 쓴 양 약 {fmt(tokOut)} 토큰
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: t.subtext, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

/** 방 하나의 봇 사용량 */
function RoomUsage({ room }: { room: LocalRoom }) {
  const { settings } = useStore();
  const t = useTheme();
  const [info, setInfo] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api.usage(settings, room));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [settings, room]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const members = info?.members ?? [];
  const tok = (m: UsageMember) => tokensOf(m.usage.inChars + m.usage.outChars);
  const max = Math.max(0, ...members.map(tok));
  const sum = members.reduce((n, m) => n + tok(m), 0);
  const sent = members.reduce((n, m) => n + m.usage.sent, 0);

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.roomHead}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{room.name}</Text>
        {info && (
          <Text style={{ color: t.subtext, fontSize: 12 }}>
            오늘 메시지 {fmt(sent)} · 약 {fmt(sum)}토큰
          </Text>
        )}
      </View>
      {error ? <Text style={{ color: t.danger }}>⚠️ {error}</Text> : null}
      {!info && !error ? <ActivityIndicator color={t.accent} /> : null}
      {info && members.length === 0 ? <Text style={{ color: t.subtext }}>아직 초대한 봇이 없어요.</Text> : null}
      {[...members]
        .sort((a, b) => tok(b) - tok(a))
        .map((m) => (
          <BotCard key={m.id} m={m} max={max} />
        ))}
    </View>
  );
}

/** 봇 사용량 대시보드(오늘 0시부터). ?room=방번호면 그 방만 보여줘요. */
export default function UsageScreen() {
  const { room: only } = useLocalSearchParams<{ room?: string }>();
  const { rooms } = useStore();
  const t = useTheme();
  const list = only ? rooms.filter((r) => r.id === only) : rooms;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
      <View style={[styles.note, { backgroundColor: t.accentSoft }]}>
        <Text style={{ color: t.text, fontSize: 12, lineHeight: 18 }}>
          오늘(0시부터) 다봇에서 쓴 양이에요. 토큰은 글자 수로 어림잡은 값이에요.
        </Text>
      </View>
      {list.length === 0 ? <Text style={{ color: t.subtext }}>채팅방이 없어요.</Text> : null}
      {list.map((r) => (
        <RoomUsage key={r.id} room={r} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { borderRadius: 12, padding: 12 },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stats: { flexDirection: 'row', gap: 8 },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
});
