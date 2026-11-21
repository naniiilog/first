import { Link, Stack, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button } from '../components/ui';
import { aiOf } from '../lib/ais';
import { displayName } from '../lib/conversation';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { SYSTEM_ID, USER_ID } from '../lib/types';

export default function RoomsScreen() {
  const { rooms, available, settings } = useStore();
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
      {available === null && (
        <Pressable onPress={() => router.push('/settings')} style={[styles.banner, { backgroundColor: t.danger + '1A', borderColor: t.danger }]}>
          <Text style={{ color: t.text, fontWeight: '600' }}>⚠️ AI 서버에 연결할 수 없어요. 눌러서 확인해 주세요.</Text>
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
            <Text style={{ color: t.subtext, textAlign: 'center' }}>
              ChatGPT, 제미나이, 클로드… 여러 AI를 한 방에 초대해서{'\n'}같이 수다를 떨게 해보세요.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const last = [...item.messages].reverse().find((m) => m.authorId !== SYSTEM_ID);
          const lastMember = last && item.members.find((m) => m.id === last.authorId);
          const lastAuthor = !last ? '' : last.authorId === USER_ID ? settings.userName : lastMember ? displayName(lastMember) : '';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/room/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.avatars}>
                {item.members.slice(0, 3).map((m, i) => (
                  <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -14 }}>
                    <Avatar bot={aiOf(m.aiId)} size={36} dim={!m.active} />
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roomName, { color: t.text }]} numberOfLines={1}>
                  {item.name} <Text style={{ color: t.subtext, fontWeight: '400' }}>{item.members.length}</Text>
                </Text>
                <Text style={{ color: t.subtext }} numberOfLines={1}>
                  {last ? `${lastAuthor}: ${last.text}` : item.members.map(displayName).join(', ')}
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
