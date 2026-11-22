/**
 * 휴대폰 알림(웹 푸시). 웹 앱에서만 돼요.
 * - 안드로이드 크롬: 바로 돼요.
 * - 아이폰: 다봇을 '홈 화면에 추가'해서 열었을 때만 돼요.
 */
import { Platform } from 'react-native';
import { api } from './api';
import type { LocalRoom, Settings } from './types';

type Nav = Navigator & { serviceWorker: ServiceWorkerContainer };

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** 아이폰인데 홈 화면 앱으로 열지 않았으면 알림이 안 돼요. */
export function needsHomeScreen(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

let registering: Promise<ServiceWorkerRegistration> | null = null;
/** 앱을 열 때 알림 담당(서비스 워커)을 등록해 둬요. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!pushSupported()) return null;
  registering ??= (navigator as Nav).serviceWorker.register('/sw.js');
  return registering;
}

const keyBytes = (b64u: string) => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** 이 기기가 이 방 알림을 받고 있는지 */
export async function pushStatus(s: Settings, room: LocalRoom): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  return (await api.pushStatus(s, room, sub.endpoint)).subscribed;
}

/** 이 기기에서 이 방 알림 켜기(처음이면 휴대폰이 허용할지 물어봐요) */
export async function enablePush(s: Settings, room: LocalRoom): Promise<void> {
  if (!pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (needsHomeScreen()) throw new Error('아이폰은 다봇을 홈 화면에 추가해서 열어야 알림을 받을 수 있어요.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 휴대폰 설정에서 이 사이트 알림을 허용해 주세요.');
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('알림을 준비하지 못했어요.');
  await (navigator as Nav).serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.pushKey(s);
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    } catch {
      throw new Error('알림 등록에 실패했어요. 휴대폰 설정에서 크롬(또는 이 사이트) 알림이 켜져 있는지 확인해 주세요.');
    }
  }
  await api.pushSubscribe(s, room, sub.toJSON());
}

/** 이 기기에서 이 방 알림 끄기(다른 방 알림은 그대로) */
export async function disablePush(s: Settings, room: LocalRoom): Promise<void> {
  const sub = await currentSubscription();
  if (sub) await api.pushUnsubscribe(s, room, sub.endpoint);
}
