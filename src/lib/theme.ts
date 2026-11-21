import { useColorScheme } from 'react-native';

/**
 * 화이트 · 그레이 · 블루~퍼플(차가운 색) 톤.
 * 앱 아이콘의 파랑(#0A43FF)과 보라(#C3A3F7), 로봇의 회색(#C0C4CF), 눈의 남색(#0B1446)에서 가져왔어요.
 */
const light = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#141A33',
  subtext: '#7C8399',
  border: '#E6E8F0',
  accent: '#2F55FF',
  accentText: '#FFFFFF',
  /** 보조 강조색(보라): 켜짐 상태 배경 등 */
  accentSoft: '#EEE8FE',
  accentPurple: '#8B6CF0',
  link: '#2F55FF',
  danger: '#E5484D',
  input: '#F2F4F8',
  chatBg: '#EEF1F7',
  myBubble: '#2F55FF',
  myBubbleText: '#FFFFFF',
  botBubble: '#FFFFFF',
  botBubbleText: '#141A33',
  chatTime: '#8A91A8',
  chatName: '#4B5370',
  systemPill: 'rgba(20,26,51,0.08)',
  systemText: '#5A6280',
  chip: 'rgba(255,255,255,0.9)',
  chipOff: 'rgba(255,255,255,0.45)',
  switchOff: '#C9CDD8',
};

const dark: typeof light = {
  bg: '#0F1222',
  card: '#171B2E',
  text: '#E8EAF4',
  subtext: '#8C93AD',
  border: '#262B44',
  accent: '#5B7BFF',
  accentText: '#FFFFFF',
  accentSoft: '#2A2450',
  accentPurple: '#B9A2FA',
  link: '#8FA6FF',
  danger: '#F07070',
  input: '#20253B',
  chatBg: '#12162A',
  myBubble: '#4766FF',
  myBubbleText: '#FFFFFF',
  botBubble: '#232842',
  botBubbleText: '#E8EAF4',
  chatTime: '#7E86A3',
  chatName: '#B7BED8',
  systemPill: 'rgba(255,255,255,0.08)',
  systemText: '#A9B0CA',
  chip: 'rgba(35,40,66,0.95)',
  chipOff: 'rgba(35,40,66,0.5)',
  switchOff: '#3A4060',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
