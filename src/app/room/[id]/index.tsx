import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotStateSheet } from '../../../components/BotStateSheet';
import { HeaderIcon } from '../../../components/HeaderIcon';
import { confirmPrivate } from '../../../lib/privacy';
import { saveImage } from '../../../lib/saveImage';
import { loadMarks, saveReadMark, toggleBookmark, type Bookmark } from '../../../lib/marks';
import { BookmarkSheet, MessageActions } from '../../../components/MessageActions';
import { SearchSheet } from '../../../components/SearchSheet';
import { TurnPanel, TurnSetup } from '../../../components/TurnPanel';
import { LeaderPicker, NoticeBar, NoticeEditor } from '../../../components/RoomBoard';
import { RoomMenu } from '../../../components/RoomMenu';
import { Avatar } from '../../../components/ui';
import { api, type Board, type Guest } from '../../../lib/api';
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

/** 지금 시각(이벤트 처리 안에서만 써요) */
const nowMs = () => Date.now();

/** 한 번에 그리는 메시지 수 */
const PAGE = 150;

export default function RoomScreen() {
  const { id, jump } = useLocalSearchParams<{ id: string; jump?: string }>();
  const { settings, forgetRoom } = useStore();
  const live = useLiveRoom(id);
  const { room, messages, members, freeTalk, closed, error, gone, roomInfo } = live;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 이 방의 게시판들(☰ 메뉴 아래에 하나씩) */
  const [boardList, setBoardList] = useState<Board[]>([]);
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
  /** 검색 창 */
  const [searching, setSearching] = useState(false);
  /** 찾아간 글을 잠깐 반짝 표시 */
  const [flashId, setFlashId] = useState<number | null>(null);
  /** 위로 올려 읽는 중이면 '맨 아래로' 버튼을 보여줘요 */
  const [showDown, setShowDown] = useState(false);
  /** 순서 정하기 창 */
  const [turnEdit, setTurnEdit] = useState(false);
  /** 공지 쓰기 창, 봇 대장 고르기 창 */
  const [noticeEdit, setNoticeEdit] = useState(false);
  const [leaderPick, setLeaderPick] = useState(false);
  /** 참여자 목록 접기(이 폰에 기억해요) */
  const [membersFolded, setMembersFolded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('dabot.membersFolded')
      .then((v) => setMembersFolded(v === '1'))
      .catch(() => {});
  }, []);
  const toggleMembers = () =>
    setMembersFolded((f) => {
      AsyncStorage.setItem('dabot.membersFolded', f ? '0' : '1').catch(() => {});
      return !f;
    });
  /** 초대한 사람들(위쪽 목록에 '사람'으로 보여요) */
  const [guests, setGuests] = useState<Guest[]>([]);
  useEffect(() => {
    if (!room) return;
    let alive = true;
    const load = () => api.guests(settings, room).then((r) => alive && setGuests(r.guests)).catch(() => {});
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [room, settings]);
  /** 최신 목록(찾아가기에서 다시 그려진 뒤의 목록을 보려고) */
  const rowsRef = useRef<Row[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    const h = Math.max(0, messages.length - showCount);
    rowsRef.current = toRows(h ? messages.slice(h) : messages);
    messagesRef.current = messages;
  }, [messages, showCount]);

  /** 맨 아래를 보고 있는지. 위에서 읽는 중이면 새 메시지가 와도 끌어내리지 않아요. */
  const atBottom = useRef(true);
  /** 다음 내용 변화 때 무조건 맨 아래로(처음 열 때, 내가 보낼 때) */
  const forceBottom = useRef(true);
  /** 마지막으로 처리한 내용 높이. 새 메시지로 길어진 순간의 스크롤 이벤트를 '사용자가 위로 올림'으로 오해하지 않게 해요. */
  const contentH = useRef(0);
  /** 맨 아래에서 본 메시지 수. 그 뒤에 온 건 '새 메시지'로 세요. */
  // 맨 아래에서 마지막으로 본 글 번호. 그보다 새 글만 '새 메시지'로 세요(오래된 글을 불러와도 안 늘어요).
  const lastRealId = (list: ChatMessage[]) => list.reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
  const [seenId, setSeenId] = useState(0);
  const unread = messages.filter((m) => m.id > seenId).length;

  /** 앱이 스스로 내리는 동안에는 스크롤 이벤트로 '위로 올림'을 판단하지 않아요. */
  const autoScrollUntil = useRef(0);
  /** 찾아가는 동안(그리고 그 뒤 잠깐)은 맨 아래로 따라 내려가지 않아요. */
  const jumpHold = useRef(0);

  /**
   * 안드로이드: 화면이 앱 전체를 쓰는 방식이라 키보드가 올라와도 화면이 줄지 않아요.
   * 키보드 높이만큼 아래를 띄워서 입력창이 키보드 위에 보이게 해요(화면이 이미 줄었으면 그만큼은 빼요).
   */
  const [kbPad, setKbPad] = useState(0);
  const baseH = useRef(0);
  const curH = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      // 화면이 줄어드는 데 한 박자 걸려서 잠깐 뒤에 재요.
      setTimeout(() => {
        const shrunk = baseH.current > 0 ? Math.max(0, baseH.current - curH.current) : 0;
        setKbPad(Math.max(0, e.endCoordinates.height - shrunk));
        // 맨 아래를 보고 있었으면 키보드가 올라온 뒤에도 마지막 글이 보이게 내려요.
        setTimeout(() => atBottom.current && listRef.current?.scrollToEnd({ animated: true }), 120);
      }, 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** 맨 아래로. markRead면 '여기까지 읽음'도 저장해요(방을 처음 열 때 저절로 내려가는 건 읽은 게 아니라서 빼요). */
  const goBottom = (animated: boolean, markRead = true) => {
    if (markRead && room) saveReadMark(settings, room, lastRealId(messages));
    autoScrollUntil.current = Date.now() + (animated ? 700 : 250);
    listRef.current?.scrollToEnd({ animated });
    // 웹에서는 마지막 말풍선 높이가 한 박자 늦게 정해져서 끝까지 안 내려갈 때가 있어요. 한 번 더 내려요.
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), animated ? 400 : 80);
    atBottom.current = true;
    setSeenId(lastRealId(messages));
  };

  /**
   * 그 글로 찾아가기(답장 원문, 검색 결과).
   * 안 불러온 오래된 글이면 먼저 불러오고, 화면에 그려지면 가운데쯤으로 스크롤해서 잠깐 반짝여요.
   */
  const jumpTo = async (id: number, flash = true) => {
    atBottom.current = false;
    forceBottom.current = false;
    jumpHold.current = nowMs() + 15_000;
    let found = messagesRef.current.some((m) => m.id === id);
    for (let tries = 0; !found && tries < 80; tries++) {
      const got = await live.loadOlder();
      if (!got.length) break;
      found = got.some((m) => m.id === id);
    }
    // 불러온 글이 화면 목록에 반영될 때까지 잠깐 기다려요.
    for (let w = 0; found && !messagesRef.current.some((m) => m.id === id) && w < 40; w++) await new Promise((r) => setTimeout(r, 50));
    const list = messagesRef.current;
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) {
      setSendError('그 글을 찾을 수 없어요(지워졌을 수 있어요).');
      return;
    }
    setShowCount((n) => Math.max(n, list.length - idx + 5));
    let attempt = 0;
    const tryScroll = () => {
      const i = rowsRef.current.findIndex((r) => r.msg.id === id);
      // 웹은 그 말풍선이 실제로 그려질 때까지 기다려요(목록이 조금씩 나눠 그려요).
      const el = Platform.OS === 'web' && typeof document !== 'undefined' ? document.getElementById(`msg-${id}`) : null;
      const ready = Platform.OS === 'web' ? !!el : i >= 0;
      if (!ready) {
        if (attempt++ < 30) setTimeout(tryScroll, 150);
        return;
      }
      autoScrollUntil.current = Date.now() + 800;
      jumpHold.current = Date.now() + 1500;
      atBottom.current = false;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.35 });
      if (!flash) return;
      setFlashId(id);
      setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
    };
    setTimeout(tryScroll, 80);
  };

  // ── 마지막으로 읽은 곳: 방을 열 때 한 번 읽어 두고(이번에 보는 동안 그대로), 맨 아래까지 보면 저장해요 ──
  const [readMark, setReadMarkState] = useState<number | null>(null);
  // ── 북마크 ──
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // 서버(어느 기기에서든 같게)와 이 폰에 있던 것을 합쳐서 한 번 불러와요.
  const roomId = room?.id;
  useEffect(() => {
    if (!room) return;
    let alive = true;
    loadMarks(settings, room).then((m) => {
      if (!alive) return;
      setReadMarkState(m.readMark);
      setBookmarks(m.bookmarks);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  /** 읽던 곳 다음 첫 글(내 글·안내 빼고) */
  const firstUnreadId = readMark ? messages.find((m) => m.id > readMark && m.authorId !== OWNER_ID && m.authorId !== SYSTEM_ID)?.id ?? null : null;
  // 방을 열었을 때 안 읽은 글이 3개 넘게 있으면 읽던 곳으로 가요.
  const handledRead = useRef(false);
  useEffect(() => {
    if (handledRead.current || !firstUnreadId || jump) return;
    handledRead.current = true;
    const after = messages.filter((m) => m.id >= firstUnreadId).length;
    if (after <= 3) {
      // 안 읽은 게 얼마 안 되면 맨 아래에서 다 보이니 읽은 걸로 해요.
      if (room) saveReadMark(settings, room, lastRealId(messages));
      return;
    }
    const timer = setTimeout(() => jumpTo(firstUnreadId, false), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUnreadId]);

  // 순서 대화 중엔 새 글이 오면 바로 차례 표시를 새로 받아요(5초 기다리지 않게).
  const turnOn = !!roomInfo?.turnOrder;
  useEffect(() => {
    if (turnOn && messages.length) live.refreshMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnOn, messages.length]);

  /** 길게 누른 글(답장·북마크·복사 창), 북마크 목록 창 */
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [showMarks, setShowMarks] = useState(false);

  // 다른 화면(앨범·타임라인)에서 '대화에서 보기'로 오면 그 글로 찾아가요.
  const handledJump = useRef<string | null>(null);
  useEffect(() => {
    if (!jump || handledJump.current === jump || !messages.length) return;
    handledJump.current = jump;
    const timer = setTimeout(() => jumpTo(Number(jump)), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, messages.length]);

  if (!room) {
    return (
      <View style={[styles.center, { backgroundColor: t.chatBg }]}>
        <Text style={{ color: t.chatTime }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  /** 봇들을 실제 확인 간격(봇 설정 ?? 방 설정)별로 묶기 */
  const roomEvery = roomInfo?.checkIntervalMin ?? 0;
  // 한 줄 안에서는 초록불 → 주황불 → 빨간불, 같은 불이면 가나다순
  const rank = (m: Member) => (!m.active ? 2 : m.exhausted ? 1 : 0);
  const sorted = [...members].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko'));
  const groups = [...new Set(sorted.map((m) => m.checkIntervalMin ?? roomEvery))]
    .sort((a, b) => a - b)
    .map((min) => [min, sorted.filter((m) => (m.checkIntervalMin ?? roomEvery) === min)] as const);
  const people = 1 + guests.length;
  /** 참가 중인데 지금 연결이 안 된 봇 수 */
  const away = members.filter((m) => m.active && !m.exhausted && m.joined && !m.online).length;
  const openSettings = () => room && router.push({ pathname: '/room/[id]/settings', params: { id: room.id } });
  const openMembers = () => router.push({ pathname: '/room/[id]/members', params: { id: room.id } });
  /** 버튼 동작은 화면을 먼저 바꾸고(바로 반응), 실패하면 되돌린 뒤 이유를 보여줘요. */
  const run = (p: Promise<string | null>) => {
    setSendError(null);
    p.then((err) => err && setSendError(err));
  };

  const send = async () => {
    const body = text.trim();
    if (!body && !photo) return;
    // 개인정보처럼 보이면 한 번 물어봐요(봇들과 초대한 사람도 읽어서).
    if (body && !(await confirmPrivate(body))) return;
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

  const openMenu = () => {
    setMenuOpen(true);
    // 메뉴를 열 때마다 게시판 목록을 새로 받아요(이름 바꾼 게 바로 보이게)
    api.boards(settings, room).then((r) => setBoardList(r.boards)).catch(() => {});
  };

  const hidden = Math.max(0, messages.length - showCount);
  const rows = toRows(hidden ? messages.slice(hidden) : messages);


  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const nameOf = (m: ChatMessage) => (m.authorId === OWNER_ID ? settings.userName : (memberById[m.authorId]?.name ?? m.authorName));
  const canSend = !!text.trim() || !!photo;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.chatBg, paddingBottom: kbPad }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        curH.current = h;
        if (kbPad === 0 && !Keyboard.isVisible()) baseH.current = h;
      }}
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
            <View style={{ paddingRight: 8, flexDirection: 'row' }}>
              <HeaderIcon name="search" label="메시지 검색" onPress={() => setSearching(true)} />
              <HeaderIcon name="menu" label="메뉴" onPress={openMenu} />
            </View>
          ),
        }}
      />

      {/* 봇이 많아도 한눈에 보이게: 옆으로 밀지 않고 여러 줄로 작게 보여줘요(너무 많으면 이 칸만 위아래로 밀어요). */}
      <View style={styles.memberBar}>
        {/* 누르면 참여자 목록을 접었다 폈다 해요 */}
        <Pressable onPress={toggleMembers} hitSlop={6} style={styles.summaryRow} accessibilityLabel={membersFolded ? '참여자 목록 펴기' : '참여자 목록 접기'}>
          <Text style={[styles.memberSummary, { color: t.chatTime, flex: 1 }]} numberOfLines={1}>
            사람 {people}명 · 봇 {members.length}명 (대화 중 {members.filter((m) => m.active && !m.exhausted && m.online).length}
            {members.some((m) => m.active && m.exhausted) ? ` · 소진 ${members.filter((m) => m.active && m.exhausted).length}` : ''} · 쉬는 중{' '}
            {members.filter((m) => !m.active).length})
          </Text>
          <Text style={{ color: t.accent, fontSize: 11, fontWeight: '700' }}>{membersFolded ? '펴기 ▾' : '접기 ▴'}</Text>
        </Pressable>
        {/* 확인 간격별로 줄을 나눠 보여줘요(실시간 → 긴 간격 순). 봇을 누르면 상태·간격을 바꿔요. */}
        {membersFolded ? null : (
        <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={{ gap: 4 }} showsVerticalScrollIndicator={false}>
          {/* 사람: 나(방장)와 초대한 사람 */}
          <View style={styles.groupRow}>
            <View style={[styles.groupTag, { backgroundColor: t.accentSoft }]}>
              <Text style={{ color: t.accentPurple, fontSize: 10, fontWeight: '800' }}>👤사람</Text>
            </View>
            <View style={[styles.memberWrap, { flex: 1 }]}>
              <View style={[styles.chip, { backgroundColor: t.chip }]}>
                <Text style={{ fontSize: 13 }}>👑</Text>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 11 }}>{settings.userName === '나' ? '나' : `${settings.userName} (나)`}</Text>
                <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              </View>
              {[...guests]
                .sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name, 'ko'))
                .map((g) => (
                  <Pressable key={g.id} onPress={openMembers} style={[styles.chip, { backgroundColor: t.chip }]}>
                    <Text style={{ fontSize: 13 }}>🙂</Text>
                    <Text style={{ color: t.text, fontWeight: '600', fontSize: 11 }}>{g.name}</Text>
                    <View style={[styles.dot, { backgroundColor: g.online ? '#22C55E' : '#C0C4CF' }]} />
                  </Pressable>
                ))}
            </View>
          </View>
          {groups.map(([min, list]) => (
            <View key={min} style={styles.groupRow}>
              <View style={[styles.groupTag, { backgroundColor: t.input }]}>
                <Text style={{ color: t.subtext, fontSize: 10, fontWeight: '800' }} numberOfLines={1}>
                  ⏱{intervalShort(min)}
                </Text>
              </View>
              <View style={[styles.memberWrap, { flex: 1 }]}>
                {list.map((m) => (
                  <MemberChip key={m.id} member={m} leader={m.id === roomInfo?.leaderId} onPress={() => setChipMenu(m.id)} />
                ))}
              </View>
            </View>
          ))}
          <Pressable onPress={openMembers} style={[styles.chip, { backgroundColor: t.accentSoft, alignSelf: 'flex-start' }]}>
            <Text style={{ color: t.accentPurple, fontWeight: '700', fontSize: 12, paddingHorizontal: 6 }}>＋ 초대</Text>
          </Pressable>
        </ScrollView>
        )}
      </View>

      {/* 방 공지: 한 줄로 고정, 누르면 펼쳐서 전체 보기 · 수정 */}
      {roomInfo?.notice ? <NoticeBar text={roomInfo.notice} at={roomInfo.noticeAt ?? 0} onEdit={() => setNoticeEdit(true)} /> : null}
      <NoticeEditor
        visible={noticeEdit}
        initial={roomInfo?.notice ?? ''}
        onClose={() => setNoticeEdit(false)}
        onSave={(text) => {
          setNoticeEdit(false);
          run(api.setBoard(settings, room, { notice: text || null }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)));
        }}
      />
      <LeaderPicker
        visible={leaderPick}
        members={members}
        leaderId={roomInfo?.leaderId ?? null}
        onClose={() => setLeaderPick(false)}
        onPick={(id) => {
          setLeaderPick(false);
          run(api.setBoard(settings, room, { leaderId: id }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)));
        }}
      />

      {roomInfo?.turnOrder ? (
        <TurnPanel
          order={roomInfo.turnOrder}
          current={roomInfo.turnCurrent ?? null}
          members={members}
          onNext={() => run(api.setTurn(settings, room, { turnNext: true }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)))}
          onEdit={() => setTurnEdit(true)}
          onEnd={() => run(api.setTurn(settings, room, { turnOrder: null }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)))}
        />
      ) : null}
      {turnEdit && (
        <TurnSetup
          visible
          members={members}
          initial={roomInfo?.turnOrder ?? []}
          current={roomInfo?.turnCurrent ?? null}
          onClose={() => setTurnEdit(false)}
          onStart={(order, start) => {
            setTurnEdit(false);
            run(api.setTurn(settings, room, { turnOrder: order, turnStart: start }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)));
          }}
        />
      )}

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
        // 오래된 글을 불러오면 한 번에 그려서, 찾아가기가 바로 되게 해요.
        maxToRenderPerBatch={300}
        updateCellsBatchingPeriod={10}
        extraData={[flashId, bookmarks, firstUnreadId]}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.35 }), 120);
        }}
        ListHeaderComponent={
          hidden > 0 || live.hasOlder ? (
            <Pressable
              onPress={() => {
                atBottom.current = false;
                if (hidden > 0) setShowCount((n) => n + PAGE);
                else live.loadOlder().then((got) => setShowCount((c) => c + got.length));
              }}
              style={[styles.morePill, { backgroundColor: t.card, borderColor: t.border }]}
            >
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>
                {hidden > 0 ? `이전 대화 더 보기 (${hidden}개)` : '이전 대화 불러오기'}
              </Text>
            </Pressable>
          ) : undefined
        }
        // 빈 방일 때만 안내를 가운데 두려고 늘려요(글이 있을 때 늘리면 짧은 대화에서 새 글이 와도 높이가 안 바뀌어 '새 메시지' 표시가 잘못 떠요).
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, flexGrow: rows.length ? 0 : 1 }}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          if (Date.now() < autoScrollUntil.current) return;
          if (Date.now() < jumpHold.current) {
            atBottom.current = false;
            if (!showDown) setShowDown(true);
            return;
          }
          const height = contentH.current || contentSize.height;
          const fromBottom = height - (contentOffset.y + layoutMeasurement.height);
          atBottom.current = fromBottom < 80;
          if (atBottom.current && room) saveReadMark(settings, room, lastRealId(messages));
          // 한 화면 넘게 올라가 있으면 '맨 아래로' 버튼
          const far = fromBottom > layoutMeasurement.height * 0.8;
          if (far !== showDown) setShowDown(far);
          if (atBottom.current && seenId !== lastRealId(messages)) setSeenId(lastRealId(messages));
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          // 새 메시지로 내용이 길어졌을 때: 맨 아래를 보고 있었으면 따라 내려가고, 위에서 읽는 중이면 그대로 둬요.
          if (Date.now() < jumpHold.current) return;
          if (forceBottom.current || atBottom.current) {
            const first = forceBottom.current;
            forceBottom.current = false;
            goBottom(false, !first);
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
          <View nativeID={`msg-${item.msg.id}`}>
          {item.msg.id === firstUnreadId ? (
            <View style={styles.readLine}>
              <View style={[styles.readRule, { backgroundColor: t.accent }]} />
              <Text style={{ color: t.accent, fontSize: 12, fontWeight: '800' }}>📍 여기까지 읽었어요</Text>
              <View style={[styles.readRule, { backgroundColor: t.accent }]} />
            </View>
          ) : null}
          <MessageRow
            row={item}
            member={memberById[item.msg.authorId]}
            quoted={item.msg.replyTo ? messageById.get(item.msg.replyTo) : undefined}
            quotedName={nameOf}
            t={t}
            onProfile={openMembers}
            onReply={() => setActionMsg(item.msg)}
            marked={bookmarks.some((b) => b.id === item.msg.id)}
            onImage={setViewing}
            onQuote={item.msg.replyTo ? () => jumpTo(item.msg.replyTo!) : undefined}
            flash={flashId === item.msg.id}
          />
          </View>
        )}
      />
      {showDown && unread === 0 && (
        <Pressable
          onPress={() => {
            jumpHold.current = 0;
            setShowDown(false);
            goBottom(true);
          }}
          style={[styles.downBtn, { backgroundColor: t.card, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}
          accessibilityLabel="맨 아래로"
        >
          <Ionicons name="arrow-down" size={22} color={t.accent} />
        </Pressable>
      )}
      {unread > 0 && (
        <Pressable
          onPress={() => {
            jumpHold.current = 0;
            setShowDown(false);
            goBottom(true);
          }}
          style={[styles.newPill, { backgroundColor: t.accent }]}
          accessibilityLabel="새 메시지 보기"
        >
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
              {roomInfo?.quietNow ? '🌙 매너타임' : `⏱ ${scheduleLabel(roomInfo?.checkIntervalMin ?? 0)}${roomInfo?.waitMode === 'away' && (roomInfo?.checkIntervalMin ?? 0) > 0 ? ' · 쉬었다 오기' : ''}`}
            </Text>
          </Pressable>
        </Pressable>
      )}

      <MessageActions
        msg={actionMsg}
        marked={!!actionMsg && bookmarks.some((b) => b.id === actionMsg.id)}
        onClose={() => setActionMsg(null)}
        onReply={() => actionMsg && setReplyTo(actionMsg)}
        onBookmark={() => {
          if (!actionMsg) return;
          const was = bookmarks.some((b) => b.id === actionMsg.id);
          toggleBookmark(settings, room, bookmarks, actionMsg).then((list) => {
            setBookmarks(list);
            setSendError(was ? '북마크를 해제했어요.' : '🔖 북마크했어요. ☰ → 북마크에서 다시 볼 수 있어요.');
          });
        }}
        onCopy={() => {
          if (actionMsg?.text) Clipboard.setStringAsync(actionMsg.text).then(() => setSendError('글을 복사했어요.')).catch(() => {});
        }}
      />
      <BookmarkSheet
        visible={showMarks}
        list={bookmarks}
        onClose={() => setShowMarks(false)}
        onPick={jumpTo}
        onRemove={(b) => toggleBookmark(settings, room, bookmarks, { id: b.id, authorName: b.authorName, text: b.text, createdAt: b.createdAt, image: null }).then(setBookmarks)}
      />
      <SearchSheet visible={searching} settings={settings} room={room} onClose={() => setSearching(false)} onPick={jumpTo} />

      <BotStateSheet
        member={members.find((m) => m.id === chipMenu) ?? null}
        onClose={() => setChipMenu(null)}
        onProfile={openMembers}
        // 쉬게 하기는 소진 표시를 그대로 둬요(그래야 '사용량이 다시 찼어요'라고 잘못 알리지 않아요).
        onPick={(m, state) => run(live.setMemberState(m, { active: state !== 'off', exhausted: state === 'off' ? !!m.exhausted : state === 'exhausted' }))}
        roomInterval={roomInfo?.checkIntervalMin ?? 0}
        onInterval={(m, v) => run(live.setMemberInterval(m, v))}
        leader={!!chipMenu && chipMenu === roomInfo?.leaderId}
        onLeader={(m, on) => run(api.setBoard(settings, room, { leaderId: on ? m.id : null }).then(() => live.refreshMembers()).then(() => null).catch((e) => String(e.message ?? e)))}
      />

      <RoomMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { icon: 'people-outline', label: '멤버 · 초대 · 프로필', onPress: openMembers },
          { icon: 'notifications-outline', label: '확인 간격 · 매너타임 · 알림', onPress: openSettings },
          { icon: 'megaphone-outline', label: roomInfo?.notice ? '공지 수정 · 내리기' : '공지 쓰기', onPress: () => setNoticeEdit(true) },
          {
            icon: 'ribbon-outline',
            label: `봇 대장 정하기${roomInfo?.leaderId ? ` (지금: ${members.find((m) => m.id === roomInfo.leaderId)?.name ?? '?'})` : ''}`,
            onPress: () => setLeaderPick(true),
          },
          { icon: 'clipboard-outline', label: '게시판 (추가 · 이름 바꾸기)', onPress: () => router.push({ pathname: '/room/[id]/boards', params: { id: room.id } }) },
          ...boardList.map((b) => ({
            icon: 'document-text-outline' as const,
            label: `${b.name}${b.count ? ` (${b.count})` : ''}`,
            sub: true,
            onPress: () => router.push({ pathname: '/room/[id]/board/[bid]', params: { id: room.id, bid: b.id } }),
          })),
          { icon: 'repeat-outline', label: roomInfo?.turnOrder ? '순서 바꾸기' : '순서 정해서 대화', onPress: () => setTurnEdit(true) },
          { icon: 'bookmark-outline', label: `북마크 (${bookmarks.length})`, onPress: () => setShowMarks(true) },
          { icon: 'images-outline', label: '사진 앨범', onPress: () => router.push({ pathname: '/room/[id]/album', params: { id: room.id } }) },
          { icon: 'calendar-outline', label: '타임라인 (달력)', onPress: () => router.push({ pathname: '/room/[id]/timeline', params: { id: room.id } }) },
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

      <View style={[styles.inputBar, { backgroundColor: t.card, paddingBottom: kbPad > 0 ? 6 : Math.max(insets.bottom, 6) }]}>
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
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                if (!viewing) return;
                saveImage(viewing, `dabot-${room.name}-${Date.now()}`)
                  .then((msg) => setSendError(msg))
                  .catch((e) => setSendError(e instanceof Error ? e.message : String(e)));
                setViewing(null);
              }}
              style={[styles.viewerBtn, { backgroundColor: t.accent }]}
            >
              <Text style={{ color: t.accentText, fontWeight: '700' }}>⬇ 저장</Text>
            </Pressable>
            <Pressable onPress={() => setViewing(null)} style={[styles.viewerBtn, { borderColor: '#fff', borderWidth: 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>닫기</Text>
            </Pressable>
          </View>
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
function MemberChip({ member, leader, onPress }: { member: Member; leader?: boolean; onPress: () => void }) {
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
      {leader ? <Text style={{ fontSize: 11 }}>🎖️</Text> : null}
      <Text style={{ color: member.active && !member.exhausted ? t.text : t.subtext, fontWeight: '600', fontSize: 11 }} numberOfLines={1}>
        {member.name}
      </Text>
      {talking ? <BlinkDot /> : <View style={[styles.dot, { backgroundColor: color }]} />}
    </Pressable>
  );
}

/** 답장한 원래 글을 말풍선 위에 작게 보여줘요. */
function Quote({ m, name, mine, t, onPress }: { m?: ChatMessage; name: (m: ChatMessage) => string; mine: boolean; t: Theme; onPress?: () => void }) {
  if (!m) {
    // 원문을 아직 안 불러왔어도 누르면 찾아가요.
    return onPress ? (
      <Pressable onPress={onPress} style={[styles.quote, { borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : t.accentPurple }]}>
        <Text style={{ color: mine ? 'rgba(255,255,255,0.9)' : t.accentPurple, fontSize: 11, fontWeight: '700' }}>↪ 이전 글에 답장 (눌러서 보기)</Text>
      </Pressable>
    ) : null;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityHint="누르면 원래 글로 가요"
      style={[styles.quote, { borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : t.accentPurple }]}
    >
      <Text style={{ color: mine ? 'rgba(255,255,255,0.9)' : t.accentPurple, fontSize: 11, fontWeight: '700' }}>↪ {name(m)}</Text>
      <Text style={{ color: mine ? 'rgba(255,255,255,0.85)' : t.subtext, fontSize: 12 }} numberOfLines={2}>
        {m.image && !m.text ? '[사진]' : m.text}
      </Text>
    </Pressable>
  );
}

/** 채팅 사진. 깨진 사진(보내다 잘린 것 등)은 안내 글로 바꿔 보여줘요. */
function Photo({ uri, mine, t, onOpen, onReply }: { uri: string; mine: boolean; t: Theme; onOpen: () => void; onReply: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <View style={[styles.brokenPhoto, { borderColor: mine ? 'rgba(255,255,255,0.5)' : t.border }]}>
        <Text style={{ color: mine ? 'rgba(255,255,255,0.9)' : t.subtext, fontSize: 12 }}>🖼️ 사진이 깨졌어요 (보내다 잘린 것 같아요)</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onOpen} onLongPress={onReply} delayLongPress={350}>
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" onError={() => setBroken(true)} />
    </Pressable>
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
  onQuote,
  flash,
  marked,
}: {
  msg: ChatMessage;
  mine: boolean;
  first: boolean;
  quoted?: ChatMessage;
  quotedName: (m: ChatMessage) => string;
  t: Theme;
  onReply: () => void;
  onImage: (uri: string) => void;
  onQuote?: () => void;
  flash?: boolean;
  marked?: boolean;
}) {
  return (
    <Pressable
      onLongPress={onReply}
      delayLongPress={350}
      accessibilityHint="길게 누르면 답장·북마크·복사"
      style={[
        styles.bubble,
        { backgroundColor: mine ? t.myBubble : t.botBubble, opacity: msg.pending ? 0.6 : 1 },
        flash && { borderWidth: 3, borderColor: '#F59E0B' },
        first && (mine ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }),
      ]}
    >
      {marked ? <Text style={styles.markTag}>🔖</Text> : null}
      <Quote m={quoted} name={quotedName} mine={mine} t={t} onPress={onQuote} />
      {msg.image ? <Photo uri={msg.image} mine={mine} t={t} onOpen={() => onImage(msg.image!)} onReply={onReply} /> : null}
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
  onQuote,
  flash,
  marked,
}: {
  row: Row;
  member?: Member;
  quoted?: ChatMessage;
  quotedName: (m: ChatMessage) => string;
  t: Theme;
  onProfile: () => void;
  onReply: () => void;
  onImage: (uri: string) => void;
  onQuote?: () => void;
  flash?: boolean;
  marked?: boolean;
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
    <Bubble msg={msg} mine={mine} first={row.showProfile} quoted={quoted} quotedName={quotedName} t={t} onReply={onReply} onImage={onImage} onQuote={onQuote} flash={flash} marked={marked} />
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

  // 초대받은 사람(손님)은 사람 모양으로
  const look = msg.authorId.startsWith('guest:') ? { emoji: '🙂', color: '#8FC1FF' } : lookOf(member?.kind ?? 'other', member?.avatar);
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
  brokenPhoto: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 14, marginBottom: 4 },
  viewerBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  downBtn: { position: 'absolute', right: 14, bottom: 14, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  markTag: { position: 'absolute', top: -8, right: -6, fontSize: 14 },
  readLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, paddingHorizontal: 6 },
  readRule: { flex: 1, height: 1.5, opacity: 0.5 },
  morePill: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  schedPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  memberSummary: { fontSize: 11, marginLeft: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 2 },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  groupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  groupTag: { width: 50, alignItems: 'center', paddingVertical: 4, borderRadius: 8, marginTop: 1 },
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
