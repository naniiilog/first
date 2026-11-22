import type { ImageSourcePropType } from 'react-native';
import { aiOf } from './ais';

/** 화면에 그릴 프로필 모양 */
export interface Look {
  emoji: string;
  color: string;
  /** 사진 프로필(data URL) 또는 기본 프로필 이미지가 있으면 이걸 그려요 */
  image?: string | ImageSourcePropType;
}

/** 프로필을 따로 정하지 않은 에이전트의 기본 프로필(회색 로봇) */
export const DEFAULT_AVATAR: ImageSourcePropType = require('../../assets/default-avatar.png');

/**
 * AI 종류별 기본 프로필(그 앱 아이콘, 모두 256px). 아이콘이 없는 종류는 회색 로봇이에요.
 * ChatGPT·클로드·제미나이는 @lobehub/icons(MIT), 나머지는 방장 휴대폰의 앱 아이콘을 잘라 썼어요.
 */
const AI_ICONS: Record<string, ImageSourcePropType> = {
  chatgpt: require('../../assets/ai/chatgpt.png'),
  claude: require('../../assets/ai/claude.png'),
  gemini: require('../../assets/ai/gemini.png'),
  grok: require('../../assets/ai/grok.png'),
  muse: require('../../assets/ai/muse.png'),
  pickle: require('../../assets/ai/pickle.png'),
  buoy: require('../../assets/ai/buoy.png'),
  keyring: require('../../assets/ai/keyring.png'),
  q: require('../../assets/ai/q.png'),
  instinct: require('../../assets/ai/instinct.png'),
};
export const hasAppIcon = (kind: string) => kind in AI_ICONS;
export const defaultAvatarOf = (kind: string): ImageSourcePropType => AI_ICONS[kind] ?? DEFAULT_AVATAR;

export const AVATAR_EMOJIS = ['🤖', '🧠', '✨', '🎨', '⚡', '🥒', '🛟', '🔑', '❓', '🎯', '🛸', '🦊', '🐱', '🐶', '🐻', '🐰', '🦉', '🐧', '👽', '🧙', '👾', '🌱', '🔥', '🌙'];
// 화이트·그레이·블루~퍼플 톤에 맞춘 배경색
export const AVATAR_COLORS = ['#2F55FF', '#5B7BFF', '#4FA3FF', '#8FC1FF', '#6E5BFF', '#8B6CF0', '#B9A2FA', '#D9CCFB', '#3E4A7A', '#7C8399', '#C0C4CF', '#E3E6EE'];

/** 서버에 저장된 프로필 값('emoji:🦊:#hex' / data URL / null)을 그릴 모양으로 바꿔요. */
export function lookOf(kind: string, avatar?: string | null): Look {
  const ai = aiOf(kind);
  if (avatar?.startsWith('data:image/')) return { emoji: ai.emoji, color: ai.color, image: avatar };
  const m = avatar?.match(/^emoji:([^:]+):(#[0-9a-fA-F]{6})$/);
  if (m) return { emoji: m[1], color: m[2] };
  return { emoji: ai.emoji, color: ai.color, image: defaultAvatarOf(kind) };
}

export const emojiAvatar = (emoji: string, color: string) => `emoji:${emoji}:${color}`;
