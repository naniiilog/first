import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

/**
 * 앱 비밀번호 화면.
 * - setup: 처음 한 번 비밀번호를 정해요(두 번 입력).
 * - login: 정해 둔 비밀번호를 넣어야 앱이 열려요.
 */
export function LockScreen({ mode, onUnlocked, offline }: { mode: 'setup' | 'login'; onUnlocked: () => void; offline?: string }) {
  const { settings, setPassword } = useStore();
  const t = useTheme();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(offline ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === 'setup') {
      if (pw.length < 4) return setError('비밀번호는 4자 이상으로 정해 주세요.');
      if (pw !== pw2) return setError('두 비밀번호가 서로 달라요.');
    }
    setBusy(true);
    try {
      const next = { ...settings, appToken: pw };
      if (mode === 'setup') await api.setupPassword(next, pw);
      const status = await api.authStatus(next);
      if (!status.ok) {
        setError('비밀번호가 맞지 않아요.');
        return;
      }
      setPassword(pw);
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, backgroundColor: t.card }];
  return (
    <KeyboardAvoidingView style={[styles.wrap, { backgroundColor: t.accent }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <Text style={{ fontSize: 56 }}>🤖</Text>
        <Text style={[styles.title, { color: t.accentText }]}>BotRoom</Text>
        <Text style={{ color: t.accentText, opacity: 0.75, textAlign: 'center' }}>
          {mode === 'setup' ? '처음이에요! 나만 쓸 수 있게\n앱 비밀번호를 정해 주세요.' : '앱 비밀번호를 입력해 주세요.'}
        </Text>
      </View>
      <View style={{ width: '100%', maxWidth: 360, gap: 10 }}>
        <TextInput
          value={pw}
          onChangeText={setPw}
          placeholder={mode === 'setup' ? '새 비밀번호 (4자 이상)' : '비밀번호'}
          placeholderTextColor={t.subtext}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={mode === 'login' ? submit : undefined}
          style={input}
        />
        {mode === 'setup' && (
          <TextInput
            value={pw2}
            onChangeText={setPw2}
            placeholder="한 번 더 입력"
            placeholderTextColor={t.subtext}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={submit}
            style={input}
          />
        )}
        {error ? <Text style={{ color: '#B00020', fontWeight: '600', textAlign: 'center' }}>⚠️ {error}</Text> : null}
        <Pressable onPress={submit} disabled={busy || !pw} style={[styles.button, { opacity: busy || !pw ? 0.5 : 1 }]}>
          <Text style={styles.buttonText}>{busy ? '확인 중…' : mode === 'setup' ? '비밀번호 정하기' : '열기'}</Text>
        </Pressable>
        {mode === 'setup' && (
          <Text style={{ color: t.accentText, opacity: 0.7, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            잊어버리면 되찾을 수 없으니 꼭 기억해 두세요.{'\n'}에이전트는 초대 링크로 들어와서 비밀번호가 필요 없어요.
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '800' },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17 },
  button: { backgroundColor: '#3A1D1D', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#FEE500', fontSize: 17, fontWeight: '800' },
});
