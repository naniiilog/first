import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AiPicker } from '../../components/AiPicker';
import { Avatar, Button, Field, Section } from '../../components/ui';
import { aiOf } from '../../lib/ais';
import { newId, useStore, type NewMember } from '../../lib/store';
import { useTheme } from '../../lib/theme';

export default function NewRoomScreen() {
  const { createRoom } = useStore();
  const t = useTheme();
  const [roomName, setRoomName] = useState('');
  const [invites, setInvites] = useState<(NewMember & { key: string })[]>([]);

  const create = () => {
    if (invites.length === 0) return;
    const fallback = invites.map((m) => m.name.trim() || aiOf(m.aiId).name).join(', ');
    const id = createRoom(roomName.trim() || fallback, invites);
    router.replace({ pathname: '/room/[id]', params: { id } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Field label="채팅방 이름" value={roomName} onChangeText={setRoomName} placeholder="비워두면 멤버 이름으로 정해져요" />

      <Section title="AI 초대하기">
        <Text style={{ color: t.subtext }}>누르면 초대 목록에 추가돼요. 같은 AI를 여러 번 넣어도 돼요.</Text>
        <AiPicker onPick={(ai) => setInvites((list) => [...list, { key: newId(), aiId: ai.id, name: '' }])} />
      </Section>

      <Section title={`초대 목록 (${invites.length}명)`}>
        {invites.length === 0 ? (
          <Text style={{ color: t.subtext }}>아직 아무도 없어요.</Text>
        ) : (
          invites.map((m, i) => {
            const ai = aiOf(m.aiId);
            return (
              <View key={m.key} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
                <Avatar bot={ai} size={36} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={m.name}
                    onChangeText={(name) => setInvites((list) => list.map((x, j) => (j === i ? { ...x, name } : x)))}
                    placeholder={`이름 지어주기 (기본: ${ai.name})`}
                    placeholderTextColor={t.subtext}
                    style={[styles.nameInput, { color: t.text, borderColor: t.border }]}
                  />
                  <Text style={{ color: t.subtext, fontSize: 12, marginTop: 2 }}>
                    {ai.name}
                    {ai.mimic ? ' · 따라하기 봇' : ''}
                  </Text>
                </View>
                <Pressable onPress={() => setInvites((list) => list.filter((_, j) => j !== i))} hitSlop={10}>
                  <Text style={{ color: t.danger, fontSize: 18 }}>✕</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </Section>

      <Button title="채팅방 만들기" onPress={create} disabled={invites.length === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  nameInput: { borderBottomWidth: 1, paddingVertical: 6, fontSize: 16 },
});
