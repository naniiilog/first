import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../../components/ui';
import { aiOf } from '../../../lib/ais';
import { displayName } from '../../../lib/conversation';
import { useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { SYSTEM_ID, USER_ID, type ChatMessage, type Member, type Room } from '../../../lib/types';

const BUDGET_STEP = 10_000;

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const room = store.rooms.find((r) => r.id === id);
  const act = store.activityOf(id ?? '');
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const count = room?.messages.length ?? 0;
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [count, act.typingMemberId]);

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.subtext }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const typing = act.typingMemberId ? room.members.find((m) => m.id === act.typingMemberId) : undefined;
  const activeCount = room.members.filter((m) => m.active).length;

  const send = () => {
    if (!text.trim()) return;
    store.sendMessage(room.id, text);
    setText('');
  };

  const openMembers = () => router.push({ pathname: '/room/[id]/members', params: { id: room.id } });
  const openMenu = () => {
    if (Platform.OS === 'web') {
      openMembers();
      return;
    }
    Alert.alert(room.name, undefined, [
      { text: '멤버 관리 / 초대', onPress: openMembers },
      { text: '대화 내용 지우기', onPress: () => store.clearRoom(room.id) },
      {
        text: '채팅방 삭제',
        style: 'destructive' as const,
        onPress: () => {
          store.deleteRoom(room.id);
          router.back();
        },
      },
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: room.name,
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={12}>
              <Text style={{ color: t.accent, fontSize: 22, fontWeight: '700' }}>⋯</Text>
            </Pressable>
          ),
        }}
      />

      <MemberBar room={room} typingId={act.typingMemberId} />
      <TokenMeter room={room} onAdd={() => store.addBudget(room.id, BUDGET_STEP)} />

      <FlatList
        ref={listRef}
        data={room.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.subtext, textAlign: 'center', lineHeight: 22 }}>
              메시지를 보내면 참가 중인 봇들이 차례로 답해요.{'\n'}
              <Text style={{ fontWeight: '700' }}>자유대화</Text>를 켜면 봇들끼리 알아서 수다를 떨어요.{'\n'}
              위쪽 봇을 누르면 대화 참가를 껐다 켤 수 있어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageBubble message={item} room={room} />}
        ListFooterComponent={
          typing ? (
            <View style={styles.typing}>
              <Avatar bot={aiOf(typing.aiId)} size={26} />
              <Text style={{ color: t.subtext }}>{displayName(typing)} 입력 중</Text>
              <ActivityIndicator size="small" color={aiOf(typing.aiId).color} />
            </View>
          ) : undefined
        }
      />

      <View style={[styles.inputBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          onPress={() => store.setFreeTalk(room.id, !act.freeTalk)}
          disabled={!act.freeTalk && activeCount === 0}
          style={[
            styles.freeBtn,
            { borderColor: act.freeTalk ? t.accent : t.border, backgroundColor: act.freeTalk ? t.accent : 'transparent' },
          ]}
        >
          <Text style={{ color: act.freeTalk ? t.accentText : t.subtext, fontWeight: '700', fontSize: 12 }}>
            {act.freeTalk ? '자유대화\nON' : '자유대화\nOFF'}
          </Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={act.freeTalk ? '끼어들어 한마디…' : '메시지 보내기'}
          placeholderTextColor={t.subtext}
          multiline
          style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          blurOnSubmit={Platform.OS === 'web'}
        />
        {act.busy && !text.trim() ? (
          <Pressable onPress={() => store.stopAll(room.id)} style={[styles.sendBtn, { backgroundColor: t.danger }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>중지</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={send}
            disabled={!text.trim()}
            style={[styles.sendBtn, { backgroundColor: t.accent, opacity: text.trim() ? 1 : 0.4 }]}
          >
            <Text style={{ color: t.accentText, fontWeight: '700' }}>전송</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** 위쪽 멤버 목록. 누르면 대화 참가를 켜고 꺼요. */
function MemberBar({ room, typingId }: { room: Room; typingId: string | null }) {
  const store = useStore();
  const t = useTheme();
  return (
    <View style={[styles.memberBar, { backgroundColor: t.card, borderColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {room.members.map((m) => (
          <MemberChip key={m.id} member={m} typing={m.id === typingId} onPress={() => store.updateMember(room.id, m.id, { active: !m.active })} />
        ))}
        <Pressable
          onPress={() => router.push({ pathname: '/room/[id]/members', params: { id: room.id } })}
          style={[styles.chip, { borderColor: t.border, borderStyle: 'dashed' }]}
        >
          <Text style={{ color: t.accent, fontWeight: '700' }}>+ 초대</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function MemberChip({ member, typing, onPress }: { member: Member; typing: boolean; onPress: () => void }) {
  const t = useTheme();
  const ai = aiOf(member.aiId);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: member.active ? ai.color : t.border, backgroundColor: member.active ? ai.color + '1A' : 'transparent' },
      ]}
    >
      <Avatar bot={ai} size={24} dim={!member.active} />
      <Text style={{ color: member.active ? t.text : t.subtext, fontWeight: '600', fontSize: 13 }}>{displayName(member)}</Text>
      <Text style={{ fontSize: 11 }}>{typing ? '💬' : member.active ? '🟢' : '💤'}</Text>
    </Pressable>
  );
}

function TokenMeter({ room, onAdd }: { room: Room; onAdd: () => void }) {
  const t = useTheme();
  const ratio = Math.min(1, room.tokensUsed / Math.max(1, room.tokenBudget));
  const color = ratio > 0.9 ? t.danger : ratio > 0.7 ? '#E6A23C' : t.accent;
  const confirmAdd = () => {
    if (Platform.OS === 'web') return onAdd();
    Alert.alert('토큰 한도 늘리기', `한도를 ${BUDGET_STEP.toLocaleString()} 늘릴까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '늘리기', onPress: onAdd },
    ]);
  };
  return (
    <Pressable onPress={confirmAdd} style={[styles.meter, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={{ color: t.subtext, fontSize: 12 }}>토큰</Text>
      <View style={[styles.meterTrack, { backgroundColor: t.border }]}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ color: t.subtext, fontSize: 12 }}>
        {room.tokensUsed.toLocaleString()} / {room.tokenBudget.toLocaleString()}
      </Text>
      <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>＋</Text>
    </Pressable>
  );
}

function MessageBubble({ message, room }: { message: ChatMessage; room: Room }) {
  const { settings } = useStore();
  const t = useTheme();
  if (message.authorId === SYSTEM_ID) {
    return (
      <Text style={{ color: t.subtext, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>{message.text}</Text>
    );
  }
  if (message.authorId === USER_ID) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.bubble, { backgroundColor: t.myBubble, borderTopRightRadius: 4 }]}>
          <Text style={{ color: t.myBubbleText, fontSize: 15, lineHeight: 21 }}>{message.text}</Text>
        </View>
        <Text style={{ color: t.subtext, fontSize: 11, marginTop: 2 }}>{settings.userName}</Text>
      </View>
    );
  }
  const member = room.members.find((m) => m.id === message.authorId);
  const ai = member ? aiOf(member.aiId) : aiOf('');
  const name = member ? displayName(member) : '나간 봇';
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Avatar bot={ai} size={34} />
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Text style={{ color: ai.color, fontSize: 13, fontWeight: '700', marginBottom: 3 }}>
          {name}
          {member && member.name.trim() && member.name.trim() !== ai.name ? (
            <Text style={{ color: t.subtext, fontWeight: '400' }}> · {ai.name}</Text>
          ) : null}
        </Text>
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: message.error ? t.danger + '1A' : t.botBubble,
              borderColor: message.error ? t.danger : t.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderTopLeftRadius: 4,
            },
          ]}
        >
          <Text style={{ color: message.error ? t.danger : t.text, fontSize: 15, lineHeight: 21 }} selectable>
            {message.error ? `⚠️ ${message.text}` : message.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  memberBar: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  freeBtn: { width: 58, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  sendBtn: { height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
