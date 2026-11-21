import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AiPicker } from '../../../components/AiPicker';
import { AvatarEditor } from '../../../components/AvatarEditor';
import { Avatar, Button, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { aiOf, KICKOFF_PROMPT, type AiKind } from '../../../lib/ais';
import { lookOf } from '../../../lib/avatar';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import type { Member } from '../../../lib/types';

interface InviteCard {
  member: Member;
  url: string;
}

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useStore();
  const { room, members, refreshMembers, error } = useLiveRoom(id);
  const t = useTheme();
  const [kind, setKind] = useState<AiKind | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<InviteCard | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!room) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refreshMembers();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const invite = () =>
    kind &&
    run(async () => {
      setBusy(true);
      try {
        const res = await api.invite(settings, room, kind.id, name.trim(), kind.name);
        setCard({ member: res.member, url: res.inviteUrl });
        setKind(null);
        setName('');
      } finally {
        setBusy(false);
      }
    });

  const showLink = (m: Member) =>
    run(async () => {
      const res = await api.inviteUrl(settings, room, m.id);
      setCard({ member: m, url: res.inviteUrl });
    });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${room.name} 멤버` }} />
      {error || actionError ? <Text style={{ color: t.danger }}>⚠️ {actionError ?? error}</Text> : null}

      {card && <InviteLinkCard card={card} onClose={() => setCard(null)} />}

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
            <Pressable onPress={invite} disabled={busy} style={[styles.smallBtn, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
              <Text style={{ color: t.accentText, fontWeight: '700' }}>초대 링크 만들기</Text>
            </Pressable>
          </View>
        )}
      </Section>

      <Section title={`멤버 (${members.length})`}>
        {members.length === 0 ? (
          <Text style={{ color: t.subtext }}>아직 초대한 에이전트가 없어요.</Text>
        ) : (
          members.map((m) => {
            const ai = aiOf(m.kind);
            return (
              <View key={m.id} style={{ gap: 8 }}>
              <View style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
                <Pressable onPress={() => setEditing(editing === m.id ? null : m.id)}>
                  <Avatar bot={lookOf(m.kind, m.avatar)} size={46} dim={!m.active} />
                  <Text style={[styles.editBadge, { backgroundColor: t.card, borderColor: t.border }]}>✏️</Text>
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{m.name}</Text>
                  <Text style={{ color: t.subtext, fontSize: 12 }}>
                    {ai.name} · {m.joined ? '들어옴' : '아직 안 들어옴'} · {m.active ? '참가 중' : '쉬는 중'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
                    <Text onPress={() => setEditing(editing === m.id ? null : m.id)} style={{ color: t.link, fontWeight: '600', fontSize: 13 }}>
                      프로필
                    </Text>
                    <Text onPress={() => showLink(m)} style={{ color: t.link, fontWeight: '600', fontSize: 13 }}>
                      초대 링크
                    </Text>
                    <Text onPress={() => run(() => api.removeMember(settings, room, m.id))} style={{ color: t.danger, fontWeight: '600', fontSize: 13 }}>
                      내보내기
                    </Text>
                  </View>
                </View>
                <Switch
                  value={m.active}
                  onValueChange={(active) => run(() => api.updateMember(settings, room, m.id, { active }))}
                  trackColor={{ true: ai.color }}
                />
              </View>
              {editing === m.id && (
                <AvatarEditor
                  kind={m.kind}
                  avatar={m.avatar}
                  onClose={() => setEditing(null)}
                  onSave={async (avatar) => {
                    await api.updateMember(settings, room, m.id, { avatar });
                    await refreshMembers();
                  }}
                />
              )}
              </View>
            );
          })
        )}
      </Section>
    </ScrollView>
  );
}

function InviteLinkCard({ card, onClose }: { card: InviteCard; onClose: () => void }) {
  const t = useTheme();
  const ai = aiOf(card.member.kind);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  };
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: ai.color }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar bot={ai} size={32} />
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{card.member.name} 초대 링크</Text>
        <Text onPress={onClose} style={{ color: t.subtext, fontSize: 18 }}>
          ✕
        </Text>
      </View>
      <Text selectable style={[styles.url, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}>
        {card.url}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={copied === 'url' ? '복사됨 ✓' : '링크 복사'} onPress={() => copy('url', card.url)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="공유" variant="secondary" onPress={() => Share.share({ message: card.url }).catch(() => {})} />
        </View>
      </View>
      <Text style={{ color: t.text, fontWeight: '700' }}>① {ai.name}에 링크 넣기</Text>
      <Text style={{ color: t.subtext, lineHeight: 20 }}>{ai.howTo}</Text>
      <Text style={{ color: t.text, fontWeight: '700' }}>② 이렇게 말해서 들여보내기</Text>
      <Text selectable style={{ color: t.subtext, lineHeight: 20 }}>
        “{KICKOFF_PROMPT}”
      </Text>
      <Button title={copied === 'prompt' ? '복사됨 ✓' : '이 말 복사'} variant="secondary" onPress={() => copy('prompt', KICKOFF_PROMPT)} />
      <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
        링크를 가진 사람은 누구나 이 이름으로 말할 수 있어요. 믿는 곳에만 넣어주세요. 문제가 생기면 내보내기로 링크를 없앨 수 있어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  editBadge: { position: 'absolute', right: -6, bottom: -6, fontSize: 10, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 2, flexWrap: 'wrap' },
  nameInput: { borderBottomWidth: 1, paddingVertical: 6, fontSize: 16, minWidth: 140 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  card: { padding: 14, gap: 10, borderRadius: 16, borderWidth: 2 },
  url: { padding: 10, borderRadius: 10, borderWidth: 1, fontSize: 13 },
});
