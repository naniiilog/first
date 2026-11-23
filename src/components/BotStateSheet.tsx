import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { aiOf, connectionText } from '../lib/ais';
import { lookOf } from '../lib/avatar';
import { callBackBot } from '../lib/callBack';
import { useTheme } from '../lib/theme';
import type { Member } from '../lib/types';
import { Avatar } from './ui';

export type BotState = 'on' | 'exhausted' | 'off';
const BOT_INTERVALS = [0, 1, 5, 10, 15, 20, 30, 40, 60, 120];
const intervalText = (n: number) => (n === 0 ? '실시간' : n >= 60 ? `${n / 60}시간` : `${n}분`);
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
  roomInterval,
  onInterval,
}: {
  member: Member | null;
  onClose: () => void;
  onPick: (m: Member, state: BotState) => void;
  onProfile: () => void;
  /** 방 전체 확인 간격(분) */
  roomInterval: number;
  /** 이 봇만의 확인 간격 바꾸기(null이면 방 설정 따르기) */
  onInterval: (m: Member, minutes: number | null) => void;
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

          {/* 확인 간격: 방 전체 설정을 따르거나 이 봇만 따로 */}
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 14, marginTop: 4 }}>⏱ 이 봇의 확인 간격</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[null, ...BOT_INTERVALS].map((v) => {
              const on = (member.checkIntervalMin ?? null) === v;
              const label = v === null ? `방 설정 (${intervalText(roomInterval)})` : intervalText(v);
              return (
                <Pressable
                  key={String(v)}
                  onPress={() => {
                    if (!on) onInterval(member, v);
                  }}
                  style={[styles.ichip, { backgroundColor: on ? t.accent : t.card, borderColor: on ? t.accent : t.border }]}
                >
                  <Text style={{ color: on ? t.accentText : t.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            {canCall && (
              <Pressable onPress={() => callBackBot(member, setNote)} style={[styles.small, { backgroundColor: t.accent }]}>
                <Ionicons name="refresh-outline" size={15} color={t.accentText} />
                <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 13 }}>다시 부르기 (커넥터)</Text>
              </Pressable>
            )}
            {/* 커넥터가 없거나, 자동 실행에서 커넥터를 못 쓰는 봇용: 인터넷 주소만으로 들어오는 연결 문구 */}
            {member.inviteUrl ? (
              <Pressable
                onPress={() => {
                  Clipboard.setStringAsync(connectionText(member.inviteUrl!, member.name))
                    .then(() =>
                      setNote('연결 문구를 복사했어요. 그 봇에게 붙여넣고 "방 읽을 때 쓰는 도구로 send 주소를 열어서 글을 올려줘"라고 덧붙여 주세요. 열쇠가 들어 있으니 그 봇한테만 보내세요.'),
                    )
                    .catch(() => setNote('복사가 안 됐어요. 멤버 화면 → 초대 링크 → 연결 문구 복사를 써 주세요.'));
                }}
                style={[styles.small, { borderColor: t.accent, borderWidth: 1 }]}
              >
                <Ionicons name="link-outline" size={15} color={t.accent} />
                <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>연결 문구 복사 (커넥터 없을 때)</Text>
              </Pressable>
            ) : null}
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
  ichip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  small: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
});
