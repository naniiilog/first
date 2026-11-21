import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#16181D',
  subtext: '#6B7280',
  border: '#E3E5EA',
  accent: '#5B5BD6',
  accentText: '#FFFFFF',
  myBubble: '#5B5BD6',
  myBubbleText: '#FFFFFF',
  botBubble: '#FFFFFF',
  danger: '#D93F3F',
  input: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0F1115',
  card: '#1A1D23',
  text: '#ECEDEF',
  subtext: '#9BA1AB',
  border: '#2A2E36',
  accent: '#8B8BF0',
  accentText: '#0F1115',
  myBubble: '#6E6EE8',
  myBubbleText: '#FFFFFF',
  botBubble: '#1F232A',
  danger: '#F07070',
  input: '#1A1D23',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
