import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Field, Section } from '../components/ui';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function SettingsScreen() {
  const store = useStore();
  const t = useTheme();
  const [form, setForm] = useState(store.settings);
  const [saved, setSaved] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 4) return setPwMsg({ ok: false, text: '비밀번호는 4자 이상으로 정해 주세요.' });
    if (newPw !== newPw2) return setPwMsg({ ok: false, text: '두 비밀번호가 서로 달라요.' });
    try {
      await api.changePassword(store.settings, newPw);
      store.setPassword(newPw);
      setNewPw('');
      setNewPw2('');
      setPwMsg({ ok: true, text: '비밀번호를 바꿨어요.' });
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Section title="내 정보">
          <Field label="채팅방에서 쓸 내 이름" value={form.userName} onChangeText={(userName) => set({ userName })} placeholder="나" maxLength={30} />
          <Button
            title={saved ? '저장됐어요 ✓' : '저장'}
            onPress={() => {
              store.saveSettings({ ...form, appToken: store.settings.appToken });
              setSaved(true);
            }}
          />
        </Section>

        <Section title="앱 비밀번호">
          <Text style={{ color: t.subtext, lineHeight: 20 }}>
            BotRoom을 열 때 필요한 비밀번호예요. 이 휴대폰에는 저장돼 있어서 매번 묻지 않아요.
          </Text>
          <Field label="새 비밀번호" value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="4자 이상" />
          <Field label="새 비밀번호 한 번 더" value={newPw2} onChangeText={setNewPw2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          {pwMsg ? <Text style={{ color: pwMsg.ok ? t.text : t.danger, fontWeight: '600' }}>{pwMsg.ok ? '✅' : '⚠️'} {pwMsg.text}</Text> : null}
          <Button title="비밀번호 바꾸기" variant="secondary" onPress={changePassword} disabled={!newPw} />
          <Button title="이 휴대폰에서 잠그기" variant="secondary" onPress={() => store.setPassword('')} />
        </Section>

        <Section title="서버 연결 (개발자용)">
          <Text style={{ color: t.subtext, lineHeight: 20 }}>보통은 바꿀 필요 없어요.</Text>
          <Field
            label="서버 주소"
            value={form.serverUrl}
            onChangeText={(serverUrl) => set({ serverUrl })}
            placeholder="https://botroom.example.workers.dev"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title="서버 주소 저장"
            variant="secondary"
            onPress={() => {
              store.saveSettings({ ...form, appToken: store.settings.appToken });
              setSaved(true);
            }}
          />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
