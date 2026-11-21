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
      <Stack.Screen name="settings" options={{ title: '설정' }} />
      <Stack.Screen name="room/new" options={{ title: '새 채팅방', presentation: 'modal' }} />
      <Stack.Screen name="room/[id]/index" options={{ title: '채팅방' }} />
      <Stack.Screen name="room/[id]/members" options={{ title: '멤버', presentation: 'modal' }} />
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
