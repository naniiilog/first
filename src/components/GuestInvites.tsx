import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, type Guest } from '../lib/api';
import { useTheme } from '../lib/theme';
import type { LocalRoom, Settings } from '../lib/types';
import { Section } from './ui';

/** 사람 초대: 링크를 받은 사람이 이 방 대화를 보거나(보기만) 같이 써요(참가). */
export function GuestInvites({ settings, room }: { settings: Settings; room: LocalRoom }) {
  const t = useTheme();
  const [list, setList] = useState<Guest[] | null>(null);
  const [name, setName] = useState('');
  const [canPost, setCanPost] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.guests(settings, room)).guests);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }, [settings, room]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const copy = async (g: Guest) => {
    // 초대받은 사람에게 보낼 안내 문구(링크 포함)
    const text = [
      `[다봇] ${g.name} 님, "${room.name}" 방에 초대했어요! 🤖💬`,
      '',
      '다봇은 여러 AI 봇과 사람이 한 방에서 같이 수다 떠는 단체 채팅방이에요.',
      '',
      '👉 들어오는 법',
      '아래 링크를 누르면 인터넷 창에서 바로 열려요. 앱 설치·가입·비밀번호 모두 필요 없어요.',
      g.url,
      '',
      g.canPost
        ? [
            '💬 대화하는 법',
            '· 아래 입력창에 쓰고 [전송]을 누르면 돼요.',
            '· 봇한테 말을 걸 땐 이름을 넣어 불러 주세요. (예: "OO야, 이거 어때?")',
            '· 봇은 확인하는 간격이 있어서 답이 조금 늦게 올 수 있어요.',
          ].join('\n')
        : '👀 이 초대는 "보기만" 할 수 있어요. 대화를 구경할 수 있고, 글은 못 써요.',
      '',
      '📌 알아 두세요',
      '· 이 링크로는 이 방 하나만 보여요.',
      '· 링크는 나만 쓰고 다른 사람에게 넘기지 말아 주세요.',
      '· 비밀번호나 개인정보는 방에 쓰지 마세요. 봇들도 같이 읽어요.',
    ].join('\n');
    try {
      await Clipboard.setStringAsync(text);
      setNote(`${g.name} 님 초대 안내(링크 포함)를 복사했어요. 카톡 등에 붙여넣어 보내 주세요.`);
    } catch {
      Share.share({ message: text }).catch(() => {});
    }
  };

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const { guest } = await api.addGuest(settings, room, name.trim(), canPost);
      setName('');
      await load();
      await copy(guest);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: Guest) => {
    if (confirm !== g.id) return setConfirm(g.id);
    setConfirm(null);
    try {
      await api.removeGuest(settings, room, g.id);
      await load();
      setNote(`${g.name} 님의 초대를 거뒀어요. 그 링크는 이제 안 열려요.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Section title="사람 초대">
      <Text style={{ color: t.subtext, fontSize: 13, lineHeight: 19 }}>
        링크를 받은 사람은 앱 비밀번호 없이 이 방에만 들어와요. 다른 방·설정·초대 링크는 못 봐요.
      </Text>
      <View style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="초대할 사람 이름"
          placeholderTextColor={t.subtext}
          maxLength={30}
          onSubmitEditing={add}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />
        <Pressable onPress={add} disabled={busy} style={[styles.btn, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
          <Text style={{ color: t.accentText, fontWeight: '700' }}>링크 만들기</Text>
        </Pressable>
      </View>
      <View style={styles.toggle}>
        <Switch value={canPost} onValueChange={setCanPost} />
        <Text style={{ color: t.text, fontSize: 13 }}>{canPost ? '같이 대화하기 (글쓰기 가능)' : '보기만 하기'}</Text>
      </View>

      {list === null ? <ActivityIndicator color={t.accent} /> : null}
      {list?.map((g) => (
        <View key={g.id} style={[styles.guest, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>👤 {g.name}</Text>
            <Text style={{ color: t.subtext, fontSize: 12 }}>
              {g.canPost ? '같이 대화' : '보기만'} · {g.joined ? '들어온 적 있음' : '아직 안 들어옴'}
            </Text>
          </View>
          <Pressable onPress={() => copy(g)} style={[styles.small, { borderColor: t.accent }]}>
            <Text style={{ color: t.accent, fontWeight: '700', fontSize: 12 }}>링크 복사</Text>
          </Pressable>
          <Pressable onPress={() => remove(g)} style={[styles.small, { borderColor: t.danger }]}>
            <Text style={{ color: t.danger, fontWeight: '700', fontSize: 12 }}>{confirm === g.id ? '한 번 더' : '거두기'}</Text>
          </Pressable>
        </View>
      ))}
      {note ? <Text style={{ color: t.subtext, fontSize: 13 }}>{note}</Text> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guest: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  small: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
