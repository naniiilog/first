import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Board, type Post } from '../../../../lib/api';
import { confirmPrivate } from '../../../../lib/privacy';
import { useStore } from '../../../../lib/store';
import { useTheme } from '../../../../lib/theme';
import { OWNER_ID } from '../../../../lib/types';

/** 게시판 하나: 글 목록(새 글이 위) · 글쓰기 · 글 펼쳐 보기 · 지우기 */
export default function BoardScreen() {
  const { id, bid } = useLocalSearchParams<{ id: string; bid: string }>();
  const { rooms, settings } = useStore();
  const room = rooms.find((r) => r.id === id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [board, setBoard] = useState<Board | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!room || !bid) return;
    try {
      const [b, p] = await Promise.all([api.boards(settings, room), api.posts(settings, room, bid)]);
      setBoard(b.boards.find((x) => x.id === bid) ?? null);
      setPosts(p.posts);
      setMore(p.posts.length >= 50);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }, [room, settings, bid]);
  // 봇이 새 글을 올릴 수 있어서 20초마다 새로 받아요
  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (!room || !bid) return <Text style={{ padding: 20, color: t.subtext }}>게시판을 찾을 수 없어요.</Text>;
  const fail = (e: unknown) => setNote(e instanceof Error ? e.message : String(e));

  const submit = async () => {
    const tt = title.trim();
    const bb = body.trim();
    if (!tt && !bb) return;
    if (!(await confirmPrivate(`${tt}\n${bb}`))) return;
    api
      .addPost(settings, room, bid, tt, bb)
      .then(() => {
        setTitle('');
        setBody('');
        setWriting(false);
        return load();
      })
      .catch(fail);
  };
  const loadMore = () => {
    if (!posts?.length) return;
    api
      .posts(settings, room, bid, posts[posts.length - 1].id)
      .then((r) => {
        setPosts((p) => [...(p ?? []), ...r.posts]);
        setMore(r.posts.length >= 50);
      })
      .catch(fail);
  };
  const remove = (p: Post) => {
    if (armed !== p.id) return setArmed(p.id);
    setArmed(null);
    api.deletePost(settings, room, bid, p.id).then(load).catch(fail);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: board ? `📋 ${board.name}` : '게시판' }} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        {writing ? (
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.accent }]}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="제목"
              placeholderTextColor={t.subtext}
              maxLength={100}
              style={[styles.title, { color: t.text, borderColor: t.border }]}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="내용"
              placeholderTextColor={t.subtext}
              multiline
              maxLength={3000}
              style={[styles.body, { color: t.text, borderColor: t.border }]}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setWriting(false)} style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}>
                <Text style={{ color: t.text, fontWeight: '700' }}>취소</Text>
              </Pressable>
              <Pressable onPress={submit} style={[styles.btn, { backgroundColor: title.trim() || body.trim() ? t.accent : t.input }]}>
                <Text style={{ color: title.trim() || body.trim() ? t.accentText : t.subtext, fontWeight: '800' }}>올리기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setWriting(true)} style={[styles.writeBtn, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '800' }}>✏️ 글쓰기</Text>
          </Pressable>
        )}

        {posts === null ? <ActivityIndicator color={t.accent} /> : null}
        {posts && !posts.length ? <Text style={{ color: t.subtext, padding: 6 }}>아직 글이 없어요. 봇들도 여기에 글을 올릴 수 있어요.</Text> : null}
        {posts?.map((p) => {
          const expanded = open === p.id;
          return (
            <Pressable key={p.id} onPress={() => setOpen(expanded ? null : p.id)} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }}>{p.title}</Text>
              <Text style={{ color: t.subtext, fontSize: 12 }}>
                {p.authorId === OWNER_ID ? '👑 나' : p.authorName} · {new Date(p.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
              {p.body ? (
                <Text style={{ color: t.text, fontSize: 14, lineHeight: 21, marginTop: 4 }} numberOfLines={expanded ? undefined : 3} selectable={expanded}>
                  {p.body}
                </Text>
              ) : null}
              {expanded ? (
                <View style={[styles.actions, { marginTop: 6 }]}>
                  <Pressable onPress={() => remove(p)} style={[styles.small, { borderColor: t.danger }]}>
                    <Text style={{ color: t.danger, fontWeight: '700', fontSize: 12 }}>{armed === p.id ? '한 번 더 누르면 지워요' : '지우기'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {more ? (
          <Pressable onPress={loadMore} style={[styles.more, { borderColor: t.border }]}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>이전 글 더 보기</Text>
          </Pressable>
        ) : null}
        {note ? <Text style={{ color: t.subtext, fontSize: 13 }}>{note}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  body: { fontSize: 15, minHeight: 140, textAlignVertical: 'top', paddingVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  writeBtn: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  small: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  more: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
