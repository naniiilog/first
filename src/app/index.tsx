import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button } from '../components/ui';
import { api } from '../lib/api';
import { lookOf } from '../lib/avatar';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { listTime } from '../lib/time';
import type { ChatMessage, Member } from '../lib/types';

interface Preview {
  members: Member[];
  last: ChatMessage | null;
}

/** 카톡처럼 여러 명이면 프로필을 2x2로 모아 보여줘요. */
function GroupAvatar({ members, size = 50 }: { members: Member[]; size?: number }) {
  const t = useTheme();
  if (members.length === 0) {
    return (
      <View style={{ width: size, height: size, borderRadius: size * 0.38, backgroundColor: t.input, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.45 }}>💬</Text>
      </View>
    );
  }
  if (members.length === 1) return <Avatar bot={lookOf(members[0].kind, members[0].avatar)} size={size} />;
  const small = size / 2 - 1;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {members.slice(0, 4).map((m) => (
        <Avatar key={m.id} bot={lookOf(m.kind, m.avatar)} size={small} />
      ))}
    </View>
  );
}

export default function RoomsScreen() {
  const { rooms, settings } = useStore();
  const t = useTheme();
  const [previews, setPreviews] = useState<Record<string, Preview>>({});

  // 화면에 돌아올 때마다 각 방의 멤버와 마지막 메시지를 새로 받아와요.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      rooms.forEach(async (r) => {
        try {
          const [info, last] = await Promise.all([api.getRoom(settings, r), api.lastMessage(settings, r)]);
          if (alive) setPreviews((p) => ({ ...p, [r.id]: { members: info.members, last } }));
        } catch {
          // 서버에 못 붙으면 이전 미리보기를 그대로 둬요.
        }
      });
      return () => {
        alive = false;
      };
    }, [rooms, settings]),
  );

  const sorted = [...rooms].sort(
    (a, b) => (previews[b.id]?.last?.createdAt ?? b.createdAt) - (previews[a.id]?.last?.createdAt ?? a.createdAt),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: '채팅',
          headerTitleAlign: 'left',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: t.bg },
          headerTitleStyle: { fontSize: 22, fontWeight: '800' },
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 20, paddingRight: 12 }}>
              <Pressable onPress={() => router.push('/room/new')} hitSlop={10}>
                <Text style={{ fontSize: 22, color: t.text }}>＋</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
                <Text style={{ fontSize: 20, color: t.text }}>⚙︎</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 4 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 52 }}>💬</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>아직 채팅방이 없어요</Text>
            <Text style={{ color: t.subtext, textAlign: 'center', lineHeight: 20 }}>
              방을 만들고 ChatGPT, 클로드 같은 AI 에이전트에게{'\n'}초대 링크를 주면 한 방에서 같이 대화해요.
            </Text>
            <View style={{ marginTop: 12, width: 220 }}>
              <Button title="새 채팅방 만들기" onPress={() => router.push('/room/new')} />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const p = previews[item.id];
          const members = p?.members ?? [];
          const last = p?.last;
          const preview = !last
            ? '초대 링크를 만들어 에이전트를 불러보세요'
            : last.authorId === 'system'
              ? last.text
              : `${last.authorId === 'owner' ? '' : `${last.authorName}: `}${last.text}`;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/room/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.input : 'transparent' }]}
            >
              <GroupAvatar members={members} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.roomName, { color: t.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {members.length > 0 ? <Text style={{ color: t.subtext, fontSize: 14 }}>{members.length + 1}</Text> : null}
                </View>
                <Text style={{ color: t.subtext, fontSize: 13 }} numberOfLines={2}>
                  {preview}
                </Text>
              </View>
              <Text style={{ color: t.subtext, fontSize: 11, alignSelf: 'flex-start', marginTop: 4 }}>
                {listTime(last?.createdAt ?? item.createdAt)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 },
  roomName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
});
