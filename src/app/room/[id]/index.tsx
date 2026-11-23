import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotStateSheet } from '../../../components/BotStateSheet';
import { HeaderIcon } from '../../../components/HeaderIcon';
import { RoomMenu } from '../../../components/RoomMenu';
import { Avatar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { lookOf } from '../../../lib/avatar';
import { pickPhoto } from '../../../lib/photo';
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

/** 한 번에 그리는 메시지 수 */
const PAGE = 150;

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, forgetRoom } = useStore();
  const live = useLiveRoom(id);
  const { room, messages, members, freeTalk, closed, error, gone, roomInfo } = live;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 답장할 메시지 */
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /** 보낼 사진(미리보기) */
  const [photo, setPhoto] = useState<string | null>(null);
  /** 크게 보는 사진 */
  const [viewing, setViewing] = useState<string | null>(null);
  /** 위쪽에서 누른 봇(상태 고르기 창) */
  const [chipMenu, setChipMenu] = useState<string | null>(null);
  /** 화면에 그리는 최근 메시지 수. 위의 '이전 대화 더 보기'로 늘려요. */
  const [showCount, setShowCount] = useState(PAGE);

  /** 맨 아래를 보고 있는지. 위에서 읽는 중이면 새 메시지가 와도 끌어내리지 않아요. */
  const atBottom = useRef(true);
  /** 다음 내용 변화 때 무조건 맨 아래로(처음 열 때, 내가 보낼 때) */
  const forceBottom = useRef(true);
  /** 마지막으로 처리한 내용 높이. 새 메시지로 길어진 순간의 스크롤 이벤트를 '사용자가 위로 올림'으로 오해하지 않게 해요. */
  const contentH = useRef(0);
  /** 맨 아래에서 본 메시지 수. 그 뒤에 온 건 '새 메시지'로 세요. */
  const [seenCount, setSeenCount] = useState(0);
  const unread = Math.max(0, messages.length - seenCount);

  /** 앱이 스스로 내리는 동안에는 스크롤 이벤트로 '위로 올림'을 판단하지 않아요. */
  const autoScrollUntil = useRef(0);

  const goBottom = (animated: boolean) => {
    autoScrollUntil.current = Date.now() + (animated ? 700 : 250);
    listRef.current?.scrollToEnd({ animated });
    // 웹에서는 마지막 말풍선 높이가 한 박자 늦게 정해져서 끝까지 안 내려갈 때가 있어요. 한 번 더 내려요.
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), animated ? 400 : 80);
    atBottom.current = true;
    setSeenCount(messages.length);
  };

  if (!room) {
    return (
      <View style={[styles.center, { backgroundColor: t.chatBg }]}>
        <Text style={{ color: t.chatTime }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  /** 봇들을 실제 확인 간격(봇 설정 ?? 방 설정)별로 묶기 */
  const roomEvery = roomInfo?.checkIntervalMin ?? 30;
  const groups = [...new Set(members.map((m) => m.checkIntervalMin ?? roomEvery))]
    .sort((a, b) => a - b)
    .map((min) => [min, members.filter((m) => (m.checkIntervalMin ?? roomEvery) === min)] as const);
  /** 참가 중인데 지금 연결이 안 된 봇 수 */
  const away = members.filter((m) => m.active && !m.exhausted && m.joined && !m.online).length;
  const openSettings = () => room && router.push({ pathname: '/room/[id]/settings', params: { id: room.id } });
  const openMembers = () => router.push({ pathname: '/room/[id]/members', params: { id: room.id } });
  /** 버튼 동작은 화면을 먼저 바꾸고(바로 반응), 실패하면 되돌린 뒤 이유를 보여줘요. */
  const run = (p: Promise<string | null>) => {
    setSendError(null);
    p.then((err) => err && setSendError(err));
  };

  const send = () => {
    const body = text.trim();
    if (!body && !photo) return;
    // 입력창은 바로 비우고, 메시지도 바로 화면에 보여줘요(내 메시지는 맨 아래로 내려가서 보여줘요).
    forceBottom.current = true;
    setText('');
    setPhoto(null);
    const target = replyTo;
    setReplyTo(null);
    run(
      live.sendMessage(body, { replyTo: target?.id ?? null, image: photo }).then((err) => {
        if (err) {
          setText(body);
          setReplyTo(target);
        }
        return err;
      }),
    );
  };

  const attachPhoto = async () => {
    try {
      const url = await pickPhoto({ maxSide: 1024 });
      if (url) setPhoto(url);
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

  const openMenu = () => setMenuOpen(true);

  const hidden = Math.max(0, messages.length - showCount);
  const rows = toRows(hidden ? messages.slice(hidden) : messages);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const nameOf = (m: ChatMessage) => (m.authorId === OWNER_ID ? settings.userName : (memberById[m.authorId]?.name ?? m.authorName));
  const canSend = !!text.trim() || !!photo;

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

      {/* 봇이 많아도 한눈에 보이게: 옆으로 밀지 않고 여러 줄로 작게 보여줘요(너무 많으면 이 칸만 위아래로 밀어요). */}
      <View style={styles.memberBar}>
        <Text style={[styles.memberSummary, { color: t.chatTime }]}>
          참가 {members.filter((m) => m.active).length} · 대화 중 {members.filter((m) => m.active && !m.exhausted && m.online).length}
          {members.some((m) => m.active && m.exhausted) ? ` · 소진 ${members.filter((m) => m.active && m.exhausted).length}` : ''} · 쉬는 중{' '}
          {members.filter((m) => !m.active).length}
        </Text>
        {/* 확인 간격별로 줄을 나눠 보여줘요(실시간 → 긴 간격 순). 봇을 누르면 상태·간격을 바꿔요. */}
        <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ gap: 4 }} showsVerticalScrollIndicator={false}>
          {groups.map(([min, list], i) => (
            <View key={min} style={styles.groupRow}>
              <View style={[styles.groupTag, { backgroundColor: t.input }]}>
                <Text style={{ color: t.subtext, fontSize: 10, fontWeight: '800' }}>⏱ {intervalShort(min)}</Text>
              </View>
              <View style={[styles.memberWrap, { flex: 1 }]}>
                {list.map((m) => (
                  <MemberChip key={m.id} member={m} onPress={() => setChipMenu(m.id)} />
                ))}
                {i === groups.length - 1 && (
                  <Pressable onPress={openMembers} style={[styles.chip, { backgroundColor: t.accentSoft }]}>
                    <Text style={{ color: t.accentPurple, fontWeight: '700', fontSize: 12, paddingHorizontal: 6 }}>＋ 초대</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          {groups.length === 0 && (
            <Pressable onPress={openMembers} style={[styles.chip, { backgroundColor: t.accentSoft, alignSelf: 'flex-start' }]}>
              <Text style={{ color: t.accentPurple, fontWeight: '700', fontSize: 12, paddingHorizontal: 6 }}>＋ 초대</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {(gone || error || sendError) && (
        <Text style={[styles.errorBar, { color: '#fff', backgroundColor: 'rgba(229,72,77,0.85)' }]}>
          ⚠️ {gone ? '서버에서 이 방을 찾을 수 없어요. 삭제됐거나 다른 서버 주소일 수 있어요.' : sendError ?? error}
        </Text>
      )}

      <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => String(r.msg.id)}
        // 웹에서 목록을 나눠 그리다 멈추면 새 메시지가 안 보여요. 최근 메시지만 모두 그려요(나머지는 '이전 대화 더 보기').
        disableVirtualization
        initialNumToRender={showCount}
        ListHeaderComponent={
          hidden > 0 ? (
            <Pressable onPress={() => setShowCount((n) => n + PAGE)} style={[styles.morePill, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>이전 대화 더 보기 ({hidden}개)</Text>
            </Pressable>
          ) : undefined
        }
        // 빈 방일 때만 안내를 가운데 두려고 늘려요(글이 있을 때 늘리면 짧은 대화에서 새 글이 와도 높이가 안 바뀌어 '새 메시지' 표시가 잘못 떠요).
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, flexGrow: rows.length ? 0 : 1 }}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          if (Date.now() < autoScrollUntil.current) return;
          const height = contentH.current || contentSize.height;
          const fromBottom = height - (contentOffset.y + layoutMeasurement.height);
          atBottom.current = fromBottom < 80;
          if (atBottom.current && seenCount !== messages.length) setSeenCount(messages.length);
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          // 새 메시지로 내용이 길어졌을 때: 맨 아래를 보고 있었으면 따라 내려가고, 위에서 읽는 중이면 그대로 둬요.
          if (forceBottom.current || atBottom.current) {
            forceBottom.current = false;
            goBottom(false);
          }
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.systemPill, { color: t.systemText, backgroundColor: t.systemPill, lineHeight: 20, textAlign: 'center' }]}>
              위의 ＋ 초대에서 에이전트 초대 링크를 만들어 보세요.{'\n'}에이전트를 누르면 참가 · 사용량 소진 · 쉬게 하기를 고를 수 있어요.{'\n'}아래 자동대화를 켜면 멈추지 않고 계속 수다를 떨어요.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageRow
            row={item}
            member={memberById[item.msg.authorId]}
            quoted={item.msg.replyTo ? messageById.get(item.msg.replyTo) : undefined}
            quotedName={nameOf}
            t={t}
            onProfile={openMembers}
            onReply={() => setReplyTo(item.msg)}
            onImage={setViewing}
          />
        )}
      />
      {unread > 0 && (
        <Pressable onPress={() => goBottom(true)} style={[styles.newPill, { backgroundColor: t.accent }]} accessibilityLabel="새 메시지 보기">
          <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 13 }}>새 메시지 {unread}개 ↓</Text>
        </Pressable>
      )}
      </View>

      {closed ? (
        /* 봇 모두 쉬는 중: 봇들이 대화를 멈춰서 토큰을 안 써요. 대화 내용은 그대로예요 */
        <View style={[styles.autoBar, { backgroundColor: t.input, borderColor: t.border }]}>
          <Text style={{ fontSize: 16 }}>🌙</Text>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>봇 모두 쉬는 중</Text>
          <Text style={{ color: t.subtext, fontSize: 12, flex: 1 }} numberOfLines={1}>
            · 대화 내용은 그대로예요
          </Text>
          <Pressable onPress={() => run(live.setRoomClosed(false))} style={[styles.reopen, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '700', fontSize: 13 }}>다시 부르기</Text>
          </Pressable>
        </View>
      ) : (
        /* 자동대화 스위치: 켜짐/꺼짐을 글자로 분명하게 보여줘요 */
        <Pressable onPress={() => run(live.toggleFreeTalk())} style={[styles.autoBar, { backgroundColor: freeTalk ? t.accentSoft : t.card, borderColor: t.border }]}>
          <View style={[styles.track, { backgroundColor: freeTalk ? t.accent : t.switchOff }]}>
            <View style={[styles.knob, { alignSelf: freeTalk ? 'flex-end' : 'flex-start', backgroundColor: '#FFFFFF' }]} />
          </View>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>
            자동대화 {freeTalk ? '켜짐' : '꺼짐'}
          </Text>
          <Text style={{ color: t.subtext, fontSize: 12, flexShrink: 1, flex: 1 }} numberOfLines={1}>
            {freeTalk ? '· 봇들이 알아서 계속 대화해요' : '· 이름을 부를 때만 답해요'}
          </Text>
          {/* 멈춘 봇이 있으면 다시 부르기(멤버 화면으로) */}
          {freeTalk && away > 0 && (
            <Pressable onPress={openMembers} hitSlop={6} style={[styles.schedPill, { backgroundColor: t.accent }]}>
              <Text style={{ color: t.accentText, fontSize: 11, fontWeight: '700' }}>다시 부르기 {away}</Text>
            </Pressable>
          )}
          {/* 확인 간격·매너타임: 누르면 방 설정으로 */}
          <Pressable onPress={openSettings} hitSlop={6} style={[styles.schedPill, { backgroundColor: roomInfo?.quietNow ? t.accentSoft : t.input }]}>
            <Text style={{ color: roomInfo?.quietNow ? t.accentPurple : t.subtext, fontSize: 11, fontWeight: '700' }}>
              {roomInfo?.quietNow ? '🌙 매너타임' : `⏱ ${scheduleLabel(roomInfo?.checkIntervalMin ?? 30)}${roomInfo?.waitMode === 'away' && (roomInfo?.checkIntervalMin ?? 0) > 0 ? ' · 쉬었다 오기' : ''}`}
            </Text>
          </Pressable>
        </Pressable>
      )}

      <BotStateSheet
        member={members.find((m) => m.id === chipMenu) ?? null}
        onClose={() => setChipMenu(null)}
        onProfile={openMembers}
        // 쉬게 하기는 소진 표시를 그대로 둬요(그래야 '사용량이 다시 찼어요'라고 잘못 알리지 않아요).
        onPick={(m, state) => run(live.setMemberState(m, { active: state !== 'off', exhausted: state === 'off' ? !!m.exhausted : state === 'exhausted' }))}
        roomInterval={roomInfo?.checkIntervalMin ?? 30}
        onInterval={(m, v) => run(live.setMemberInterval(m, v))}
      />

      <RoomMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { icon: 'people-outline', label: '멤버 · 초대 · 프로필', onPress: openMembers },
          { icon: 'notifications-outline', label: '확인 간격 · 매너타임 · 알림', onPress: openSettings },
          { icon: 'stats-chart-outline', label: '봇 사용량', onPress: () => router.push({ pathname: '/usage', params: { room: room.id } }) },
          closed
            ? { icon: 'sunny-outline', label: '봇 다시 부르기', onPress: () => run(live.setRoomClosed(false)) }
            : { icon: 'moon-outline', label: '봇 모두 쉬게 하기', onPress: () => run(live.setRoomClosed(true)) },
          { icon: 'help-circle-outline', label: '사용법 한눈에 보기', onPress: () => router.push('/help') },
          { icon: 'trash-outline', label: '채팅방 삭제', confirm: '한 번 더 누르면 삭제돼요', danger: true, onPress: deleteRoom },
        ]}
      />

      {(replyTo || photo) && (
        <View style={[styles.composeExtra, { backgroundColor: t.card, borderColor: t.border }]}>
          {replyTo ? (
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 12 }}>↪ {nameOf(replyTo)}에게 답장</Text>
              <Text style={{ color: t.subtext, fontSize: 12 }} numberOfLines={1}>
                {replyTo.image && !replyTo.text ? '[사진]' : replyTo.text}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : null}
          <Pressable
            onPress={() => {
              setReplyTo(null);
              setPhoto(null);
            }}
            hitSlop={10}
            accessibilityLabel="답장·사진 취소"
          >
            <Ionicons name="close-circle" size={22} color={t.subtext} />
          </Pressable>
        </View>
      )}

      <View style={[styles.inputBar, { backgroundColor: t.card, paddingBottom: Math.max(insets.bottom, 6) }]}>
        <Pressable onPress={attachPhoto} accessibilityLabel="사진 보내기" style={styles.attachBtn} hitSlop={6}>
          <Ionicons name="image-outline" size={26} color={t.subtext} />
        </Pressable>
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

      {/* 사진 크게 보기 */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const intervalShort = (n: number) => (n === 0 ? '실시간' : n >= 60 ? `${n / 60}시간` : `${n}분`);
const scheduleLabel = (n: number) => (n === 0 ? '실시간' : n >= 60 ? `${n / 60}시간마다` : `${n}분마다`);

/** 지금 대화 중인 봇의 초록불: 깜빡깜빡 */
function BlinkDot() {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 550, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.dot, { backgroundColor: '#22C55E', opacity }]} />;
}

/**
 * 위쪽 멤버 칩: 누르면 상태 고르기 창(참가 · 사용량 소진 · 쉬게 하기)이 열려요.
 * 쉬는 중 빨간불 · 사용량 소진 주황불 · 대화 중 깜빡이는 초록불 · 참가 중 초록불
 */
function MemberChip({ member, onPress }: { member: Member; onPress: () => void }) {
  const t = useTheme();
  const talking = member.active && !member.exhausted && member.online;
  const state = !member.active ? '쉬는 중' : member.exhausted ? '사용량 소진' : talking ? '대화 중' : '참가 중';
  const color = !member.active ? '#EF4444' : member.exhausted ? '#F59E0B' : '#22C55E';
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${member.name} ${state}`}
      accessibilityHint="누르면 참가 · 사용량 소진 · 쉬게 하기를 고를 수 있어요."
      style={({ pressed }) => [styles.chip, { backgroundColor: member.active ? t.chip : t.chipOff, opacity: pressed ? 0.6 : 1 }]}
    >
      <Avatar bot={lookOf(member.kind, member.avatar)} size={18} dim={!member.active || !!member.exhausted} />
      <Text style={{ color: member.active && !member.exhausted ? t.text : t.subtext, fontWeight: '600', fontSize: 11 }} numberOfLines={1}>
        {member.name}
      </Text>
      {talking ? <BlinkDot /> : <View style={[styles.dot, { backgroundColor: color }]} />}
    </Pressable>
  );
}

/** 답장한 원래 글을 말풍선 위에 작게 보여줘요. */
function Quote({ m, name, mine, t }: { m?: ChatMessage; name: (m: ChatMessage) => string; mine: boolean; t: Theme }) {
  if (!m) return null;
  return (
    <View style={[styles.quote, { borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : t.accentPurple }]}>
      <Text style={{ color: mine ? 'rgba(255,255,255,0.9)' : t.accentPurple, fontSize: 11, fontWeight: '700' }}>↪ {name(m)}</Text>
      <Text style={{ color: mine ? 'rgba(255,255,255,0.85)' : t.subtext, fontSize: 12 }} numberOfLines={2}>
        {m.image && !m.text ? '[사진]' : m.text}
      </Text>
    </View>
  );
}

function Bubble({
  msg,
  mine,
  first,
  quoted,
  quotedName,
  t,
  onReply,
  onImage,
}: {
  msg: ChatMessage;
  mine: boolean;
  first: boolean;
  quoted?: ChatMessage;
  quotedName: (m: ChatMessage) => string;
  t: Theme;
  onReply: () => void;
  onImage: (uri: string) => void;
}) {
  return (
    <Pressable
      onLongPress={onReply}
      delayLongPress={350}
      accessibilityHint="길게 누르면 답장해요"
      style={[
        styles.bubble,
        { backgroundColor: mine ? t.myBubble : t.botBubble, opacity: msg.pending ? 0.6 : 1 },
        first && (mine ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }),
      ]}
    >
      <Quote m={quoted} name={quotedName} mine={mine} t={t} />
      {msg.image ? (
        <Pressable onPress={() => onImage(msg.image!)} onLongPress={onReply} delayLongPress={350}>
          <Image source={{ uri: msg.image }} style={styles.photo} resizeMode="cover" />
        </Pressable>
      ) : null}
      {msg.text ? (
        <Text style={[styles.bubbleText, { color: mine ? t.myBubbleText : t.botBubbleText }]} selectable={Platform.OS !== 'web'}>
          {msg.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MessageRow({
  row,
  member,
  quoted,
  quotedName,
  t,
  onProfile,
  onReply,
  onImage,
}: {
  row: Row;
  member?: Member;
  quoted?: ChatMessage;
  quotedName: (m: ChatMessage) => string;
  t: Theme;
  onProfile: () => void;
  onReply: () => void;
  onImage: (uri: string) => void;
}) {
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

  const time = row.showTime ? (
    <Text style={[styles.time, { color: t.chatTime }]}>{msg.pending ? '보내는 중…' : stamp(msg.createdAt)}</Text>
  ) : null;
  const bubble = (mine: boolean) => (
    <Bubble msg={msg} mine={mine} first={row.showProfile} quoted={quoted} quotedName={quotedName} t={t} onReply={onReply} onImage={onImage} />
  );

  if (msg.authorId === OWNER_ID) {
    return (
      <>
        {dateLine}
        <View style={[styles.mineRow, { marginTop: row.showProfile ? 8 : 3 }]}>
          {time}
          {bubble(true)}
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
            {bubble(false)}
            {time}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6 },
  photo: { width: 200, height: 200, borderRadius: 10, marginBottom: 4 },
  composeExtra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  attachBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  memberBar: { paddingTop: 2, paddingBottom: 6, paddingHorizontal: 10, gap: 4 },
  morePill: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  schedPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  memberSummary: { fontSize: 11, marginLeft: 2 },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  groupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  groupTag: { width: 52, alignItems: 'center', paddingVertical: 4, borderRadius: 8, marginTop: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 3, paddingRight: 7, paddingVertical: 2, borderRadius: 999, maxWidth: 150 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 1 },
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
