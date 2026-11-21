import { Link, Stack, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button } from '../components/ui';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RoomsScreen() {
  const { rooms, botsById, keys } = useStore();
  const t = useTheme();
  const hasAnyKey = Object.values(keys).some(Boolean);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Link href="/bots" style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>
                봇
              </Link>
              <Link href="/settings" style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>
                설정
              </Link>
            </View>
          ),
        }}
      />
      {!hasAnyKey && (
        <Pressable onPress={() => router.push('/settings')} style={[styles.banner, { backgroundColor: t.accent + '1A', borderColor: t.accent }]}>
          <Text style={{ color: t.text, fontWeight: '600' }}>🔑 먼저 설정에서 AI API 키를 입력해 주세요</Text>
        </Pressable>
      )}
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>💬</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>아직 채팅방이 없어요</Text>
            <Text style={{ color: t.subtext, textAlign: 'center' }}>여러 AI 봇을 한 방에 모아서{'\n'}같이 이야기하거나 토론을 시켜보세요.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const members = item.botIds.map((id) => botsById[id]).filter(Boolean);
          const last = item.messages[item.messages.length - 1];
          const lastAuthor = last ? (last.authorId === 'user' ? '나' : botsById[last.authorId]?.name ?? '') : '';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/room/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.avatars}>
                {members.slice(0, 3).map((b, i) => (
                  <View key={b.id} style={{ marginLeft: i === 0 ? 0 : -14 }}>
                    <Avatar bot={b} size={36} />
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roomName, { color: t.text }]} numberOfLines={1}>
                  {item.name} <Text style={{ color: t.subtext, fontWeight: '400' }}>{members.length}</Text>
                </Text>
                <Text style={{ color: t.subtext }} numberOfLines={1}>
                  {last ? `${lastAuthor}: ${last.text}` : members.map((b) => b.name).join(', ')}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={{ padding: 16, paddingBottom: 32 }}>
        <Button title="+ 새 채팅방 만들기" onPress={() => router.push('/room/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 16, marginBottom: 0, padding: 14, borderRadius: 12, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  avatars: { flexDirection: 'row', width: 80 },
  roomName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
});
