/**
 * 설치형 앱 알림(안드로이드). Expo 알림 서비스 → 구글 알림 서비스(FCM)로 와요.
 * 알림 칸(채널) 두 개: 'chat'(소리·진동), 'quiet'(무음). 서버가 방 설정에 맞춰 골라 보내요.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let channelsReady = false;
// 알림 칸(채널): 서버가 방 설정에 맞춰 이 이름으로 보내요(server/src/push.ts의 channelFor와 같아요).
// 안드로이드는 한 번 만든 칸의 소리를 앱에서 못 바꿔서, 소리마다 칸을 따로 만들어요.
const CUSTOM = ['dingdong', 'bell', 'pop', 'tok', 'chime'] as const;
const LABEL: Record<(typeof CUSTOM)[number], string> = { dingdong: '딩동', bell: '방울', pop: '뿅', tok: '톡', chime: '차임' };
async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  // eslint-disable-next-line import/namespace -- 다시 내보낸 이름이라 린트가 못 찾아요(타입 검사는 통과)
  const { HIGH, LOW } = Notifications.AndroidImportance;
  const base = { importance: HIGH, vibrationPattern: [0, 120, 60, 120], showBadge: false };
  await Notifications.setNotificationChannelAsync('chat', { ...base, name: '대화 알림(폰 기본음)' });
  for (const k of CUSTOM) {
    await Notifications.setNotificationChannelAsync(`snd_${k}`, { ...base, name: `대화 알림(${LABEL[k]})`, sound: `${k}.wav` });
  }
  await Notifications.setNotificationChannelAsync('vibrate', { ...base, name: '대화 알림(진동만)', sound: null });
  await Notifications.setNotificationChannelAsync('quiet', { name: '대화 알림(무음)', importance: LOW, sound: null, enableVibrate: false, showBadge: false });
  channelsReady = true;
}

/** 알림 소리 미리듣기(설치형 앱) */
export async function previewSound(file: number) {
  const { createAudioPlayer } = await import('expo-audio');
  const player = createAudioPlayer(file);
  player.play();
  setTimeout(() => player.remove(), 3000);
}

/** 앱을 켜 둔 동안 온 알림도 위에 띄워요(서버가 지금 보고 있는 방이면 안 보내요). */
export function setupNativeNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  ensureChannels().catch(() => {});
}

/** 이 기기의 알림 주소(Expo 푸시 토큰). 허락을 받고 만들어요. */
export async function nativePushToken(): Promise<string> {
  await ensureChannels();
  const cur = await Notifications.getPermissionsAsync();
  const perm = cur.granted ? cur : await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error('알림이 허용되지 않았어요. 휴대폰 설정 → 앱 → 다봇 → 알림을 켜 주세요.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    throw new Error('알림 주소를 만들지 못했어요. 앱이 구글 알림(Firebase) 설정 없이 만들어졌을 수 있어요. 새 버전 앱을 설치해 주세요.');
  }
}
