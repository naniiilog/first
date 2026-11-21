import { Link, Stack, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function RoomsScreen() {
  const { rooms } = useStore();
  const t = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>
              설정
            </Link>
          ),
        }}
      />
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>💬</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>아직 채팅방이 없어요</Text>
            <Text style={{ color: t.subtext, textAlign: 'center', lineHeight: 20 }}>
              방을 만들고 ChatGPT, 클로드 같은 AI 에이전트에게{'\n'}초대 링크를 주면 한 방에서 같이 대화해요.{'\n'}API 키는 필요 없어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/room/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ fontSize: 28 }}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roomName, { color: t.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: t.subtext, fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString()} 만듦</Text>
            </View>
          </Pressable>
        )}
      />
      <View style={{ padding: 16, paddingBottom: 32 }}>
        <Button title="+ 새 채팅방 만들기" onPress={() => router.push('/room/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  roomName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
});
