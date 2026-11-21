import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderIcon } from '../../../components/HeaderIcon';
import { RoomMenu } from '../../../components/RoomMenu';
import { Avatar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { lookOf } from '../../../lib/avatar';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme, type Theme } from '../../../lib/theme';
import { fullDate, sameDay, sameMinute, stamp } from '../../../lib/time';
import { OWNER_ID, SYSTEM_ID, type ChatMessage, type Member } from '../../../lib/types';

/** 카톡처럼 같은 사람이 같은 분에 연달아 보내면 프로필은 첫 줄에만. 시간(초 단위)은 메시지마다 보여줘요. */
interface Row {
  msg: ChatMessage;
  dateLine: boolean;
  showProfile: boolean;
  showTime: boolean;
}

function toRows(messages: ChatMessage[]): Row[] {
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const dateLine = !prev || !sameDay(prev.createdAt, msg.createdAt);
    const grouped = (a?: ChatMessage, b?: ChatMessage) =>
      !!a && !!b && a.authorId === b.authorId && a.authorId !== SYSTEM_ID && sameMinute(a.createdAt, b.createdAt) && sameDay(a.createdAt, b.createdAt);
    return { msg, dateLine, showProfile: dateLine || !grouped(prev, msg), showTime: true };
  });
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, forgetRoom } = useStore();
  const { room, messages, members, freeTalk, closed, error, gone, refreshMessages, refreshMembers } = useLiveRoom(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  /** 봇 모두 쉬게 하기 / 다시 부르기 (대화 내용과 초대 링크는 그대로) */
  const setRoomClosed = async (next: boolean) => {
    try {
      await api.setClosed(settings, room, next);
      await Promise.all([refreshMembers(), refreshMessages()]);
    } catch (e) {
      fail(e);
    }
  };

  const openMenu = () => setMenuOpen(true);

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
            <View style={{ paddingRight: 8 }}>
              <HeaderIcon name="menu" label="메뉴" onPress={openMenu} />
            </View>
          ),
        }}
      />

      <View style={styles.memberBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
          {members.map((m) => (
            <MemberChip key={m.id} member={m} onPress={() => toggleMember(m)} />
          ))}
          <Pressable onPress={openMembers} style={[styles.chip, { backgroundColor: t.accentSoft }]}>
            <Text style={{ color: t.accentPurple, fontWeight: '700', paddingHorizontal: 6 }}>＋ 초대</Text>
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
              위의 ＋ 초대에서 에이전트 초대 링크를 만들어 보세요.{'\n'}에이전트를 누르면 대화 참가를 껐다 켤 수 있어요.{'\n'}아래 자동대화를 켜면 멈추지 않고 계속 수다를 떨어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageRow row={item} member={memberById[item.msg.authorId]} t={t} onProfile={openMembers} />}
      />

      {closed ? (
        /* 봇 모두 쉬는 중: 봇들이 대화를 멈춰서 토큰을 안 써요. 대화 내용은 그대로예요 */
        <View style={[styles.autoBar, { backgroundColor: t.input, borderColor: t.border }]}>
          <Text style={{ fontSize: 16 }}>🌙</Text>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>봇 모두 쉬는 중</Text>
          <Text style={{ color: t.subtext, fontSize: 12, flex: 1 }} numberOfLines={1}>
            · 대화 내용은 그대로예요
          </Text>
          <Pressable onPress={() => setRoomClosed(false)} style={[styles.reopen, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 13 }}>다시 부르기</Text>
          </Pressable>
        </View>
      ) : (
        /* 자동대화 스위치: 켜짐/꺼짐을 글자로 분명하게 보여줘요 */
        <Pressable onPress={toggleFreeTalk} style={[styles.autoBar, { backgroundColor: freeTalk ? t.accentSoft : t.card, borderColor: t.border }]}>
          <View style={[styles.track, { backgroundColor: freeTalk ? t.accent : t.switchOff }]}>
            <View style={[styles.knob, { alignSelf: freeTalk ? 'flex-end' : 'flex-start', backgroundColor: '#FFFFFF' }]} />
          </View>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>
            자동대화 {freeTalk ? '켜짐' : '꺼짐'}
          </Text>
          <Text style={{ color: t.subtext, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {freeTalk ? '· 봇들이 알아서 계속 대화해요' : '· 이름을 부를 때만 답해요'}
          </Text>
        </Pressable>
      )}

      <RoomMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { icon: 'people-outline', label: '멤버 · 초대 · 프로필', onPress: openMembers },
          closed
            ? { icon: 'sunny-outline', label: '봇 다시 부르기', onPress: () => setRoomClosed(false) }
            : { icon: 'moon-outline', label: '봇 모두 쉬게 하기', onPress: () => setRoomClosed(true) },
          { icon: 'help-circle-outline', label: '사용법 한눈에 보기', onPress: () => router.push('/help') },
          { icon: 'trash-outline', label: '채팅방 삭제', confirm: '한 번 더 누르면 삭제돼요', danger: true, onPress: deleteRoom },
        ]}
      />

      <View style={[styles.inputBar, { backgroundColor: t.card, paddingBottom: Math.max(insets.bottom, 6) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력"
          placeholderTextColor={t.subtext}
          // 키보드 자동 수정·추천이 글을 바꾸지 않게 해요.
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          multiline
          numberOfLines={1}
          maxLength={1000}
          style={[styles.input, { color: t.text, backgroundColor: t.input }]}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          blurOnSubmit={Platform.OS === 'web'}
        />
        <Pressable onPress={send} disabled={!canSend} style={[styles.sendBtn, { backgroundColor: canSend ? t.accent : t.input }]}>
          <Text style={{ color: canSend ? t.accentText : t.subtext, fontWeight: '800', fontSize: 16 }}>전송</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 위쪽 멤버 칩: 누르면 참가를 켜고 꺼요. 참가 중이면 초록불, 쉬는 중이면 빨간불. */
function MemberChip({ member, onPress }: { member: Member; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${member.name} ${member.active ? '참가 중' : '쉬는 중'}`}
      style={[styles.chip, { backgroundColor: member.active ? t.chip : t.chipOff }]}
    >
      <Avatar bot={lookOf(member.kind, member.avatar)} size={22} dim={!member.active} />
      <Text style={{ color: member.active ? t.text : t.subtext, fontWeight: '600', fontSize: 12 }}>{member.name}</Text>
      <View style={[styles.dot, { backgroundColor: member.active ? '#22C55E' : '#EF4444' }]} />
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

  const time = row.showTime ? <Text style={[styles.time, { color: t.chatTime }]}>{stamp(msg.createdAt)}</Text> : null;

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
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 1 },
  errorBar: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  systemPill: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', maxWidth: 320 },
  mineRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 5 },
  otherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  otherBubbleLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  name: { fontSize: 12, marginBottom: 4, marginLeft: 2 },
  bubble: { maxWidth: '64%', flexShrink: 1, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  time: { fontSize: 10, marginBottom: 1, flexShrink: 0 },
  autoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  reopen: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  track: { width: 40, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: 9 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 6 },
  input: { flex: 1, height: 44, maxHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
  sendBtn: { height: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
