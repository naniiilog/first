import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field, Section } from '../components/ui';
import { PROVIDERS } from '../lib/providers';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import type { ApiKeys, ProviderId } from '../lib/types';

export default function SettingsScreen() {
  const store = useStore();
  const t = useTheme();
  const [keys, setKeys] = useState<ApiKeys>(store.keys);
  const [name, setName] = useState(store.userName);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    try {
      await store.setKeys(keys);
      store.setUserName(name);
      setSaved(true);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="내 정보">
          <Field label="채팅방에서 쓸 내 이름" value={name} onChangeText={(v) => { setName(v); setSaved(false); }} placeholder="나" />
        </Section>
        <Section title="AI API 키">
          <Text style={{ color: t.subtext, lineHeight: 20 }}>
            사용할 AI의 키만 입력하면 돼요. 키는 이 기기의 보안 저장소에만 저장되고, 각 AI 회사 서버로만 직접 전송돼요.
          </Text>
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <Field
              key={id}
              label={PROVIDERS[id].label}
              value={keys[id]}
              onChangeText={(v) => { setKeys((k) => ({ ...k, [id]: v })); setSaved(false); }}
              placeholder={PROVIDERS[id].keyHint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          ))}
        </Section>
        <Button title={saved ? '저장됐어요 ✓' : '저장'} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
