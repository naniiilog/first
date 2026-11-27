import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { absUrl, api, type AlbumImage } from '../../../lib/api';
import { saveImage } from '../../../lib/saveImage';
import { useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { summarize } from '../../../lib/summary';
import { stamp } from '../../../lib/time';
import type { ChatMessage } from '../../../lib/types';

/** 사진 앨범: 이 방에서 주고받은 사진을 모아 보고, 크게 보고, 저장해요. */
export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, settings } = useStore();
  const room = rooms.find((r) => r.id === id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<AlbumImage[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AlbumImage | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** 열어 본 사진 앞뒤 대화 */
  const [context, setContext] = useState<{ before: ChatMessage[]; after: ChatMessage[] } | null>(null);
  const cols = 3;
  const size = Math.floor((Math.min(width, 720) - 4 * (cols + 1)) / cols);

  const load = useCallback(
    async (before: number | null) => {
      if (!room) return;
      setBusy(true);
      try {
        const res = await api.images(settings, room, before);
        setItems((prev) => (before ? [...prev, ...res.images] : res.images));
        if (res.images.length < 60) setDone(true);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [room, settings],
  );

  useEffect(() => {
    const first = setTimeout(() => load(null), 0);
    return () => clearTimeout(first);
  }, [load]);

  /** 날짜별로 묶고, 한 줄에 3장씩 */
  const sections = useMemo(() => {
    const byDay = new Map<string, AlbumImage[]>();
    for (const x of items) {
      const d = new Date(x.createdAt);
      const k = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
      byDay.set(k, [...(byDay.get(k) ?? []), x]);
    }
    return [...byDay.entries()].map(([title, list]) => ({
      title,
      count: list.length,
      data: Array.from({ length: Math.ceil(list.length / cols) }, (_, i) => list.slice(i * cols, i * cols + cols)),
    }));
  }, [items]);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;

  /** 사진을 열면 그 앞뒤 대화를 불러와 요약해요 */
  const openPhoto = (img: AlbumImage) => {
    setNote(null);
    setContext(null);
    setOpen(img);
    api
      .around(settings, room, img.id)
      .then((r) => setContext(r))
      .catch(() => setContext({ before: [], after: [] }));
  };

  const save = async (img: AlbumImage) => {
    setNote('저장하는 중…');
    try {
      setNote(await saveImage(absUrl(settings, img.url), `dabot-${room.name}-${img.id}`));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((x) => x.id).join('-')}
        stickySectionHeadersEnabled
        contentContainerStyle={{ padding: 4, paddingBottom: insets.bottom + 24 }}
        onEndReached={() => !busy && !done && items.length && load(items[items.length - 1].id)}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <Text style={{ color: t.subtext, fontSize: 12, padding: 8 }}>
            {items.length ? `사진 ${items.length}${done ? '' : '+'}장 · 날짜별 · 누르면 크게 보고, 그때 대화도 볼 수 있어요` : ''}
          </Text>
        }
        ListEmptyComponent={
          busy ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
          ) : (
            <Text style={{ color: t.subtext, padding: 20 }}>{error ? `⚠️ ${error}` : '아직 주고받은 사진이 없어요.'}</Text>
          )
        }
        ListFooterComponent={busy && items.length ? <ActivityIndicator style={{ margin: 16 }} color={t.accent} /> : undefined}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: t.bg, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 6 }}>
            <Text style={{ color: t.text, fontWeight: '800' }}>
              {section.title} <Text style={{ color: t.subtext, fontWeight: '500', fontSize: 12 }}>· {section.count}장</Text>
            </Text>
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
            {row.map((item) => (
              <Pressable key={item.id} onPress={() => openPhoto(item)} accessibilityLabel={`${item.authorName}의 사진`}>
                <Image source={{ uri: absUrl(settings, item.url) }} style={{ width: size, height: size, borderRadius: 6, backgroundColor: t.input }} />
              </Pressable>
            ))}
          </View>
        )}
      />

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={[styles.viewer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }]}>
          {open && (
            <>
              <View style={styles.viewerHead}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{open.authorName}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{stamp(open.createdAt)}</Text>
                </View>
                <Pressable onPress={() => setOpen(null)} hitSlop={10}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>닫기</Text>
                </Pressable>
              </View>
              <Image source={{ uri: absUrl(settings, open.url) }} style={{ flex: 1, width: '100%', minHeight: 200 }} resizeMode="contain" />
              {open.text ? (
                <Text style={{ color: '#fff', fontSize: 14, paddingHorizontal: 16, paddingTop: 8 }} numberOfLines={3}>
                  {open.text}
                </Text>
              ) : null}
              {/* 그때 대화 요약(앞뒤 글에서 뽑아요) */}
              <View style={styles.context}>
                {!context ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  (() => {
                    const all = [...context.before, ...context.after];
                    if (!all.length) return <Text style={styles.ctxText}>앞뒤 대화가 없어요.</Text>;
                    const { people, topics } = summarize(all);
                    const near = [...context.before.slice(-2), ...context.after.slice(0, 2)];
                    return (
                      <>
                        <Text style={styles.ctxTitle}>💬 그때 대화</Text>
                        <Text style={styles.ctxText}>함께: {people.map(([n, c]) => `${n}(${c})`).join(', ')}</Text>
                        {topics.length ? <Text style={styles.ctxText}>자주 나온 말: {topics.join(' · ')}</Text> : null}
                        {near.map((m) => (
                          <Text key={m.id} style={styles.ctxLine} numberOfLines={1}>
                            <Text style={{ fontWeight: '700' }}>{m.authorName}</Text> {m.image && !m.text ? '📷' : m.text}
                          </Text>
                        ))}
                      </>
                    );
                  })()
                )}
              </View>
              <View style={styles.viewerActions}>
                <Pressable onPress={() => save(open)} style={[styles.btn, { backgroundColor: t.accent }]}>
                  <Text style={{ color: t.accentText, fontWeight: '700' }}>⬇ 저장</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const target = open.id;
                    setOpen(null);
                    router.navigate({ pathname: '/room/[id]', params: { id: room.id, jump: String(target) } });
                  }}
                  style={[styles.btn, { borderColor: '#fff', borderWidth: 1 }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>대화에서 보기</Text>
                </Pressable>
              </View>
              {note ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center', paddingHorizontal: 16 }}>{note}</Text> : null}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', gap: 10 },
  viewerHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  viewerActions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  context: { marginHorizontal: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', gap: 3 },
  ctxTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ctxText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  ctxLine: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
});
