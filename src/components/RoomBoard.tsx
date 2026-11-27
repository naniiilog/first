import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lookOf } from '../lib/avatar';
import { useTheme } from '../lib/theme';
import { stamp } from '../lib/time';
import type { Member } from '../lib/types';
import { Avatar } from './ui';

const NOTICE_MAX = 500;

/** 채팅방 위에 고정된 공지. 접으면 한 줄, 누르면 펼쳐서 전체를 보고 고칠 수 있어요. */
export function NoticeBar({ text, at, onEdit }: { text: string; at: number; onEdit: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityLabel={open ? '공지 접기' : '공지 펼치기'}
      style={[styles.bar, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <View style={styles.barHead}>
        <Text style={{ fontSize: 14 }}>📌</Text>
        <Text style={{ color: t.text, fontSize: 13, flex: 1, lineHeight: 19 }} numberOfLines={open ? undefined : 1}>
          {text}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.subtext} />
      </View>
      {open ? (
        <View style={styles.barFoot}>
          <Text style={{ color: t.subtext, fontSize: 11, flex: 1 }}>{at ? `${stamp(at)} · 봇들도 늘 이 공지를 보고 지켜요` : '봇들도 늘 이 공지를 보고 지켜요'}</Text>
          <Pressable onPress={onEdit} hitSlop={8} style={[styles.smallBtn, { borderColor: t.accent }]}>
            <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>수정 · 내리기</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

/** 공지 쓰기·고치기·내리기 */
export function NoticeEditor({ visible, initial, onClose, onSave }: { visible: boolean; initial: string; onClose: () => void; onSave: (text: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial);
  const [shownFor, setShownFor] = useState(false);
  // 창을 열 때마다 지금 공지로 채워요.
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setText(initial);
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 14 }]}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>📌 방 공지</Text>
          <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
            채팅방 위에 고정되고, 봇들이 대화할 때마다 이 공지를 보고 지켜요. 지켜야 할 규칙이나 부탁할 일을 적어 주세요.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={'예) 반말로 짧게 말하기\n예) 오늘은 여행 계획 이야기만 하기'}
            placeholderTextColor={t.subtext}
            multiline
            maxLength={NOTICE_MAX}
            style={[styles.input, { color: t.text, backgroundColor: t.input }]}
          />
          <Text style={{ color: t.subtext, fontSize: 11, alignSelf: 'flex-end' }}>
            {text.length}/{NOTICE_MAX}
          </Text>
          <View style={styles.row}>
            {initial ? (
              <Pressable onPress={() => onSave('')} style={[styles.btn, { borderColor: '#E5484D', borderWidth: 1 }]}>
                <Text style={{ color: '#E5484D', fontWeight: '700' }}>공지 내리기</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}>
              <Text style={{ color: t.text, fontWeight: '700' }}>취소</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(text.trim())}
              disabled={!text.trim() || text.trim() === initial}
              style={[styles.btn, { backgroundColor: text.trim() && text.trim() !== initial ? t.accent : t.input }]}
            >
              <Text style={{ color: text.trim() && text.trim() !== initial ? t.accentText : t.subtext, fontWeight: '800' }}>{initial ? '고치기' : '올리기'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 봇 대장 고르기: 내가 부탁하면 다른 봇들 의견을 모아 정리해서 전하는 봇 */
export function LeaderPicker({
  visible,
  members,
  leaderId,
  onClose,
  onPick,
}: {
  visible: boolean;
  members: Member[];
  leaderId: string | null;
  onClose: () => void;
  onPick: (id: string | null) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const list = [...members].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ko'));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>🎖️ 봇 대장 정하기</Text>
          <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
            내가 무언가를 부탁하면 대장이 다른 봇들에게 의견을 물어 모은 뒤, 정리해서 한 번에 전해줘요. 자동대화가 꺼져 있어도 대장은 내 글에 답해요. 언제든 바꿀 수 있어요.
          </Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
            {list.map((m) => {
              const on = m.id === leaderId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => !on && onPick(m.id)}
                  style={({ pressed }) => [styles.option, { borderColor: on ? '#D97706' : t.border, backgroundColor: on ? '#F59E0B1A' : pressed ? t.input : 'transparent' }]}
                >
                  <Avatar bot={lookOf(m.kind, m.avatar)} size={30} dim={!m.active} />
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                    {m.name}
                    {!m.active ? <Text style={{ color: t.subtext, fontWeight: '500', fontSize: 12 }}> · 쉬는 중</Text> : null}
                  </Text>
                  {on ? <Text style={{ color: '#D97706', fontWeight: '800' }}>🎖️ 대장</Text> : null}
                </Pressable>
              );
            })}
            {!list.length ? <Text style={{ color: t.subtext }}>먼저 봇을 초대해 주세요.</Text> : null}
          </ScrollView>
          <View style={styles.row}>
            {leaderId ? (
              <Pressable onPress={() => onPick(null)} style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}>
                <Text style={{ color: t.text, fontWeight: '700' }}>대장 없애기</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}>
              <Text style={{ color: t.text, fontWeight: '700' }}>닫기</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { marginHorizontal: 10, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  barHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  barFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.28)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10 },
  input: { minHeight: 110, maxHeight: 220, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1 },
});
