import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { lookOf } from '../../../lib/avatar';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme, type Theme } from '../../../lib/theme';
import { clock, fullDate, sameDay, sameMinute } from '../../../lib/time';
import { OWNER_ID, SYSTEM_ID, type ChatMessage, type Member } from '../../../lib/types';

/** 카톡처럼: 같은 사람이 같은 분에 연달아 보내면 프로필은 첫 줄에만, 시간은 마지막 줄에만 */
interface Row {
  msg: ChatMessage;
  dateLine: boolean;
  showProfile: boolean;
  showTime: boolean;
}

function toRows(messages: ChatMessage[]): Row[] {
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const dateLine = !prev || !sameDay(prev.createdAt, msg.createdAt);
    const grouped = (a?: ChatMessage, b?: ChatMessage) =>
      !!a && !!b && a.authorId === b.authorId && a.authorId !== SYSTEM_ID && sameMinute(a.createdAt, b.createdAt) && sameDay(a.createdAt, b.createdAt);
    return { msg, dateLine, showProfile: dateLine || !grouped(prev, msg), showTime: !grouped(msg, next) };
  });
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, forgetRoom } = useStore();
  const { room, messages, members, freeTalk, error, gone, refreshMessages, refreshMembers } = useLiveRoom(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  if (!room) {
    return (
      <View style={[styles.center, { backgroundColor: t.chatBg }]}>
        <Text style={{ color: t.chatTime }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const openMembers = () => router.push({ pathname: '/room/[id]/members', params: { id: room.id } });
  const fail = (e: unknown) => setSendError(e instanceof Error ? e.message : String(e));

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
      fail(e);
    } finally {
      setSending(false);
    }
  };

  const toggleMember = async (m: Member) => {
    try {
      await api.updateMember(settings, room, m.id, { active: !m.active });
      await Promise.all([refreshMembers(), refreshMessages()]);
    } catch (e) {
      fail(e);
    }
  };

  const toggleFreeTalk = async () => {
    try {
      await api.setFreeTalk(settings, room, !freeTalk);
      await Promise.all([refreshMembers(), refreshMessages()]);
    } catch (e) {
      fail(e);
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
      { text: '멤버 · 초대 · 프로필', onPress: openMembers },
      { text: '채팅방 나가기(삭제)', style: 'destructive', onPress: deleteRoom },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const rows = toRows(messages);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const canSend = !!text.trim() && !sending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.chatBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: t.chatBg },
          headerShadowVisible: false,
          headerLeft: undefined,
          headerTitle: () => (
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }} numberOfLines={1}>
              {room.name} <Text style={{ color: t.chatTime, fontWeight: '500' }}>{members.length + 1}</Text>
            </Text>
          ),
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={12}>
              <Text style={{ color: t.text, fontSize: 22 }}>☰</Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.memberBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
          {members.map((m) => (
            <MemberChip key={m.id} member={m} onPress={() => toggleMember(m)} />
          ))}
          <Pressable onPress={openMembers} style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.55)' }]}>
            <Text style={{ color: '#191919', fontWeight: '700', paddingHorizontal: 6 }}>＋ 초대</Text>
          </Pressable>
        </ScrollView>
      </View>

      {(gone || error || sendError) && (
        <Text style={[styles.errorBar, { color: '#fff', backgroundColor: 'rgba(229,72,77,0.85)' }]}>
          ⚠️ {gone ? '서버에서 이 방을 찾을 수 없어요. 삭제됐거나 다른 서버 주소일 수 있어요.' : sendError ?? error}
        </Text>
      )}

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => String(r.msg.id)}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.systemPill, { color: t.systemText, backgroundColor: t.systemPill, lineHeight: 20, textAlign: 'center' }]}>
              위의 ＋ 초대에서 에이전트 초대 링크를 만들어 보세요.{'\n'}에이전트를 누르면 대화 참가를 껐다 켤 수 있어요.{'\n'}자유대화를 켜면 멈추지 않고 계속 수다를 떨어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageRow row={item} member={memberById[item.msg.authorId]} t={t} onProfile={openMembers} />}
      />

      <View style={[styles.inputBar, { backgroundColor: t.card, paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable onPress={toggleFreeTalk} style={[styles.freeBtn, { backgroundColor: freeTalk ? t.accent : t.input }]}>
          <Text style={{ color: freeTalk ? t.accentText : t.subtext, fontWeight: '800', fontSize: 11, textAlign: 'center' }}>
            {freeTalk ? '자유대화\nON' : '자유대화\nOFF'}
          </Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력"
          placeholderTextColor={t.subtext}
          multiline
          maxLength={1000}
          style={[styles.input, { color: t.text, backgroundColor: t.input }]}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          blurOnSubmit={Platform.OS === 'web'}
        />
        <Pressable onPress={send} disabled={!canSend} style={[styles.sendBtn, { backgroundColor: canSend ? t.accent : t.input }]}>
          <Text style={{ color: canSend ? t.accentText : t.subtext, fontWeight: '800', fontSize: 18 }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MemberChip({ member, onPress }: { member: Member; onPress: () => void }) {
  const recentlySeen = member.lastSeen !== null && Date.now() - member.lastSeen < 60_000;
  const status = !member.active ? '💤' : recentlySeen ? '🟢' : member.joined ? '⚪' : '✉️';
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: member.active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }]}>
      <Avatar bot={lookOf(member.kind, member.avatar)} size={22} dim={!member.active} />
      <Text style={{ color: member.active ? '#191919' : '#5A6570', fontWeight: '600', fontSize: 12 }}>{member.name}</Text>
      <Text style={{ fontSize: 10 }}>{status}</Text>
    </Pressable>
  );
}

function MessageRow({ row, member, t, onProfile }: { row: Row; member?: Member; t: Theme; onProfile: () => void }) {
  const { msg } = row;
  const dateLine = row.dateLine ? (
    <View style={{ alignItems: 'center', marginVertical: 10 }}>
      <Text style={[styles.systemPill, { color: t.systemText, backgroundColor: t.systemPill }]}>📅 {fullDate(msg.createdAt)}</Text>
    </View>
  ) : null;

  if (msg.authorId === SYSTEM_ID) {
    return (
      <>
        {dateLine}
        <View style={{ alignItems: 'center', marginVertical: 6 }}>
          <Text style={[styles.systemPill, { color: t.systemText, backgroundColor: t.systemPill }]}>{msg.text}</Text>
        </View>
      </>
    );
  }

  const time = row.showTime ? <Text style={[styles.time, { color: t.chatTime }]}>{clock(msg.createdAt)}</Text> : null;

  if (msg.authorId === OWNER_ID) {
    return (
      <>
        {dateLine}
        <View style={[styles.mineRow, { marginTop: row.showProfile ? 8 : 3 }]}>
          {time}
          <View style={[styles.bubble, { backgroundColor: t.myBubble }, row.showProfile && { borderTopRightRadius: 4 }]}>
            <Text style={[styles.bubbleText, { color: t.myBubbleText }]} selectable>
              {msg.text}
            </Text>
          </View>
        </View>
      </>
    );
  }

  const look = lookOf(member?.kind ?? 'other', member?.avatar);
  return (
    <>
      {dateLine}
      <View style={[styles.otherRow, { marginTop: row.showProfile ? 10 : 3 }]}>
        <View style={{ width: 42 }}>
          {row.showProfile ? (
            <Pressable onPress={onProfile}>
              <Avatar bot={look} size={40} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          {row.showProfile ? <Text style={[styles.name, { color: t.chatName }]}>{member?.name ?? msg.authorName}</Text> : null}
          <View style={styles.otherBubbleLine}>
            <View style={[styles.bubble, { backgroundColor: t.botBubble }, row.showProfile && { borderTopLeftRadius: 4 }]}>
              <Text style={[styles.bubbleText, { color: t.botBubbleText }]} selectable>
                {msg.text}
              </Text>
            </View>
            {time}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  memberBar: { paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 3, paddingRight: 8, paddingVertical: 3, borderRadius: 999 },
  errorBar: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  systemPill: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', maxWidth: 320 },
  mineRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 5 },
  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  otherBubbleLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  name: { fontSize: 12, marginBottom: 4, marginLeft: 2 },
  bubble: { maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  time: { fontSize: 10, marginBottom: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 8, paddingTop: 8 },
  freeBtn: { width: 54, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 38, maxHeight: 120, borderRadius: 19, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 15 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
