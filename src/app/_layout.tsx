import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LockScreen } from '../components/LockScreen';
import { api } from '../lib/api';
import { StoreProvider, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

type Lock = { state: 'checking' } | { state: 'setup' } | { state: 'login'; offline?: string } | { state: 'open' };

function Root() {
  const { ready, settings } = useStore();
  const t = useTheme();
  const [lock, setLock] = useState<Lock>({ state: 'checking' });

  // 앱을 열 때(그리고 비밀번호가 바뀔 때) 서버에 비밀번호가 맞는지 물어봐요.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    api
      .authStatus(settings)
      .then((s) => alive && setLock(!s.passwordSet ? { state: 'setup' } : s.ok ? { state: 'open' } : { state: 'login' }))
      .catch((e) => alive && setLock({ state: 'login', offline: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [ready, settings]);

  if (ready && (lock.state === 'setup' || lock.state === 'login')) {
    return (
      <LockScreen
        key={lock.state}
        mode={lock.state}
        offline={lock.state === 'login' ? lock.offline : undefined}
        onUnlocked={() => setLock({ state: 'open' })}
      />
    );
  }
  if (!ready || lock.state === 'checking') {
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
      <Stack.Screen name="index" options={{ title: '다봇' }} />
      <Stack.Screen name="settings" options={{ title: '설정' }} />
      <Stack.Screen name="help" options={{ title: '사용법 한눈에 보기' }} />
      <Stack.Screen name="usage" options={{ title: '봇 사용량' }} />
      <Stack.Screen name="room/new" options={{ title: '새 채팅방', presentation: 'modal' }} />
      <Stack.Screen name="room/[id]/index" options={{ title: '채팅방' }} />
      <Stack.Screen name="room/[id]/members" options={{ title: '멤버', presentation: 'modal' }} />
      <Stack.Screen name="room/[id]/settings" options={{ title: '방 설정', presentation: 'modal' }} />
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
