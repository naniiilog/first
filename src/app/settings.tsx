import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field, Section } from '../components/ui';
import { AI_KINDS } from '../lib/ais';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function SettingsScreen() {
  const store = useStore();
  const t = useTheme();
  const [form, setForm] = useState(store.settings);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const ready = store.available;
  const status =
    ready === null
      ? '❌ 서버에 연결되지 않았어요'
      : `✅ 연결됨\n진짜 연결: ${AI_KINDS.filter((a) => ready[a.id] === 'real').map((a) => a.name).join(', ') || '없음'}\n따라하기(무료): ${AI_KINDS.filter((a) => ready[a.id] === 'mimic').map((a) => a.name).join(', ') || '없음'}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="내 정보">
          <Field label="채팅방에서 쓸 내 이름" value={form.userName} onChangeText={(userName) => set({ userName })} placeholder="나" />
        </Section>
        <Section title="서버 연결 (개발자용)">
          <Text style={{ color: t.subtext, lineHeight: 20 }}>
            AI 호출은 BotRoom 서버가 대신 해요. 앱 사용자는 API 키가 필요 없어요. '따라하기'는 무료 AI가 그 AI의 말투를 흉내 내는 거예요.
          </Text>
          <Text style={{ color: t.text }}>{status}</Text>
          <Field
            label="서버 주소"
            value={form.serverUrl}
            onChangeText={(serverUrl) => set({ serverUrl })}
            placeholder="https://my-botroom-server.example.com"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="앱 토큰 (서버에 APP_TOKEN을 설정했을 때만)"
            value={form.appToken}
            onChangeText={(appToken) => set({ appToken })}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </Section>
        <Button
          title={saved ? '저장됐어요 ✓' : '저장'}
          onPress={() => {
            store.saveSettings(form);
            setSaved(true);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
