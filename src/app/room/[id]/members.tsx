import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AiPicker } from '../../../components/AiPicker';
import { Avatar, Section } from '../../../components/ui';
import { aiOf, type AiKind } from '../../../lib/ais';
import { useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const t = useTheme();
  const room = store.rooms.find((r) => r.id === id);
  const [pending, setPending] = useState<AiKind | null>(null);
  const [pendingName, setPendingName] = useState('');

  if (!room) return null;

  const invite = () => {
    if (!pending) return;
    store.inviteMember(room.id, { aiId: pending.id, name: pendingName });
    setPending(null);
    setPendingName('');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Section title={`멤버 (${room.members.length})`}>
        <Text style={{ color: t.subtext }}>스위치를 끄면 그 봇은 대화에 참가하지 않아요. 토큰도 쓰지 않아요.</Text>
        {room.members.map((m) => {
          const ai = aiOf(m.aiId);
          return (
            <View key={m.id} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
              <Avatar bot={ai} size={38} dim={!m.active} />
              <View style={{ flex: 1 }}>
                <TextInput
                  value={m.name}
                  onChangeText={(name) => store.updateMember(room.id, m.id, { name })}
                  placeholder={ai.name}
                  placeholderTextColor={t.subtext}
                  style={[styles.nameInput, { color: t.text, borderColor: t.border }]}
                />
                <Text style={{ color: t.subtext, fontSize: 12, marginTop: 2 }}>
                  {ai.name}
                  {ai.mimic ? ' · 따라하기 봇' : ''} · {m.active ? '참가 중' : '쉬는 중'}
                </Text>
              </View>
              <Switch
                value={m.active}
                onValueChange={(active) => store.updateMember(room.id, m.id, { active })}
                trackColor={{ true: ai.color }}
              />
              <Pressable onPress={() => store.removeMember(room.id, m.id)} hitSlop={10}>
                <Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>내보내기</Text>
              </Pressable>
            </View>
          );
        })}
      </Section>

      <Section title="AI 더 초대하기">
        <AiPicker
          onPick={(ai) => {
            setPending(ai);
            setPendingName('');
          }}
        />
        {pending && (
          <View style={[styles.invite, { backgroundColor: t.card, borderColor: pending.color }]}>
            <Avatar bot={pending} size={36} />
            <TextInput
              value={pendingName}
              onChangeText={setPendingName}
              placeholder={`이름 지어주기 (기본: ${pending.name})`}
              placeholderTextColor={t.subtext}
              style={[styles.nameInput, { flex: 1, color: t.text, borderColor: t.border }]}
              autoFocus
              onSubmitEditing={invite}
            />
            <Pressable onPress={invite} style={[styles.inviteBtn, { backgroundColor: t.accent }]}>
              <Text style={{ color: t.accentText, fontWeight: '700' }}>초대</Text>
            </Pressable>
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  nameInput: { borderBottomWidth: 1, paddingVertical: 6, fontSize: 16 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 2 },
  inviteBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
