/**
 * 알림 소리. 설치형 앱(안드로이드)은 소리마다 알림 칸(채널)을 따로 만들고,
 * 서버가 방 설정에 맞는 칸으로 보내요. 다봇 전용 소리는 직접 만든 효과음이에요.
 */
export type SoundKey = 'default' | 'dingdong' | 'bell' | 'pop' | 'tok' | 'chime' | 'vibrate' | 'silent';

export const SOUNDS: { key: SoundKey; label: string; file?: number }[] = [
  { key: 'default', label: '폰 기본음' },
  { key: 'dingdong', label: '딩동', file: require('../../assets/sounds/dingdong.wav') },
  { key: 'bell', label: '방울', file: require('../../assets/sounds/bell.wav') },
  { key: 'pop', label: '뿅', file: require('../../assets/sounds/pop.wav') },
  { key: 'tok', label: '톡', file: require('../../assets/sounds/tok.wav') },
  { key: 'chime', label: '차임', file: require('../../assets/sounds/chime.wav') },
  { key: 'vibrate', label: '진동만' },
  { key: 'silent', label: '무음' },
];

export const SOUND_KEYS = SOUNDS.map((s) => s.key);
