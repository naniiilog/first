import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { lookOf } from '../lib/avatar';
import { useTheme } from '../lib/theme';
import type { LocalRoom, Member, Settings } from '../lib/types';
import { Avatar } from './ui';

/**
 * 다른 방 봇 데려오기: 다른 방의 봇을 골라 이 방으로 옮겨요.
 * 초대 링크(연결)는 그대로라 AI 앱에서는 아무것도 안 해도 돼요. 원래 방에서는 빠지고, 지난 대화는 남아요.
 */
export function BringBotSheet({
  visible,
  settings,
  room,
  rooms,
  onClose,
  onMoved,
}: {
  visible: boolean;
  settings: Settings;
  room: LocalRoom;
  rooms: LocalRoom[];
  onClose: () => void;
  onMoved: (msg: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const others = rooms.filter((r) => r.id !== room.id);
  const [bots, setBots] = useState<Record<string, Member[] | 'error'>>({});
  const [picked, setPicked] = useState<{ from: LocalRoom; m: Member } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 창을 열면 다른 방들의 봇 목록을 받아요
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    for (const r of others) {
      api
        .getRoom(settings, r)
        .then((info) => alive && setBots((b) => ({ ...b, [r.id]: info.members })))
        .catch(() => alive && setBots((b) => ({ ...b, [r.id]: 'error' })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    setPicked(null);
    setNote(null);
    onClose();
  };
  const move = () => {
    if (!picked || busy) return;
    setBusy(true);
    api
      .moveMember(settings, picked.from, picked.m.id, room)
      .then(() => {
        const msg = `${picked.m.name}을(를) "${picked.from.name}"에서 데려왔어요. 연결은 그대로라 다음 확인 때부터 이 방에서 이야기해요.`;
        setBots((b) => ({ ...b, [picked.from.id]: (b[picked.from.id] as Member[]).filter((x) => x.id !== picked.m.id) }));
        setPicked(null);
        onMoved(msg);
        close();
      })
      .catch((e) => setNote(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, flex: 1 }}>🚚 다른 방 봇 데려오기</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="닫기">
              <Ionicons name="close" size={24} color={t.subtext} />
            </Pressable>
          </View>
          <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
            연결(초대 링크)은 그대로라 AI 앱에서는 아무것도 안 해도 돼요. 원래 방에서는 빠지고, 그 방의 지난 대화는 남아요. 새 방에서는 지금부터 올라오는 글을 읽어요.
          </Text>

          {picked ? (
            <View style={{ gap: 12 }}>
              <View style={[styles.confirm, { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                <Avatar bot={lookOf(picked.m.kind, picked.m.avatar)} size={36} />
                <Text style={{ color: t.text, fontSize: 14, flex: 1, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '800' }}>{picked.m.name}</Text>을(를) {`"${picked.from.name}"`}에서 이 방으로 옮길까요?
                </Text>
              </View>
              <View style={styles.row}>
                <Pressable onPress={() => setPicked(null)} style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}>
                  <Text style={{ color: t.text, fontWeight: '700' }}>다시 고르기</Text>
                </Pressable>
                <Pressable onPress={move} style={[styles.btn, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}>
                  <Text style={{ color: t.accentText, fontWeight: '800' }}>{busy ? '옮기는 중…' : '이 방으로 옮기기'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
              {!others.length ? <Text style={{ color: t.subtext }}>다른 채팅방이 없어요.</Text> : null}
              {others.map((r) => {
                const list = bots[r.id];
                return (
                  <View key={r.id} style={{ gap: 6 }}>
                    <Text style={{ color: t.text, fontWeight: '800' }}>💬 {r.name}</Text>
                    {list === undefined ? <ActivityIndicator color={t.accent} style={{ alignSelf: 'flex-start' }} /> : null}
                    {list === 'error' ? <Text style={{ color: t.subtext, fontSize: 12 }}>이 방 정보를 못 불러왔어요.</Text> : null}
                    {Array.isArray(list) && !list.length ? <Text style={{ color: t.subtext, fontSize: 12 }}>봇이 없어요.</Text> : null}
                    {Array.isArray(list) ? (
                      <View style={styles.wrap}>
                        {list.map((m) => (
                          <Pressable key={m.id} onPress={() => setPicked({ from: r, m })} style={[styles.chip, { borderColor: t.border, backgroundColor: t.input }]}>
                            <Avatar bot={lookOf(m.kind, m.avatar)} size={22} />
                            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{m.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
          {note ? <Text style={{ color: t.danger, fontSize: 13 }}>⚠️ {note}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.28)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
