import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme';
import { stamp } from '../lib/time';
import type { ChatMessage, LocalRoom, Settings } from '../lib/types';

/** 메시지 검색 창. 결과를 누르면 그 글로 가요. */
export function SearchSheet({
  visible,
  settings,
  room,
  onClose,
  onPick,
}: {
  visible: boolean;
  settings: Settings;
  room: LocalRoom;
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 찾은 글 전체 개수, 더 불러올 게 있는지 */
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 입력을 멈추고 0.3초 뒤에 서버에서 찾아요(대화 전체에서).
  useEffect(() => {
    const word = q.trim();
    let alive = true;
    const timer = setTimeout(() => {
      if (!word) {
        setResults(null);
        return;
      }
      setBusy(true);
      api
        .searchMessages(settings, room, word)
        .then((r) => {
          if (!alive) return;
          setResults(r.messages);
          setTotal(r.total ?? r.messages.length);
          setMore(r.messages.length >= 200);
          setError(null);
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => alive && setBusy(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, settings, room]);

  /** 아래로 내리면 다음 묶음(200개씩)을 이어서 불러와요. 끝까지 다 볼 수 있어요. */
  const loadMore = () => {
    const word = q.trim();
    if (!more || loadingMore || !results?.length || !word) return;
    setLoadingMore(true);
    api
      .searchMessages(settings, room, word, results[results.length - 1].id)
      .then((r) => {
        setResults((prev) => [...(prev ?? []), ...r.messages]);
        setMore(r.messages.length >= 200);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingMore(false));
  };

  const close = () => {
    setQ('');
    setResults(null);
    onClose();
  };

  /** 찾은 낱말을 굵게 */
  const highlight = (text: string) => {
    const word = q.trim();
    const i = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
    if (i < 0) return <Text>{text}</Text>;
    const start = Math.max(0, i - 30);
    return (
      <Text>
        {start > 0 ? '…' : ''}
        {text.slice(start, i)}
        <Text style={{ color: t.accent, fontWeight: '800' }}>{text.slice(i, i + word.length)}</Text>
        {text.slice(i + word.length)}
      </Text>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <View style={[styles.bar, { borderColor: t.border }]}>
          <View style={[styles.inputBox, { backgroundColor: t.input }]}>
            <Ionicons name="search" size={18} color={t.subtext} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="메시지·이름 검색"
              placeholderTextColor={t.subtext}
              autoFocus
              autoCorrect={false}
              style={[styles.input, { color: t.text }]}
              returnKeyType="search"
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="지우기">
                <Ionicons name="close-circle" size={18} color={t.subtext} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={{ color: t.accent, fontWeight: '700', fontSize: 15 }}>닫기</Text>
          </Pressable>
        </View>

        {busy && !results ? <ActivityIndicator style={{ marginTop: 24 }} color={t.accent} /> : null}
        {error ? <Text style={{ color: t.danger, padding: 16 }}>⚠️ {error}</Text> : null}
        {results && results.length === 0 ? <Text style={{ color: t.subtext, padding: 16 }}>찾는 글이 없어요.</Text> : null}
        <FlatList
          data={results ?? []}
          keyExtractor={(m) => String(m.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            results && results.length ? (
              <Text style={[styles.count, { color: t.subtext }]}>
                모두 {total}개 (최근 것부터){more ? ` · ${results.length}개 보는 중, 내리면 더 나와요` : ''}
              </Text>
            ) : undefined
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={t.accent} /> : undefined}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                close();
                onPick(item.id);
              }}
              style={({ pressed }) => [styles.item, { borderColor: t.border, backgroundColor: pressed ? t.input : 'transparent' }]}
            >
              <View style={styles.itemHead}>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{item.authorName}</Text>
                <Text style={{ color: t.subtext, fontSize: 11 }}>{stamp(item.createdAt)}</Text>
              </View>
              <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
                {highlight(item.text || '[사진]')}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  inputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  count: { fontSize: 12, paddingHorizontal: 16, paddingTop: 10 },
  item: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
