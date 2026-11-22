import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiOf } from '../lib/ais';
import { lookOf } from '../lib/avatar';
import { callBackBot } from '../lib/callBack';
import { useTheme } from '../lib/theme';
import type { Member } from '../lib/types';
import { Avatar } from './ui';

export type BotState = 'on' | 'exhausted' | 'off';
export const stateOf = (m: Member): BotState => (!m.active ? 'off' : m.exhausted ? 'exhausted' : 'on');

const OPTIONS: { key: BotState; color: string; label: string; hint: string }[] = [
  { key: 'on', color: '#22C55E', label: '참가', hint: '대화에 참가해요' },
  { key: 'exhausted', color: '#F59E0B', label: '사용량 소진', hint: '한도가 다 찼어요. 다른 봇이 기다리지 않아요' },
  { key: 'off', color: '#EF4444', label: '쉬게 하기', hint: '이 봇만 대화를 멈춰요' },
];

/** 채팅방 위쪽에서 봇을 누르면 아래에서 올라오는 상태 고르기 */
export function BotStateSheet({
  member,
  onClose,
  onPick,
  onProfile,
}: {
  member: Member | null;
  onClose: () => void;
  onPick: (m: Member, state: BotState) => void;
  onProfile: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);
  const close = () => {
    setNote(null);
    onClose();
  };
  if (!member) return null;
  const now = stateOf(member);
  const canCall = member.active && !member.exhausted && member.joined && !member.online;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.head}>
            <Avatar bot={lookOf(member.kind, member.avatar)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>{member.name}</Text>
              <Text style={{ color: t.subtext, fontSize: 12 }}>
                {aiOf(member.kind).name} · {member.online && member.active && !member.exhausted ? '지금 대화 중' : member.joined ? '들어온 적 있음' : '아직 안 들어옴'}
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="닫기">
              <Ionicons name="close" size={24} color={t.subtext} />
            </Pressable>
          </View>

          {OPTIONS.map((o) => {
            const on = o.key === now;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (!on) onPick(member, o.key);
                  close();
                }}
                style={({ pressed }) => [
                  styles.option,
                  { borderColor: on ? o.color : t.border, backgroundColor: on ? o.color + '1A' : pressed ? t.input : 'transparent' },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: o.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{o.label}</Text>
                  <Text style={{ color: t.subtext, fontSize: 12 }}>{o.hint}</Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={o.color} /> : null}
              </Pressable>
            );
          })}

          <View style={styles.row}>
            {canCall && (
              <Pressable onPress={() => callBackBot(member, setNote)} style={[styles.small, { backgroundColor: t.accent }]}>
                <Ionicons name="refresh-outline" size={15} color={t.accentText} />
                <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 13 }}>다시 부르기</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                close();
                onProfile();
              }}
              style={[styles.small, { borderColor: t.border, borderWidth: 1 }]}
            >
              <Ionicons name="person-circle-outline" size={15} color={t.text} />
              <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>프로필 · 초대 링크</Text>
            </Pressable>
          </View>
          {note ? <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>{note}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.28)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  small: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
});
