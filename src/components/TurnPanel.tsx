import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lookOf } from '../lib/avatar';
import { useTheme } from '../lib/theme';
import type { Member } from '../lib/types';
import { Avatar } from './ui';

/** 채팅 위에 보이는 순서 대화 줄: 순서와 지금 차례, 다음 차례로 · 순서 바꾸기 · 끝내기 */
export function TurnPanel({
  order,
  current,
  members,
  onNext,
  onEdit,
  onEnd,
}: {
  order: string[];
  current: string | null;
  members: Member[];
  onNext: () => void;
  onEdit: () => void;
  onEnd: () => void;
}) {
  const t = useTheme();
  const [armed, setArmed] = useState(false);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  return (
    <View style={[styles.panel, { backgroundColor: t.accentSoft, borderColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.order}>
        <Text style={{ color: t.accentPurple, fontWeight: '800', fontSize: 12 }}>🔁 순서</Text>
        {order.map((id, i) => {
          const m = byId[id];
          const now = id === current;
          const skip = !m || !m.active || m.exhausted;
          return (
            <View key={id} style={styles.step}>
              {i > 0 ? <Text style={{ color: t.subtext, fontSize: 11 }}>›</Text> : null}
              <View style={[styles.who, { backgroundColor: now ? t.accent : t.card, opacity: skip ? 0.45 : 1 }]}>
                {m ? <Avatar bot={lookOf(m.kind, m.avatar)} size={16} /> : null}
                <Text style={{ color: now ? t.accentText : t.text, fontSize: 11, fontWeight: now ? '800' : '600' }}>
                  {i + 1}. {m?.name ?? '나간 봇'}
                  {now ? ' 차례' : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable onPress={onNext} style={[styles.btn, { backgroundColor: t.card }]}>
          <Text style={[styles.btnText, { color: t.text }]}>다음 차례로</Text>
        </Pressable>
        <Pressable onPress={onEdit} style={[styles.btn, { backgroundColor: t.card }]}>
          <Text style={[styles.btnText, { color: t.text }]}>순서 바꾸기</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            onEnd();
          }}
          style={[styles.btn, { backgroundColor: armed ? t.danger : t.card }]}
        >
          <Text style={[styles.btnText, { color: armed ? '#fff' : t.danger }]}>{armed ? '한 번 더 누르면 끝' : '끝내기'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 순서 정하기 창: 누르는 차례대로 순서에 들어가고, ▲▼로 바꾸고, ★로 처음 차례를 정해요. */
export function TurnSetup({
  visible,
  members,
  initial,
  current,
  onClose,
  onStart,
}: {
  visible: boolean;
  members: Member[];
  initial: string[];
  current: string | null;
  onClose: () => void;
  onStart: (order: string[], start: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<string[]>(initial);
  const [start, setStart] = useState<string | null>(current);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const pool = members.filter((m) => !order.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const move = (i: number, d: number) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, flex: 1 }}>🔁 순서 정해서 대화</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={t.subtext} />
            </Pressable>
          </View>
          <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
            봇을 누르는 차례대로 순서에 들어가요. 차례인 봇만 말할 수 있고, 말하면 다음 봇 차례가 돼요(끝나면 처음부터 다시). 3분 넘게 조용한 봇은 건너뛰어요.
          </Text>

          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 6 }}>
            {order.map((id, i) => {
              const m = byId[id];
              const first = (start ?? order[0]) === id;
              return (
                <View key={id} style={[styles.item, { borderColor: first ? t.accent : t.border }]}>
                  <Text style={{ color: t.subtext, width: 20, fontWeight: '800' }}>{i + 1}</Text>
                  {m ? <Avatar bot={lookOf(m.kind, m.avatar)} size={24} /> : null}
                  <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>{m?.name ?? '나간 봇'}</Text>
                  <Pressable onPress={() => setStart(id)} hitSlop={6} accessibilityLabel="여기부터 시작">
                    <Text style={{ color: first ? t.accent : t.subtext, fontSize: 12, fontWeight: '700' }}>{first ? '★ 지금 차례' : '☆ 여기부터'}</Text>
                  </Pressable>
                  <Pressable onPress={() => move(i, -1)} hitSlop={6} accessibilityLabel="위로">
                    <Ionicons name="chevron-up" size={20} color={t.text} />
                  </Pressable>
                  <Pressable onPress={() => move(i, 1)} hitSlop={6} accessibilityLabel="아래로">
                    <Ionicons name="chevron-down" size={20} color={t.text} />
                  </Pressable>
                  <Pressable onPress={() => setOrder((o) => o.filter((x) => x !== id))} hitSlop={6} accessibilityLabel="빼기">
                    <Ionicons name="close-circle" size={20} color={t.danger} />
                  </Pressable>
                </View>
              );
            })}
            {!order.length ? <Text style={{ color: t.subtext, fontSize: 13 }}>아래에서 봇을 순서대로 눌러 주세요.</Text> : null}
          </ScrollView>

          <View style={styles.pool}>
            {pool.map((m) => (
              <Pressable key={m.id} onPress={() => setOrder((o) => [...o, m.id])} style={[styles.poolChip, { backgroundColor: t.input, opacity: m.active && !m.exhausted ? 1 : 0.5 }]}>
                <Avatar bot={lookOf(m.kind, m.avatar)} size={18} />
                <Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>＋ {m.name}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            disabled={order.length < 2}
            onPress={() => onStart(order, start && order.includes(start) ? start : order[0])}
            style={[styles.start, { backgroundColor: order.length < 2 ? t.input : t.accent }]}
          >
            <Text style={{ color: order.length < 2 ? t.subtext : t.accentText, fontWeight: '800' }}>
              {initial.length ? '이 순서로 바꾸기' : '이 순서로 시작'} ({order.length}명)
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6, gap: 6 },
  order: { alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 3, paddingRight: 8, paddingVertical: 3, borderRadius: 999 },
  actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 10 },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  btnText: { fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.28)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  poolChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 3, paddingRight: 9, paddingVertical: 4, borderRadius: 999 },
  start: { alignItems: 'center', paddingVertical: 13, borderRadius: 14 },
});
