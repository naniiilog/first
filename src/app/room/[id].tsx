import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Chip } from '../../components/ui';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import { USER_ID, type ChatMessage } from '../../lib/types';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const room = store.rooms.find((r) => r.id === id);
  const activity = (id && store.activity[id]) || { running: false, typingBotId: null };
  const [text, setText] = useState('');
  const [debateOpen, setDebateOpen] = useState(false);
  const [rounds, setRounds] = useState(2);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const messageCount = room?.messages.length ?? 0;
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messageCount, activity.typingBotId]);

  if (!room) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.subtext }}>채팅방을 찾을 수 없어요.</Text>
      </View>
    );
  }

  const members = room.botIds.map((b) => store.botsById[b]).filter(Boolean);
  const typingBot = activity.typingBotId ? store.botsById[activity.typingBotId] : null;

  const send = () => {
    if (!text.trim() || activity.running) return;
    const message = text;
    setText('');
    if (debateOpen) {
      setDebateOpen(false);
      store.runDebate(room.id, rounds, message);
    } else {
      store.sendMessage(room.id, message);
    }
  };

  const startDebate = () => {
    if (activity.running) return;
    setDebateOpen(false);
    const topic = text;
    setText('');
    store.runDebate(room.id, rounds, topic);
  };

  const openMenu = () => {
    const clear = () => store.clearRoom(room.id);
    const remove = () => {
      store.deleteRoom(room.id);
      router.back();
    };
    if (Platform.OS === 'web') {
      // 웹 미리보기에서는 Alert 버튼이 없어 바로 대화만 지웁니다.
      clear();
      return;
    }
    Alert.alert(room.name, undefined, [
      { text: '대화 내용 지우기', onPress: clear },
      { text: '채팅방 나가기(삭제)', style: 'destructive', onPress: remove },
      { text: '취소', style: 'cancel' },
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

      <View style={[styles.members, { backgroundColor: t.card, borderColor: t.border }]}>
        {members.map((b) => (
          <View key={b.id} style={styles.member}>
            <Avatar bot={b} size={28} />
            <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>{b.name}</Text>
          </View>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={room.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: t.subtext, textAlign: 'center', lineHeight: 22 }}>
              메시지를 보내면 봇들이 차례로 답해요.{'\n'}🗣️ 버튼을 누르면 봇들끼리 토론해요.
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListFooterComponent={
          typingBot ? (
            <View style={[styles.typing]}>
              <Avatar bot={typingBot} size={28} />
              <Text style={{ color: t.subtext }}>{typingBot.name}이(가) 입력 중</Text>
              <ActivityIndicator size="small" color={typingBot.color} />
            </View>
          ) : undefined
        }
      />

      {debateOpen && (
        <View style={[styles.debatePanel, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '700' }}>🗣️ 봇끼리 자동 토론</Text>
          <Text style={{ color: t.subtext, fontSize: 13 }}>
            아래 입력창에 주제를 쓰고 시작하세요. 비워두면 지금까지의 대화를 이어서 토론해요.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ color: t.subtext }}>라운드</Text>
            {[1, 2, 3, 5].map((n) => (
              <Chip key={n} label={`${n}`} selected={rounds === n} onPress={() => setRounds(n)} />
            ))}
          </View>
          <Pressable onPress={startDebate} style={[styles.startBtn, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '700' }}>
              토론 시작 (총 {rounds * members.length}마디)
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.inputBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          onPress={() => setDebateOpen((o) => !o)}
          disabled={activity.running}
          style={[styles.iconBtn, { backgroundColor: debateOpen ? t.accent + '33' : 'transparent', opacity: activity.running ? 0.4 : 1 }]}
        >
          <Text style={{ fontSize: 20 }}>🗣️</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={debateOpen ? '토론 주제 (선택)' : '메시지 보내기'}
          placeholderTextColor={t.subtext}
          multiline
          style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          blurOnSubmit={Platform.OS === 'web'}
        />
        {activity.running ? (
          <Pressable onPress={() => store.stop(room.id)} style={[styles.sendBtn, { backgroundColor: t.danger }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>중지</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={debateOpen ? startDebate : send}
            disabled={!debateOpen && !text.trim()}
            style={[styles.sendBtn, { backgroundColor: t.accent, opacity: !debateOpen && !text.trim() ? 0.4 : 1 }]}
          >
            <Text style={{ color: t.accentText, fontWeight: '700' }}>{debateOpen ? '시작' : '전송'}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { botsById, userName } = useStore();
  const t = useTheme();
  if (message.authorId === USER_ID) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.bubble, { backgroundColor: t.myBubble, borderTopRightRadius: 4 }]}>
          <Text style={{ color: t.myBubbleText, fontSize: 15, lineHeight: 21 }}>{message.text}</Text>
        </View>
        <Text style={{ color: t.subtext, fontSize: 11, marginTop: 2 }}>{userName}</Text>
      </View>
    );
  }
  const bot = botsById[message.authorId] ?? { name: '(삭제된 봇)', emoji: '👻', color: '#999999' };
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Avatar bot={bot} size={34} />
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Text style={{ color: bot.color, fontSize: 13, fontWeight: '700', marginBottom: 3 }}>{bot.name}</Text>
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
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  member: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  debatePanel: { marginHorizontal: 12, marginBottom: 8, padding: 14, gap: 10, borderRadius: 14, borderWidth: 1 },
  startBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  sendBtn: { height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
