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
const CUSTOM = ['salang', 'pogeun', 'pop', 'tok', 'marimba', 'bogeul'] as const;
const LABEL: Record<(typeof CUSTOM)[number], string> = { salang: '살랑', pogeun: '포근', pop: '뿅', tok: '톡', marimba: '마림바', bogeul: '보글' };
/** 예전 버전에 있던 소리 칸은 지워요(폰 알림 설정에 안 남게) */
const REMOVED = ['dingdong', 'bell', 'chime'];
async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  // eslint-disable-next-line import/namespace -- 다시 내보낸 이름이라 린트가 못 찾아요(타입 검사는 통과)
  const { HIGH, LOW } = Notifications.AndroidImportance;
  const base = { importance: HIGH, vibrationPattern: [0, 120, 60, 120], showBadge: false };
  await Notifications.setNotificationChannelAsync('chat', { ...base, name: '대화 알림(폰 소리 · 내가 고르기)' });
  for (const k of CUSTOM) {
    const ch = await Notifications.setNotificationChannelAsync(`s2_${k}`, { ...base, name: `대화 알림(${LABEL[k]})`, sound: `${k}.wav` });
    // 이 앱에 소리 파일이 없으면(예전 버전 앱) 기본음으로 굳어버리니 칸을 지워 둬요. 새 버전을 설치하면 제대로 다시 만들어요.
    if (ch && !(ch.sound ?? '').includes(`/raw/${k}`)) await Notifications.deleteNotificationChannelAsync(`s2_${k}`).catch(() => {});
  }
  // 예전 칸(소리가 안 붙었거나 폰 설정에서 바뀐 것)은 지우고 새 칸(s2_)을 써요.
  for (const k of [...REMOVED, ...CUSTOM]) await Notifications.deleteNotificationChannelAsync(`snd_${k}`).catch(() => {});
  await Notifications.setNotificationChannelAsync('vibrate', { ...base, name: '대화 알림(진동만)', sound: null });
  await Notifications.setNotificationChannelAsync('quiet', { name: '대화 알림(무음)', importance: LOW, sound: null, enableVibrate: false, showBadge: false });
  channelsReady = true;
}

/**
 * 폰 설정에서 이 알림 칸의 소리가 원래대로인지 확인해요.
 * - 'ok': 다봇 소리 그대로 / 'changed': 폰 설정에서 다른 소리로 바뀜 / 'free': 폰 기본음 칸(마음대로 바꿔도 돼요)
 */
export async function channelSoundState(key: string): Promise<'ok' | 'changed' | 'free' | 'missing' | null> {
  if (Platform.OS !== 'android') return null;
  if (key === 'default') return 'free';
  await ensureChannels();
  const id = key === 'silent' ? 'quiet' : key === 'vibrate' ? 'vibrate' : `s2_${key}`;
  const ch = await Notifications.getNotificationChannelAsync(id);
  if (!ch) return key === 'silent' || key === 'vibrate' ? null : 'missing';
  const uri = ch.sound ?? '';
  if (key === 'silent' || key === 'vibrate') return uri ? 'changed' : 'ok';
  return uri.includes(`/${key}`) || uri.endsWith(`/${key}.wav`) ? 'ok' : 'changed';
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
