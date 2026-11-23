import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Bookmark } from '../lib/marks';
import { useTheme } from '../lib/theme';
import { stamp } from '../lib/time';
import type { ChatMessage } from '../lib/types';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** 말풍선을 길게 누르면: 답장 · 북마크 · 복사 */
export function MessageActions({
  msg,
  marked,
  onClose,
  onReply,
  onBookmark,
  onCopy,
}: {
  msg: ChatMessage | null;
  marked: boolean;
  onClose: () => void;
  onReply: () => void;
  onBookmark: () => void;
  onCopy: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!msg) return null;
  const items: { icon: Icon; label: string; run: () => void }[] = [
    { icon: 'arrow-undo-outline', label: '답장', run: onReply },
    { icon: marked ? 'bookmark' : 'bookmark-outline', label: marked ? '북마크 해제' : '북마크 (나중에 다시 보기)', run: onBookmark },
    ...(msg.text ? [{ icon: 'copy-outline' as Icon, label: '글 복사', run: onCopy }] : []),
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 10 }]} onPress={() => {}}>
          <Text style={{ color: t.subtext, fontSize: 12 }} numberOfLines={2}>
            <Text style={{ fontWeight: '700', color: t.text }}>{msg.authorName}</Text> {msg.text || '[사진]'}
          </Text>
          {items.map((it) => (
            <Pressable
              key={it.label}
              onPress={() => {
                onClose();
                it.run();
              }}
              style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.input : 'transparent' }]}
            >
              <Ionicons name={it.icon} size={20} color={t.text} />
              <Text style={{ color: t.text, fontSize: 15 }}>{it.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 북마크 목록: 누르면 그 글로 가요 */
export function BookmarkSheet({
  visible,
  list,
  onClose,
  onPick,
  onRemove,
}: {
  visible: boolean;
  list: Bookmark[];
  onClose: () => void;
  onPick: (id: number) => void;
  onRemove: (b: Bookmark) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 10, maxHeight: '80%' }]} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, flex: 1 }}>🔖 북마크 {list.length}개</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={t.subtext} />
            </Pressable>
          </View>
          <FlatList
            data={list}
            keyExtractor={(b) => String(b.id)}
            ListEmptyComponent={<Text style={{ color: t.subtext, padding: 8 }}>아직 북마크가 없어요. 말풍선을 길게 눌러 북마크해 보세요.</Text>}
            renderItem={({ item }) => (
              <View style={[styles.mark, { borderColor: t.border }]}>
                <Pressable
                  style={{ flex: 1, gap: 2 }}
                  onPress={() => {
                    onClose();
                    onPick(item.id);
                  }}
                >
                  <Text style={{ color: t.subtext, fontSize: 11 }}>
                    {item.authorName} · {stamp(item.createdAt)}
                  </Text>
                  <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={2}>
                    {item.image ? '📷 ' : ''}
                    {item.text || '사진'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onRemove(item)} hitSlop={8} accessibilityLabel="북마크 해제">
                  <Ionicons name="bookmark" size={20} color={t.accent} />
                </Pressable>
              </View>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.28)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 10 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
