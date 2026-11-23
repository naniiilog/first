import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui';
import { DEFAULT_SERVER_URL, guestApi } from '../../lib/api';
import { lookOf } from '../../lib/avatar';
import { useTheme } from '../../lib/theme';
import { stamp } from '../../lib/time';
import { OWNER_ID, SYSTEM_ID, type ChatMessage, type Member } from '../../lib/types';

const abs = (u: string) => (/^(https?:|data:)/.test(u) ? u : `${DEFAULT_SERVER_URL.replace(/\/+$/, '')}${u}`);

/** 초대받은 사람(손님) 화면: 앱 비밀번호 없이 이 방 하나만 보고, 허락받았으면 같이 써요. */
export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof guestApi.info>> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const lastId = useRef<number | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const atBottom = useRef(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await guestApi.messages(token, lastId.current);
      if (res.messages.length) {
        lastId.current = res.messages[res.messages.length - 1].id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const loadInfo = () => guestApi.info(token).then((r) => alive && setInfo(r)).catch((e) => alive && setError(String(e.message ?? e)));
    const first = setTimeout(() => {
      loadInfo();
      refresh();
    }, 0);
    const m = setInterval(refresh, 2500);
    const i = setInterval(loadInfo, 15_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(m);
      clearInterval(i);
    };
  }, [token, refresh]);

  const send = async () => {
    const body = text.trim();
    if (!body || !token || sending) return;
    setSending(true);
    try {
      await guestApi.send(token, body, null);
      setText('');
      atBottom.current = true;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const members: Member[] = info?.members ?? [];
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const meId = info?.me.id;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.chatBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: info ? `${info.room.name} (초대받음)` : '다봇 초대' }} />
      {info ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar}>
          <Text style={{ color: t.subtext, fontSize: 11 }}>{info.me.name} 님 · {info.me.canPost ? '같이 대화' : '보기만'}</Text>
          {members.map((m) => (
            <View key={m.id} style={[styles.chip, { backgroundColor: t.chip }]}>
              <Avatar bot={lookOf(m.kind, m.avatar)} size={16} dim={!m.active} />
              <Text style={{ color: t.text, fontSize: 11, fontWeight: '600' }}>{m.name}</Text>
              <View style={[styles.dot, { backgroundColor: !m.active ? '#EF4444' : m.exhausted ? '#F59E0B' : '#22C55E', opacity: m.online ? 1 : 0.5 }]} />
            </View>
          ))}
        </ScrollView>
      ) : null}
      {error ? <Text style={{ color: t.danger, padding: 12 }}>⚠️ {error}</Text> : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 10, gap: 6 }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          atBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => atBottom.current && listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.authorId === SYSTEM_ID) {
            return <Text style={[styles.system, { color: t.systemText, backgroundColor: t.systemPill }]}>{item.text}</Text>;
          }
          const mine = item.authorId === meId;
          const m = byId[item.authorId];
          const look = item.authorId === OWNER_ID || item.authorId.startsWith('guest:') ? { emoji: item.authorId === OWNER_ID ? '👑' : '🙂', color: '#8FC1FF' } : lookOf(m?.kind ?? 'other', m?.avatar);
          return (
            <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
              {!mine && <Avatar bot={look} size={32} />}
              <View style={{ maxWidth: '78%', gap: 2 }}>
                {!mine && <Text style={{ color: t.subtext, fontSize: 11 }}>{item.authorName}{item.authorId === OWNER_ID ? ' (방장)' : ''}</Text>}
                <View style={[styles.bubble, { backgroundColor: mine ? t.myBubble : t.botBubble }]}>
                  {item.image ? <Image source={{ uri: abs(item.image) }} style={styles.photo} resizeMode="cover" /> : null}
                  {item.text ? <Text style={{ color: mine ? t.myBubbleText : t.botBubbleText, fontSize: 15, lineHeight: 21 }}>{item.text}</Text> : null}
                </View>
                <Text style={{ color: t.chatTime, fontSize: 10, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{stamp(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />

      {info?.me.canPost ? (
        <View style={[styles.compose, { backgroundColor: t.card, paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="메시지 입력"
            placeholderTextColor={t.subtext}
            multiline
            style={[styles.input, { backgroundColor: t.input, color: t.text }]}
          />
          <Pressable onPress={send} disabled={sending || !text.trim()} style={[styles.send, { backgroundColor: text.trim() ? t.accent : t.input }]}>
            <Text style={{ color: text.trim() ? t.accentText : t.subtext, fontWeight: '700' }}>전송</Text>
          </Pressable>
        </View>
      ) : info ? (
        <Text style={{ color: t.subtext, textAlign: 'center', padding: 12, paddingBottom: insets.bottom + 12 }}>보기만 할 수 있는 초대예요.</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 6, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 3, paddingRight: 7, paddingVertical: 2, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  system: { alignSelf: 'center', fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, gap: 6 },
  photo: { width: 200, height: 200, borderRadius: 10 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
