import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AI_KINDS, modeText, type AiKind } from '../lib/ais';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

/** AI 종류를 고르는 격자. 서버에 키가 없는 AI는 흐리게 보여줘요. */
export function AiPicker({ onPick }: { onPick: (ai: AiKind) => void }) {
  const { available } = useStore();
  const t = useTheme();
  return (
    <View style={styles.grid}>
      {AI_KINDS.map((ai) => {
        const ready = available === null || ai.id in available;
        const mode = modeText(available, ai.id);
        return (
          <Pressable
            key={ai.id}
            onPress={() => onPick(ai)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: t.card, borderColor: ai.color + '66', opacity: ready ? (pressed ? 0.7 : 1) : 0.45 },
            ]}
          >
            <Text style={{ fontSize: 26 }}>{ai.emoji}</Text>
            <Text style={{ color: t.text, fontWeight: '700' }} numberOfLines={1}>
              {ai.name}
            </Text>
            <Text style={{ color: t.subtext, fontSize: 11 }} numberOfLines={1}>
              {mode && mode !== '진짜 연결' ? mode : ai.blurb}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', alignItems: 'center', gap: 2, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1.5 },
});
