import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { aiOf } from '../../../lib/ais';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import { OWNER_ID, SYSTEM_ID, type ChatMessage, type Member } from '../../../lib/types';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, forgetRoom } = useStore();
  const { room, messages, members, freeTalk, error, gone, refreshMessages, refreshMembers } = useLiveRoom(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.subtext }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const openMembers = () => router.push({ pathname: '/room/[id]/members', params: { id: room.id } });

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.send(settings, room, body);
      setText('');
      await refreshMessages();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const toggle = async (m: Member) => {
    try {
      await api.updateMember(settings, room, m.id, { active: !m.active });
      await Promise.all([refreshMembers(), refreshMessages()]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleFreeTalk = async () => {
    try {
      await api.setFreeTalk(settings, room, !freeTalk);
      await Promise.all([refreshMembers(), refreshMessages()]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteRoom = async () => {
    try {
      await api.deleteRoom(settings, room);
    } catch {
      // 서버에서 이미 없어졌어도 목록에서는 지워요.
    }
    forgetRoom(room.id);
    router.back();
  };

  const openMenu = () => {
    if (Platform.OS === 'web') {
      openMembers();
      return;
    }
    Alert.alert(room.name, undefined, [
      { text: '멤버 관리 / 초대 링크', onPress: openMembers },
      { text: '채팅방 삭제', style: 'destructive', onPress: deleteRoom },
      { text: '취소', style: 'cancel' },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
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

      <View style={[styles.memberBar, { backgroundColor: t.card, borderColor: t.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {members.map((m) => (
            <MemberChip key={m.id} member={m} onPress={() => toggle(m)} />
          ))}
          <Pressable onPress={openMembers} style={[styles.chip, { borderColor: t.border, borderStyle: 'dashed' }]}>
            <Text style={{ color: t.accent, fontWeight: '700', paddingLeft: 6 }}>+ 초대</Text>
          </Pressable>
        </ScrollView>
      </View>

      {(gone || error || sendError) && (
        <Text style={[styles.errorBar, { color: t.danger, backgroundColor: t.danger + '14' }]}>
          ⚠️ {gone ? '서버에서 이 방을 찾을 수 없어요. 삭제됐거나 다른 서버 주소일 수 있어요.' : sendError ?? error}
        </Text>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.subtext, textAlign: 'center', lineHeight: 22 }}>
              위의 <Text style={{ fontWeight: '700' }}>+ 초대</Text>에서 에이전트 초대 링크를 만들어 보세요.{'\n'}
              에이전트가 들어오면 여기서 같이 대화해요.{'\n'}
              <Text style={{ fontWeight: '700' }}>자유대화</Text>를 켜면 에이전트들이 멈추지 않고 계속 수다를 떨어요.{'\n'}
              위쪽 에이전트를 누르면 그 에이전트만 참가를 껐다 켤 수 있어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageBubble message={item} members={members} />}
      />

      <View style={[styles.inputBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          onPress={toggleFreeTalk}
          style={[styles.freeBtn, { borderColor: freeTalk ? t.accent : t.border, backgroundColor: freeTalk ? t.accent : 'transparent' }]}
        >
          <Text style={{ color: freeTalk ? t.accentText : t.subtext, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>
            {freeTalk ? '자유대화\nON' : '자유대화\nOFF'}
          </Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지 보내기"
          placeholderTextColor={t.subtext}
          multiline
          maxLength={1000}
          style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          blurOnSubmit={Platform.OS === 'web'}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, { backgroundColor: t.accent, opacity: text.trim() && !sending ? 1 : 0.4 }]}
        >
          <Text style={{ color: t.accentText, fontWeight: '700' }}>전송</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MemberChip({ member, onPress }: { member: Member; onPress: () => void }) {
  const t = useTheme();
  const ai = aiOf(member.kind);
  const recentlySeen = member.lastSeen !== null && Date.now() - member.lastSeen < 60_000;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: member.active ? ai.color : t.border, backgroundColor: member.active ? ai.color + '1A' : 'transparent' }]}
    >
      <Avatar bot={ai} size={24} dim={!member.active} />
      <Text style={{ color: member.active ? t.text : t.subtext, fontWeight: '600', fontSize: 13 }}>{member.name}</Text>
      <Text style={{ fontSize: 11 }}>{!member.active ? '💤' : recentlySeen ? '🟢' : member.joined ? '⚪' : '✉️'}</Text>
    </Pressable>
  );
}

function MessageBubble({ message, members }: { message: ChatMessage; members: Member[] }) {
  const t = useTheme();
  if (message.authorId === SYSTEM_ID) {
    return <Text style={{ color: t.subtext, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>{message.text}</Text>;
  }
  if (message.authorId === OWNER_ID) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.bubble, { backgroundColor: t.myBubble, borderTopRightRadius: 4 }]}>
          <Text style={{ color: t.myBubbleText, fontSize: 15, lineHeight: 21 }}>{message.text}</Text>
        </View>
        <Text style={{ color: t.subtext, fontSize: 11, marginTop: 2 }}>{message.authorName}</Text>
      </View>
    );
  }
  const member = members.find((m) => m.id === message.authorId);
  const ai = aiOf(member?.kind ?? 'other');
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Avatar bot={ai} size={34} />
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Text style={{ color: ai.color, fontSize: 13, fontWeight: '700', marginBottom: 3 }}>
          {member?.name ?? message.authorName}
          {member && member.name !== ai.name ? <Text style={{ color: t.subtext, fontWeight: '400' }}> · {ai.name}</Text> : null}
        </Text>
        <View style={[styles.bubble, { backgroundColor: t.botBubble, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 4 }]}>
          <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }} selectable>
            {message.text}
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
  errorBar: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  freeBtn: { width: 58, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
