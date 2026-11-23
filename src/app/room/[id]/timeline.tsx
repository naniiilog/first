import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { SYSTEM_ID, type ChatMessage } from '../../../lib/types';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** 타임라인: 달력에서 날짜를 누르면 그날 시간별로 무슨 얘기를 했는지 보여줘요. */
export default function TimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, settings } = useStore();
  const room = rooms.find((r) => r.id === id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [today] = useState(() => new Date());
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [offset, setOffset] = useState(9 * 3600);
  const [picked, setPicked] = useState(key(today.getFullYear(), today.getMonth(), today.getDate()));
  const [day, setDay] = useState<ChatMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이 달의 날짜별 글 수
  const loadMonth = useCallback(async () => {
    if (!room) return;
    try {
      const from = Date.UTC(ym.y, ym.m, 1) - 14 * 3600_000;
      const to = Date.UTC(ym.y, ym.m + 1, 1) + 14 * 3600_000;
      const res = await api.days(settings, room, from, to);
      setOffset(res.offsetSec);
      setCounts(Object.fromEntries(res.days.map((x) => [x.d, x.n])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [room, settings, ym]);

  // 고른 날의 글
  const loadDay = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      const [y, m, d] = picked.split('-').map(Number);
      const from = Date.UTC(y, m - 1, d) - offset * 1000;
      const res = await api.timeline(settings, room, from, from + 86_400_000);
      setDay(res.messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [room, settings, picked, offset]);

  useEffect(() => {
    const timer = setTimeout(loadMonth, 0);
    return () => clearTimeout(timer);
  }, [loadMonth]);
  useEffect(() => {
    const timer = setTimeout(loadDay, 0);
    return () => clearTimeout(timer);
  }, [loadDay]);

  /** 그날 글을 시간별로 묶어요(방 시간대 기준) */
  const sections = useMemo(() => {
    const talk = (day ?? []).filter((m) => m.authorId !== SYSTEM_ID);
    const byHour = new Map<number, ChatMessage[]>();
    for (const m of talk) {
      const h = new Date(m.createdAt + offset * 1000).getUTCHours();
      byHour.set(h, [...(byHour.get(h) ?? []), m]);
    }
    return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, data]) => ({ h, data }));
  }, [day, offset]);

  const summary = useMemo(() => {
    const talk = (day ?? []).filter((m) => m.authorId !== SYSTEM_ID);
    const by = new Map<string, number>();
    for (const m of talk) by.set(m.authorName, (by.get(m.authorName) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total: talk.length, top };
  }, [day]);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;

  // 달력 칸: 첫 주 앞쪽 빈칸 + 날짜
  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const daysIn = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const max = Math.max(1, ...Object.values(counts));
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  const move = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const [py, pm, pd] = picked.split('-').map(Number);

  const calendar = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => move(-1)} hitSlop={10} accessibilityLabel="이전 달">
            <Text style={{ color: t.accent, fontSize: 20, fontWeight: '800' }}>‹</Text>
          </Pressable>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>
            {ym.y}년 {ym.m + 1}월
          </Text>
          <Pressable onPress={() => move(1)} hitSlop={10} accessibilityLabel="다음 달">
            <Text style={{ color: t.accent, fontSize: 20, fontWeight: '800' }}>›</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEK.map((w, i) => (
            <Text key={w} style={[styles.week, { color: i === 0 ? '#EF4444' : i === 6 ? t.accent : t.subtext }]}>
              {w}
            </Text>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const k = key(ym.y, ym.m, d);
            const n = counts[k] ?? 0;
            const on = k === picked;
            return (
              <Pressable
                key={k}
                onPress={() => setPicked(k)}
                accessibilityLabel={`${ym.m + 1}월 ${d}일 대화 ${n}개`}
                style={[styles.cell, on && { backgroundColor: t.accent, borderRadius: 10 }, !on && k === todayKey && { borderWidth: 1, borderColor: t.accent, borderRadius: 10 }]}
              >
                <Text style={{ color: on ? t.accentText : t.text, fontWeight: n ? '800' : '400', fontSize: 14 }}>{d}</Text>
                {n ? (
                  <View style={[styles.dot, { backgroundColor: on ? t.accentText : t.accentPurple, opacity: on ? 1 : 0.35 + 0.65 * (n / max) }]} />
                ) : (
                  <View style={styles.dotSpace} />
                )}
                {n ? <Text style={{ color: on ? t.accentText : t.subtext, fontSize: 9 }}>{n > 999 ? '999+' : n}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ paddingHorizontal: 4, gap: 2 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>
          {pm}월 {pd}일 ({WEEK[new Date(py, pm - 1, pd).getDay()]})
        </Text>
        <Text style={{ color: t.subtext, fontSize: 13 }}>
          {busy
            ? '불러오는 중…'
            : summary.total
              ? `대화 ${summary.total}개 · 많이 말한 순: ${summary.top.map(([name, n]) => `${name} ${n}`).join(', ')}`
              : '이날은 대화가 없어요.'}
        </Text>
        {error ? <Text style={{ color: t.danger }}>⚠️ {error}</Text> : null}
      </View>
    </View>
  );

  return (
    <SectionList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 30 }}
      sections={sections}
      keyExtractor={(m) => String(m.id)}
      ListHeaderComponent={calendar}
      ListEmptyComponent={busy ? <ActivityIndicator style={{ marginTop: 20 }} color={t.accent} /> : undefined}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={[styles.hour, { backgroundColor: t.bg }]}>
          <Text style={{ color: t.accent, fontWeight: '800' }}>
            {pad2(section.h)}시 <Text style={{ color: t.subtext, fontWeight: '500', fontSize: 12 }}>· {section.data.length}개</Text>
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const d = new Date(item.createdAt + offset * 1000);
        return (
          <Pressable
            onPress={() => router.navigate({ pathname: '/room/[id]', params: { id: room.id, jump: String(item.id) } })}
            style={({ pressed }) => [styles.line, { backgroundColor: pressed ? t.input : t.card, borderColor: t.border }]}
          >
            <Text style={{ color: t.subtext, fontSize: 11, width: 38 }}>
              {pad2(d.getUTCHours())}:{pad2(d.getUTCMinutes())}
            </Text>
            <Text style={{ color: t.text, fontSize: 13, flex: 1, lineHeight: 19 }} numberOfLines={2}>
              <Text style={{ fontWeight: '700' }}>{item.authorName}</Text> {item.image ? '📷 ' : ''}
              {item.text || (item.image ? '사진' : '')}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '700', paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, height: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSpace: { height: 6 },
  hour: { paddingVertical: 6, paddingHorizontal: 4 },
  line: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
});
