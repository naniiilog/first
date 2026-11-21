import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { StoreProvider, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

function Root() {
  const { ready } = useStore();
  const t = useTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'BotRoom' }} />
      <Stack.Screen name="bots" options={{ title: '내 봇들' }} />
      <Stack.Screen name="settings" options={{ title: '설정' }} />
      <Stack.Screen name="bot/[id]" options={{ title: '봇 편집', presentation: 'modal' }} />
      <Stack.Screen name="room/new" options={{ title: '새 채팅방', presentation: 'modal' }} />
      <Stack.Screen name="room/[id]" options={{ title: '채팅방' }} />
    </Stack>
  );
}

export default function Layout() {
  return (
    <StoreProvider>
      <StatusBar style="auto" />
      <Root />
    </StoreProvider>
  );
}
