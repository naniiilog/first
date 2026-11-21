import { useColorScheme } from 'react-native';

/** 카톡 느낌의 색: 하늘빛 회색 채팅 배경, 노란 내 말풍선, 흰 상대 말풍선 */
const light = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#191919',
  subtext: '#8A8A8A',
  border: '#ECECEC',
  accent: '#FEE500',
  accentText: '#191919',
  link: '#3B6FB6',
  danger: '#E5484D',
  input: '#F5F5F5',
  chatBg: '#B2C7DA',
  myBubble: '#FEE500',
  myBubbleText: '#191919',
  botBubble: '#FFFFFF',
  botBubbleText: '#191919',
  chatTime: '#556677',
  chatName: '#4A5560',
  systemPill: 'rgba(0,0,0,0.13)',
  systemText: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#1B1B1B',
  card: '#242424',
  text: '#ECECEC',
  subtext: '#8E8E8E',
  border: '#303030',
  accent: '#FEE500',
  accentText: '#191919',
  link: '#7FA8E0',
  danger: '#F07070',
  input: '#2E2E2E',
  chatBg: '#2A3540',
  myBubble: '#FEE500',
  myBubbleText: '#191919',
  botBubble: '#3A3F45',
  botBubbleText: '#ECECEC',
  chatTime: '#9AA7B3',
  chatName: '#C6CFD8',
  systemPill: 'rgba(0,0,0,0.28)',
  systemText: '#E6E6E6',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
