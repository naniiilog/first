import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { LockScreen } from '../components/LockScreen';
import { api } from '../lib/api';
import { registerServiceWorker } from '../lib/push';
import { StoreProvider, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';

type Lock = { state: 'checking' } | { state: 'setup' } | { state: 'login'; offline?: string } | { state: 'open' };

function Root() {
  const { ready, settings } = useStore();
  const t = useTheme();
  const [lock, setLock] = useState<Lock>({ state: 'checking' });
  // 초대받은 사람(손님) 화면은 앱 비밀번호 없이 열려요(그 방 하나만 보여요).
  const guest = usePathname().startsWith('/join/');

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

  if (!guest && ready && (lock.state === 'setup' || lock.state === 'login')) {
    return (
      <LockScreen
        key={lock.state}
        mode={lock.state}
        offline={lock.state === 'login' ? lock.offline : undefined}
        onUnlocked={() => setLock({ state: 'open' })}
      />
    );
  }
  if (!guest && (!ready || lock.state === 'checking')) {
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
      <Stack.Screen name="join/[token]" options={{ title: "다봇 초대" }} />
      <Stack.Screen name="room/[id]/album" options={{ title: '사진 앨범' }} />
      <Stack.Screen name="room/[id]/timeline" options={{ title: '타임라인' }} />
      <Stack.Screen name="room/[id]/settings" options={{ title: '방 설정 · 알림', presentation: 'modal' }} />
    </Stack>
  );
}

export default function Layout() {
  // 웹에서는 앱을 열 때 알림 담당(서비스 워커)을 등록해 둬요(알림을 누르면 채팅방이 열리게).
  useEffect(() => {
    registerServiceWorker()?.catch(() => {});
    // 설치형 앱: 알림 준비, 알림을 누르면 그 채팅방으로
    let sub: { remove: () => void } | null = null;
    if (Platform.OS !== 'web') {
      import('../lib/nativePush').then((m) => m.setupNativeNotifications()).catch(() => {});
      import('expo-notifications')
        .then((N) => {
          sub = N.addNotificationResponseReceivedListener((r) => {
            const url = r.notification.request.content.data?.url;
            if (typeof url === 'string' && url.startsWith('/room/')) router.push(url as never);
          });
        })
        .catch(() => {});
    }
    // 앱 아이콘 배지(숫자·점)는 안 띄워요.
    if (typeof navigator !== 'undefined') (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
    return () => sub?.remove();
  }, []);
  return (
    <StoreProvider>
      <StatusBar style="auto" />
      <Root />
    </StoreProvider>
  );
}
