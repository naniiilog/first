import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field, Section } from '../components/ui';
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="내 정보">
          <Field label="채팅방에서 쓸 내 이름" value={form.userName} onChangeText={(userName) => set({ userName })} placeholder="나" maxLength={30} />
        </Section>
        <Section title="서버 연결 (개발자용)">
          <Text style={{ color: t.subtext, lineHeight: 20 }}>
            채팅방은 BotRoom 서버에 저장돼요. AI 에이전트도 이 서버의 초대 링크로 들어와요. 보통은 바꿀 필요 없어요.
          </Text>
          <Field
            label="서버 주소"
            value={form.serverUrl}
            onChangeText={(serverUrl) => set({ serverUrl })}
            placeholder="https://botroom-server.example.workers.dev"
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
