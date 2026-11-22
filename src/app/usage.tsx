import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/ui';
import { api, type UsageInfo, type UsageMember } from '../lib/api';
import { aiOf, limitOf } from '../lib/ais';
import { lookOf } from '../lib/avatar';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import type { LocalRoom } from '../lib/types';

/** 글자 수 → 토큰 수(대략). 한국어는 1.5자에 1토큰 정도로 어림잡아요. */
const tokensOf = (chars: number) => Math.round(chars / 1.5);
const fmt = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : n.toLocaleString('ko-KR'));
const pad2 = (n: number) => String(n).padStart(2, '0');

function clock(at: number) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function left(ms: number) {
  if (ms <= 0) return '곧';
  const m = Math.ceil(ms / 60_000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}시간 ${m % 60}분 뒤` : `${m}분 뒤`;
}
const resetLabel = (r: UsageMember['reset']) => (r.mode === 'daily' ? `매일 ${pad2(r.value)}시` : `${r.value}시간마다`);

const HOURS_EVERY = [1, 3, 5, 8, 12, 24];
const DAILY_AT = Array.from({ length: 24 }, (_, i) => i);

/** 봇 한 명의 사용량 카드 */
function BotCard({ m, max, now, onReset, onClear }: {
  m: UsageMember;
  max: number;
  now: number;
  onReset: (mode: 'daily' | 'hours', value: number) => void;
  onClear: () => void;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const u = m.usage;
  const tokIn = tokensOf(u.inChars);
  const tokOut = tokensOf(u.outChars);
  const tok = tokIn + tokOut;
  const share = max > 0 ? tok / max : 0;
  const ai = aiOf(m.kind);
  const status = !m.active ? { c: '#EF4444', t: '쉬는 중' } : m.online ? { c: '#22C55E', t: '대화 중' } : { c: '#9CA3AF', t: '대기' };

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

      {/* 이번 주기 숫자 */}
      <View style={styles.stats}>
        <Stat label="보낸 메시지" value={`${fmt(u.sent)}개`} />
        <Stat label="방 확인" value={`${fmt(u.calls)}번`} />
        <Stat label="토큰(추정)" value={`약 ${fmt(tok)}`} />
      </View>
      <View style={[styles.barBg, { backgroundColor: t.input }]}>
        <View style={[styles.bar, { width: `${Math.max(share > 0 ? 3 : 0, Math.round(share * 100))}%`, backgroundColor: ai.color }]} />
      </View>
      <Text style={{ color: t.subtext, fontSize: 11 }}>
        읽은 양 약 {fmt(tokIn)} · 쓴 양 약 {fmt(tokOut)} 토큰 {u.since ? `· ${clock(u.since)}부터` : '· 이번 주기 사용 없음'}
      </Text>

      {/* 그 AI 앱의 한도가 다시 차는 방식 */}
      <View style={[styles.limit, { borderColor: t.border }]}>
        <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>
          📘 {ai.name} 한도{' '}
          <Text style={{ color: t.subtext, fontWeight: '500' }}>
            ({limitOf(m.kind).basis === 'official' ? '회사 안내' : limitOf(m.kind).basis === 'reported' ? '기사·사용자 보고' : '확인 안 됨'})
          </Text>
        </Text>
        <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 17 }}>{limitOf(m.kind).text}</Text>
      </View>

      {/* 초기화 */}
      <Pressable onPress={() => setEditing((v) => !v)} style={[styles.resetRow, { backgroundColor: t.input }]}>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>🔄 {resetLabel(m.reset)} 초기화</Text>
        <Text style={{ color: t.subtext, fontSize: 12, flex: 1, textAlign: 'right' }} numberOfLines={1}>
          {u.resetAt ? `다음 ${clock(u.resetAt)} (${left(u.resetAt - now)})` : '첫 사용부터 시작'}
        </Text>
        <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>{editing ? '닫기' : '바꾸기'}</Text>
      </Pressable>
      {editing && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.subtext, fontSize: 12 }}>그 AI 앱의 한도가 다시 차는 때에 맞춰 주세요.</Text>
          <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>몇 시간마다 (첫 사용부터)</Text>
          <View style={styles.chips}>
            {HOURS_EVERY.map((h) => (
              <Choice key={h} label={`${h}시간`} on={m.reset.mode === 'hours' && m.reset.value === h} onPress={() => onReset('hours', h)} />
            ))}
          </View>
          <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>매일 정해진 시각</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {DAILY_AT.map((h) => (
              <Choice key={h} label={`${pad2(h)}시`} on={m.reset.mode === 'daily' && m.reset.value === h} onPress={() => onReset('daily', h)} />
            ))}
          </ScrollView>
          <Pressable
            onPress={() => {
              if (!armed) return setArmed(true);
              setArmed(false);
              onClear();
            }}
            style={[styles.clear, { borderColor: armed ? t.danger : t.border }]}
          >
            <Text style={{ color: t.danger, fontWeight: '700', fontSize: 13 }}>{armed ? '한 번 더 누르면 0으로 돌려요' : '지금 초기화'}</Text>
          </Pressable>
        </View>
      )}
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

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, { backgroundColor: on ? t.accent : t.card, borderColor: on ? t.accent : t.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: on ? t.accentText : t.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** 방 하나의 봇 사용량 */
function RoomUsage({ room, now }: { room: LocalRoom; now: number }) {
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

  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
            이번 주기 메시지 {fmt(sent)} · 약 {fmt(sum)}토큰
          </Text>
        )}
      </View>
      {error ? <Text style={{ color: t.danger }}>⚠️ {error}</Text> : null}
      {!info && !error ? <ActivityIndicator color={t.accent} /> : null}
      {info && members.length === 0 ? <Text style={{ color: t.subtext }}>아직 초대한 봇이 없어요.</Text> : null}
      {[...members]
        .sort((a, b) => tok(b) - tok(a))
        .map((m) => (
          <BotCard
            key={m.id}
            m={m}
            max={max}
            now={now}
            onReset={(mode, value) => act(api.setReset(settings, room, m.id, mode, value))}
            onClear={() => act(api.resetUsage(settings, room, m.id))}
          />
        ))}
    </View>
  );
}

/** 봇 사용량 대시보드. ?room=방번호면 그 방만 보여줘요. */
export default function UsageScreen() {
  const { room: only } = useLocalSearchParams<{ room?: string }>();
  const { rooms } = useStore();
  const t = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const list = only ? rooms.filter((r) => r.id === only) : rooms;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
      <View style={[styles.note, { backgroundColor: t.accentSoft }]}>
        <Text style={{ color: t.text, fontSize: 12, lineHeight: 18 }}>
          숫자는 다봇에서 쓴 양이에요(토큰은 글자 수로 어림잡은 값). 초기화 주기는 각 AI 앱의 한도가 다시 차는 방식에 맞춰 미리 넣어 뒀어요(2026년 11월 기준). 요금제마다 다를 수 있어서, 다르면
          “바꾸기”로 고쳐 주세요.
        </Text>
      </View>
      {list.length === 0 ? <Text style={{ color: t.subtext }}>채팅방이 없어요.</Text> : null}
      {list.map((r) => (
        <RoomUsage key={r.id} room={r} now={now} />
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
  limit: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, gap: 3 },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  clear: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
