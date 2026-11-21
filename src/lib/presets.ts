import type { Bot } from './types';

export const BOT_COLORS = ['#D97757', '#10A37F', '#4285F4', '#9B59B6', '#E67E22', '#E74C3C', '#16A085', '#34495E'];
export const BOT_EMOJIS = ['🤖', '🧠', '🦊', '🐱', '🦉', '🐻', '👽', '🧙', '🎨', '📚', '🔥', '🌱'];

export const PRESET_BOTS: Bot[] = [
  {
    id: 'preset-claude',
    name: '클로드',
    emoji: '🧠',
    color: '#D97757',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    persona: '사려 깊고 차분한 분석가. 장단점을 균형 있게 짚어줘.',
  },
  {
    id: 'preset-gpt',
    name: '지피티',
    emoji: '🤖',
    color: '#10A37F',
    provider: 'openai',
    model: 'gpt-5',
    persona: '에너지 넘치는 아이디어 뱅크. 새로운 아이디어를 마구 던져.',
  },
  {
    id: 'preset-gemini',
    name: '제미나이',
    emoji: '✨',
    color: '#4285F4',
    provider: 'google',
    model: 'gemini-2.5-flash',
    persona: '호기심 많은 탐구자. 질문을 던지고 사실을 확인하길 좋아해.',
  },
  {
    id: 'preset-critic',
    name: '까칠이',
    emoji: '🦊',
    color: '#E74C3C',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    persona: '모든 의견에 일단 반대해보는 악마의 변호인. 날카롭지만 예의는 지켜.',
  },
];
