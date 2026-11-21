import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Chip, Field, Section } from '../../components/ui';
import { BOT_COLORS, BOT_EMOJIS } from '../../lib/presets';
import { PROVIDERS } from '../../lib/providers';
import { newId, useStore } from '../../lib/store';
import { useTheme } from '../../lib/theme';
import type { Bot, ProviderId } from '../../lib/types';

export default function BotEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { botsById, saveBot, deleteBot } = useStore();
  const t = useTheme();
  const existing = id && id !== 'new' ? botsById[id] : undefined;

  const [bot, setBot] = useState<Bot>(
    existing ?? {
      id: newId(),
      name: '',
      emoji: BOT_EMOJIS[Math.floor(Math.random() * BOT_EMOJIS.length)],
      color: BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)],
      provider: 'anthropic',
      model: PROVIDERS.anthropic.defaultModel,
      persona: '',
    },
  );
  const set = (patch: Partial<Bot>) => setBot((b) => ({ ...b, ...patch }));

  const setProvider = (provider: ProviderId) => {
    // 모델을 아직 기본값으로 두었다면 새 공급자의 기본 모델로 바꿔줍니다.
    const wasDefault = bot.model === PROVIDERS[bot.provider].defaultModel || !bot.model;
    set({ provider, model: wasDefault ? PROVIDERS[provider].defaultModel : bot.model });
  };

  const save = () => {
    if (!bot.name.trim()) {
      Alert.alert('이름을 입력해 주세요');
      return;
    }
    saveBot({ ...bot, name: bot.name.trim(), model: bot.model.trim() || PROVIDERS[bot.provider].defaultModel });
    router.back();
  };

  const remove = () => {
    const doDelete = () => {
      deleteBot(bot.id);
      router.back();
    };
    if (Platform.OS === 'web') {
      doDelete();
      return;
    }
    Alert.alert('봇 삭제', `${bot.name}을(를) 삭제할까요? 모든 채팅방에서 빠져요.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? '봇 편집' : '새 봇' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar bot={bot} size={72} />
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{bot.name || '이름 없는 봇'}</Text>
        </View>

        <Field label="이름" value={bot.name} onChangeText={(name) => set({ name })} placeholder="예: 철학자 봇" />

        <Section title="아이콘">
          <View style={styles.wrap}>
            {BOT_EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={bot.emoji === e} onPress={() => set({ emoji: e })} color={bot.color} />
            ))}
          </View>
          <View style={styles.wrap}>
            {BOT_COLORS.map((c) => (
              <Text
                key={c}
                onPress={() => set({ color: c })}
                style={[styles.swatch, { backgroundColor: c, borderColor: bot.color === c ? t.text : 'transparent' }]}
              />
            ))}
          </View>
        </Section>

        <Section title="어떤 AI를 쓸까요?">
          <View style={styles.wrap}>
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <Chip key={p} label={PROVIDERS[p].label} selected={bot.provider === p} onPress={() => setProvider(p)} />
            ))}
          </View>
          <Field
            label="모델 이름"
            value={bot.model}
            onChangeText={(model) => set({ model })}
            placeholder={PROVIDERS[bot.provider].defaultModel}
            autoCapitalize="none"
            autoCorrect={false}
            hint="각 회사에서 쓰는 모델 ID를 그대로 입력해요."
          />
        </Section>

        <Field
          label="성격 / 역할"
          value={bot.persona}
          onChangeText={(persona) => set({ persona })}
          placeholder="예: 소크라테스처럼 질문으로 상대를 깨우치는 철학자. 반말로 말해."
          multiline
        />

        <Button title="저장" onPress={save} />
        {existing ? <Button title="이 봇 삭제" variant="danger" onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, overflow: 'hidden' },
});
