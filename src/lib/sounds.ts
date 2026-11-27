/**
 * 알림 소리. 설치형 앱(안드로이드)은 소리마다 알림 칸(채널)을 따로 만들고,
 * 서버가 방 설정에 맞는 칸으로 보내요. 다봇 전용 소리는 직접 만든 효과음이에요.
 */
export type SoundKey = 'default' | 'salang' | 'pogeun' | 'pop' | 'tok' | 'marimba' | 'bogeul' | 'vibrate' | 'silent';

export const SOUNDS: { key: SoundKey; label: string; file?: number }[] = [
  { key: 'default', label: '폰 기본음' },
  { key: 'salang', label: '살랑', file: require('../../assets/sounds/salang.wav') },
  { key: 'pogeun', label: '포근', file: require('../../assets/sounds/pogeun.wav') },
  { key: 'pop', label: '뿅', file: require('../../assets/sounds/pop.wav') },
  { key: 'tok', label: '톡', file: require('../../assets/sounds/tok.wav') },
  { key: 'marimba', label: '마림바', file: require('../../assets/sounds/marimba.wav') },
  { key: 'bogeul', label: '보글', file: require('../../assets/sounds/bogeul.wav') },
  { key: 'vibrate', label: '진동만' },
  { key: 'silent', label: '무음' },
];

export const SOUND_KEYS = SOUNDS.map((s) => s.key);
