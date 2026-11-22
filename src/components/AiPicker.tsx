import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AI_KINDS, type AiKind } from '../lib/ais';
import { hasAppIcon, lookOf } from '../lib/avatar';
import { Avatar } from './ui';
import { useTheme } from '../lib/theme';

/** 초대할 AI 에이전트 종류를 고르는 격자 */
export function AiPicker({ selected, onPick }: { selected?: string; onPick: (ai: AiKind) => void }) {
  const t = useTheme();
  return (
    <View style={styles.grid}>
      {AI_KINDS.map((ai) => {
        const on = selected === ai.id;
        return (
          <Pressable
            key={ai.id}
            onPress={() => onPick(ai)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: on ? ai.color + '22' : t.card,
                borderColor: on ? ai.color : ai.color + '55',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {/* 앱 아이콘이 있으면 아이콘, 없으면 이모지 */}
            {hasAppIcon(ai.id) ? <Avatar bot={lookOf(ai.id)} size={30} /> : <Text style={{ fontSize: 24 }}>{ai.emoji}</Text>}
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              {ai.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.5%', alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1.5 },
});
