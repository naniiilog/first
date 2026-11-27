import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type Board } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

/** 게시판 관리: 게시판 만들기 · 이름 바꾸기 · 지우기. 누르면 그 게시판으로 가요. */
export default function BoardsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, settings } = useStore();
  const room = rooms.find((r) => r.id === id);
  const t = useTheme();
  const [list, setList] = useState<Board[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!room) return;
    try {
      setList((await api.boards(settings, room)).boards);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }, [room, settings]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;
  const fail = (e: unknown) => setNote(e instanceof Error ? e.message : String(e));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    api.addBoard(settings, room, n).then(load).then(() => setNote(`"${n}" 게시판을 만들었어요. ☰ 메뉴에도 바로 보여요.`)).catch(fail);
  };
  const rename = (b: Board) => {
    const n = editName.trim();
    setEditing(null);
    if (!n || n === b.name) return;
    api.renameBoard(settings, room, b.id, n).then(load).catch(fail);
  };
  const remove = (b: Board) => {
    if (armed !== b.id) return setArmed(b.id);
    setArmed(null);
    api.deleteBoard(settings, room, b.id).then(load).then(() => setNote(`"${b.name}" 게시판과 글을 지웠어요.`)).catch(fail);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: t.subtext, fontSize: 13, lineHeight: 19 }}>
        게시판은 채팅방 ☰ 메뉴 아래에 하나씩 보여요. 봇들도 게시판 글을 읽고, 정리한 내용을 올릴 수 있어요. 새 글이 올라오면 채팅방에 알림이 떠요.
      </Text>

      <View style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="새 게시판 이름 (예: 회의록, 자료실)"
          placeholderTextColor={t.subtext}
          maxLength={30}
          onSubmitEditing={add}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />
        <Pressable onPress={add} style={[styles.btn, { backgroundColor: name.trim() ? t.accent : t.input }]}>
          <Text style={{ color: name.trim() ? t.accentText : t.subtext, fontWeight: '800' }}>추가</Text>
        </Pressable>
      </View>

      {list === null ? <ActivityIndicator color={t.accent} /> : null}
      {list && !list.length ? <Text style={{ color: t.subtext }}>아직 게시판이 없어요. 위에서 이름을 쓰고 추가해 보세요.</Text> : null}
      {list?.map((b) => (
        <View key={b.id} style={[styles.board, { backgroundColor: t.card, borderColor: t.border }]}>
          {editing === b.id ? (
            <TextInput
              value={editName}
              onChangeText={setEditName}
              autoFocus
              maxLength={30}
              onSubmitEditing={() => rename(b)}
              onBlur={() => rename(b)}
              style={[styles.input, { color: t.text, borderColor: t.accent }]}
            />
          ) : (
            <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/room/[id]/board/[bid]', params: { id: room.id, bid: b.id } })}>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }}>📋 {b.name}</Text>
              <Text style={{ color: t.subtext, fontSize: 12 }}>글 {b.count}개{b.lastAt ? ` · 최근 ${new Date(b.lastAt).toLocaleDateString('ko-KR')}` : ''}</Text>
            </Pressable>
          )}
          {editing === b.id ? (
            <Pressable onPress={() => rename(b)} style={[styles.small, { borderColor: t.accent }]}>
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 12 }}>저장</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                setEditing(b.id);
                setEditName(b.name);
              }}
              style={[styles.small, { borderColor: t.border }]}
            >
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 12 }}>이름 바꾸기</Text>
            </Pressable>
          )}
          <Pressable onPress={() => remove(b)} style={[styles.small, { borderColor: t.danger }]}>
            <Text style={{ color: t.danger, fontWeight: '700', fontSize: 12 }}>{armed === b.id ? '한 번 더' : '지우기'}</Text>
          </Pressable>
        </View>
      ))}
      {note ? <Text style={{ color: t.subtext, fontSize: 13 }}>{note}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  board: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  small: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
