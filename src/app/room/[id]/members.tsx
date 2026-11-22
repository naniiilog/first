import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AiPicker } from '../../../components/AiPicker';
import { AvatarEditor } from '../../../components/AvatarEditor';
import { Avatar, Button, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { aiOf, connectionText, KICKOFF_PROMPT, rejoinText, type AiKind } from '../../../lib/ais';
import { lookOf } from '../../../lib/avatar';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import type { LocalRoom, Member, Settings } from '../../../lib/types';

/** 멤버마다 아래에 펼치는 칸: 프로필 편집 또는 초대 링크 */
type Panel = { id: string; kind: 'profile' | 'link' } | null;

/** 누르면 색이 바뀌는 작은 버튼. 열려 있는 칸이면 진하게 보여줘요. */
function ActionPill({
  label,
  icon,
  active,
  danger,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const color = danger ? t.danger : t.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: active || pressed ? color : t.border,
          backgroundColor: active ? color : pressed ? (danger ? '#FDECEC' : t.accentSoft) : t.card,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : color} />
      <Text style={{ color: active ? '#FFFFFF' : color, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useStore();
  // 멤버 화면에서는 메시지를 확인할 필요가 없어서 멤버만 받아와요(더 빨라요).
  const { room, members, membersLoaded, setMembers, refreshMembers, error, toggleMember } = useLiveRoom(id, { messages: false });
  const t = useTheme();
  const [kind, setKind] = useState<AiKind | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** 방금 '다시 부르기'를 누른 봇과 안내 */
  const [called, setCalled] = useState<{ id: string; note: string } | null>(null);

  if (!room) return null;

  /**
   * 다시 부르기: 다른 앱에 메시지를 대신 보낼 수는 없어서,
   * 부르는 말을 복사하고 그 AI 앱을 열어줘요(문구를 미리 넣어 주는 앱은 입력칸에 들어가 있어요).
   * 웹에서 새 창이 막히지 않게 복사와 열기를 같은 순간에 시작해요.
   */
  const callBack = (m: Member) => {
    const ai = aiOf(m.kind);
    const text = rejoinText(m.name);
    const copied = Clipboard.setStringAsync(text).catch(() => false);
    if (ai.appLink) {
      Linking.openURL(ai.appLink(text)).catch(() => {});
      setCalled({
        id: m.id,
        note: `부르는 말을 복사하고 ${ai.name}을(를) 열었어요. 입력칸에 문구가 없으면 붙여넣고 보내 주세요. (그 앱의 새 대화에서 다봇 커넥터가 꺼져 있으면 켜 주세요)`,
      });
    } else {
      setCalled({ id: m.id, note: `부르는 말을 복사했어요. ${ai.name} 앱을 열어서 붙여넣고 보내 주세요.` });
    }
    copied.then((ok) => {
      if (ok === false) setCalled({ id: m.id, note: `복사가 안 됐어요. 그 앱에 이렇게 보내 주세요:\n${text}` });
    });
  };

  const toggle = (memberId: string, kind: 'profile' | 'link') => {
    setConfirmRemove(null);
    setPanel((p) => (p?.id === memberId && p.kind === kind ? null : { id: memberId, kind }));
  };

  const invite = async () => {
    if (!kind || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.invite(settings, room, kind.id, name.trim(), kind.name);
      // 새 멤버를 목록에 바로 넣고, 그 아래에 초대 링크를 펼쳐요.
      setMembers((list) => [...list, { ...res.member, inviteUrl: res.inviteUrl }]);
      setPanel({ id: res.member.id, kind: 'link' });
      setKind(null);
      setName('');
      refreshMembers();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    if (confirmRemove !== m.id) {
      setConfirmRemove(m.id);
      return;
    }
    setConfirmRemove(null);
    setPanel(null);
    const before = members;
    setMembers((list) => list.filter((x) => x.id !== m.id));
    try {
      await api.removeMember(settings, room, m.id);
      refreshMembers();
    } catch (e) {
      setMembers(before);
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${room.name} 멤버` }} />
      {error || actionError ? <Text style={{ color: t.danger }}>⚠️ {actionError ?? error}</Text> : null}

      <Section title={membersLoaded ? `멤버 (${members.length})` : '멤버'}>
        {!membersLoaded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <ActivityIndicator color={t.accent} />
            <Text style={{ color: t.subtext }}>멤버를 불러오는 중…</Text>
          </View>
        ) : members.length === 0 ? (
          <Text style={{ color: t.subtext }}>아직 초대한 에이전트가 없어요. 아래에서 초대해 보세요.</Text>
        ) : (
          members.map((m) => {
            const ai = aiOf(m.kind);
            const open = panel?.id === m.id ? panel.kind : null;
            return (
              <View key={m.id} style={{ gap: 8 }}>
                <View style={[styles.row, { backgroundColor: t.card, borderColor: open ? t.accent : t.border }]}>
                  <Pressable onPress={() => toggle(m.id, 'profile')} accessibilityLabel={`${m.name} 프로필 바꾸기`}>
                    <Avatar bot={lookOf(m.kind, m.avatar)} size={46} dim={!m.active} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{m.name}</Text>
                    <Text style={{ color: t.subtext, fontSize: 12 }}>
                      {ai.name} · {m.joined ? '들어옴' : '아직 안 들어옴'} · {!m.active ? '쉬는 중' : m.online ? '🟢 대화 중' : '참가 중'}
                    </Text>
                    <View style={styles.pills}>
                      <ActionPill label="프로필" icon="person-circle-outline" active={open === 'profile'} onPress={() => toggle(m.id, 'profile')} />
                      <ActionPill label="초대 링크" icon="link-outline" active={open === 'link'} onPress={() => toggle(m.id, 'link')} />
                      {m.active && !m.online && <ActionPill label="다시 부르기" icon="refresh-outline" onPress={() => callBack(m)} />}
                      <ActionPill
                        label={confirmRemove === m.id ? '한 번 더 누르면 내보내요' : '내보내기'}
                        icon="exit-outline"
                        danger
                        active={confirmRemove === m.id}
                        onPress={() => remove(m)}
                      />
                    </View>
                  </View>
                  <Switch
                    value={m.active}
                    // 스위치는 바로 바뀌고 서버는 뒤에서 따라와요(실패하면 되돌려요).
                    onValueChange={() => {
                      toggleMember(m).then((err) => {
                        if (err) setActionError(err);
                      });
                    }}
                    trackColor={{ true: ai.color }}
                  />
                </View>
                {open === 'profile' && (
                  <AvatarEditor
                    kind={m.kind}
                    avatar={m.avatar}
                    onClose={() => setPanel(null)}
                    onSave={async (avatar) => {
                      await api.updateMember(settings, room, m.id, { avatar });
                      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, avatar } : x)));
                      refreshMembers();
                    }}
                  />
                )}
                {called?.id === m.id && (
                  <View style={[styles.calledNote, { backgroundColor: t.accentSoft }]}>
                    <Text style={{ color: t.text, fontSize: 13, lineHeight: 19 }}>{called.note}</Text>
                  </View>
                )}
                {open === 'link' && <InviteLinkCard member={m} roomSettings={{ settings, room }} onClose={() => setPanel(null)} />}
              </View>
            );
          })
        )}
      </Section>

      <Section title="AI 에이전트 초대하기">
        <AiPicker selected={kind?.id} onPick={(ai) => setKind((k) => (k?.id === ai.id ? null : ai))} />
        {kind && (
          <View style={[styles.inviteRow, { backgroundColor: t.card, borderColor: kind.color }]}>
            <Avatar bot={kind} size={36} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={`이름 지어주기 (기본: ${kind.name})`}
              placeholderTextColor={t.subtext}
              style={[styles.nameInput, { flex: 1, color: t.text, borderColor: t.border }]}
              onSubmitEditing={invite}
              maxLength={30}
            />
            <Pressable
              onPress={invite}
              disabled={busy}
              style={({ pressed }) => [styles.smallBtn, { backgroundColor: t.accent, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
            >
              {busy ? <ActivityIndicator color={t.accentText} /> : <Text style={{ color: t.accentText, fontWeight: '700' }}>초대 링크 만들기</Text>}
            </Pressable>
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

function InviteLinkCard({
  member,
  roomSettings,
  onClose,
}: {
  member: Member;
  roomSettings: { settings: Settings; room: LocalRoom };
  onClose: () => void;
}) {
  const t = useTheme();
  const ai = aiOf(member.kind);
  const [copied, setCopied] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(member.inviteUrl ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 목록에 링크가 없을 때만(옛 서버 등) 따로 받아와요.
  useEffect(() => {
    if (url) return;
    let alive = true;
    api
      .inviteUrl(roomSettings.settings, roomSettings.room, member.id)
      .then((r) => alive && setUrl(r.inviteUrl))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [url, member.id, roomSettings.settings, roomSettings.room]);
  const copy = async (what: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  };
  if (!url) {
    return (
      <View style={[styles.card, { backgroundColor: t.card, borderColor: ai.color, flexDirection: 'row', alignItems: 'center' }]}>
        {loadError ? <Text style={{ color: t.danger }}>⚠️ {loadError}</Text> : <ActivityIndicator color={t.accent} />}
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: ai.color }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar bot={ai} size={32} />
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{member.name} 초대 링크</Text>
        <Text onPress={onClose} style={{ color: t.subtext, fontSize: 18 }}>
          ✕
        </Text>
      </View>
      <Text selectable style={[styles.url, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}>
        {url}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={copied === 'url' ? '복사됨 ✓' : '링크 복사'} onPress={() => copy('url', url)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="공유" variant="secondary" onPress={() => Share.share({ message: url }).catch(() => {})} />
        </View>
      </View>
      <Text style={{ color: t.text, fontWeight: '700' }}>① {ai.name}에 링크 넣기</Text>
      <Text style={{ color: t.subtext, lineHeight: 20 }}>{ai.howTo}</Text>
      <Text style={{ color: t.text, fontWeight: '700' }}>② 이렇게 말해서 들여보내기</Text>
      <Text selectable style={{ color: t.subtext, lineHeight: 20 }}>
        “{KICKOFF_PROMPT}”
      </Text>
      <Button title={copied === 'prompt' ? '복사됨 ✓' : '이 말 복사'} variant="secondary" onPress={() => copy('prompt', KICKOFF_PROMPT)} />
      <View style={[styles.divider, { backgroundColor: t.border }]} />
      <Text style={{ color: t.text, fontWeight: '700' }}>커넥터가 없는 에이전트라면</Text>
      <Text style={{ color: t.subtext, lineHeight: 20 }}>
        이 연결 문구를 통째로 복사해서 그 에이전트에게 보내 주세요. 인터넷 요청만 할 수 있으면 들어올 수 있어요.
      </Text>
      <Button
        title={copied === 'text' ? '복사됨 ✓' : '연결 문구 복사'}
        variant="secondary"
        onPress={() => copy('text', connectionText(url, member.name))}
      />
      <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
        링크를 가진 사람은 누구나 이 이름으로 말할 수 있어요. 믿는 곳에만 넣어주세요. 문제가 생기면 내보내기로 링크를 없앨 수 있어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 2, flexWrap: 'wrap' },
  nameInput: { borderBottomWidth: 1, paddingVertical: 6, fontSize: 16, minWidth: 140 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  calledNote: { borderRadius: 12, padding: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  card: { padding: 14, gap: 10, borderRadius: 16, borderWidth: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  url: { padding: 10, borderRadius: 10, borderWidth: 1, fontSize: 13 },
});
