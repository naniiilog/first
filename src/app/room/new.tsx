import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Field, Section } from '../../components/ui';
import { PROVIDERS } from '../../lib/providers';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';

export default function NewRoomScreen() {
  const { bots, createRoom } = useStore();
  const t = useTheme();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = () => {
    if (selected.length === 0) {
      Alert.alert('봇을 한 명 이상 골라주세요');
      return;
    }
    const fallbackName = selected
      .map((id) => bots.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    const id = createRoom(name.trim() || fallbackName, selected);
    router.replace({ pathname: '/room/[id]', params: { id } });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Field label="채팅방 이름" value={name} onChangeText={setName} placeholder="비워두면 멤버 이름으로 정해져요" />
      <Section title={`초대할 봇 (${selected.length}명)`}>
        <Text style={{ color: t.subtext }}>고른 순서대로 말해요.</Text>
        {bots.map((b) => {
          const order = selected.indexOf(b.id);
          const on = order >= 0;
          return (
            <Pressable
              key={b.id}
              onPress={() => toggle(b.id)}
              style={[styles.row, { backgroundColor: t.card, borderColor: on ? b.color : t.border }]}
            >
              <Avatar bot={b} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{b.name}</Text>
                <Text style={{ color: t.subtext, fontSize: 13 }}>{PROVIDERS[b.provider].label}</Text>
              </View>
              <View style={[styles.check, { borderColor: on ? b.color : t.border, backgroundColor: on ? b.color : 'transparent' }]}>
                {on ? <Text style={{ color: '#fff', fontWeight: '800' }}>{order + 1}</Text> : null}
              </View>
            </Pressable>
          );
        })}
        <Button title="+ 새 봇 만들기" variant="secondary" onPress={() => router.push({ pathname: '/bot/[id]', params: { id: 'new' } })} />
      </Section>
      <Button title="채팅방 만들기" onPress={create} disabled={selected.length === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 2 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
