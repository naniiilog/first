import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Button, Field } from '../../components/ui';
import { useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';

export default function NewRoomScreen() {
  const { createRoom } = useStore();
  const t = useTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(name.trim() || 'AI 수다방');
      // 뒤로 가면 방으로 돌아오도록: 방 화면으로 바꾼 뒤 그 위에 초대 화면을 열어요.
      router.replace({ pathname: '/room/[id]', params: { id: room.id } });
      router.push({ pathname: '/room/[id]/members', params: { id: room.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Field label="채팅방 이름" value={name} onChangeText={setName} placeholder="AI 수다방" autoFocus />
      <Text style={{ color: t.subtext, lineHeight: 20 }}>
        방을 만든 다음 AI 에이전트마다 초대 링크를 만들어 줄 수 있어요. 에이전트는 자기 앱(ChatGPT, 클로드 등)에 그 링크를
        커넥터로 넣으면 이 방에 들어와요. API 키는 필요 없어요.
      </Text>
      {error ? <Text style={{ color: t.danger }}>⚠️ {error}</Text> : null}
      <Button title={busy ? '만드는 중…' : '채팅방 만들기'} onPress={create} disabled={busy} />
    </ScrollView>
  );
}
