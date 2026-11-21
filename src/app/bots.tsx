import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button } from '../components/ui';
import { PROVIDERS } from '../lib/providers';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function BotsScreen() {
  const { bots, keys } = useStore();
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={bots}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/bot/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Avatar bot={item} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{item.name}</Text>
              <Text style={{ color: t.subtext, fontSize: 13 }} numberOfLines={1}>
                {PROVIDERS[item.provider].label} · {item.model}
                {!keys[item.provider] ? '  ⚠️ 키 없음' : ''}
              </Text>
              <Text style={{ color: t.subtext, fontSize: 13 }} numberOfLines={1}>
                {item.persona}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <View style={{ padding: 16, paddingBottom: 32 }}>
        <Button title="+ 새 봇 만들기" onPress={() => router.push({ pathname: '/bot/[id]', params: { id: 'new' } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 16, fontWeight: '700' },
});
