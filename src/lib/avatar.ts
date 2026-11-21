import { aiOf } from './ais';

/** 화면에 그릴 프로필 모양 */
export interface Look {
  emoji: string;
  color: string;
  /** 사진 프로필(data URL)이 있으면 이걸 그려요 */
  image?: string;
}

export const AVATAR_EMOJIS = ['🤖', '🧠', '✨', '🎨', '⚡', '🥒', '🛟', '🔑', '❓', '🎯', '🛸', '🦊', '🐱', '🐶', '🐻', '🐰', '🦉', '🐧', '👽', '🧙', '👾', '🌱', '🔥', '🌙'];
export const AVATAR_COLORS = ['#10A37F', '#4285F4', '#D97757', '#0866FF', '#6B6B6B', '#5FA83A', '#E8603C', '#D4A017', '#8E44AD', '#C0392B', '#607D8B', '#F48FB1'];

/** 서버에 저장된 프로필 값('emoji:🦊:#hex' / data URL / null)을 그릴 모양으로 바꿔요. */
export function lookOf(kind: string, avatar?: string | null): Look {
  const ai = aiOf(kind);
  if (avatar?.startsWith('data:image/')) return { emoji: ai.emoji, color: ai.color, image: avatar };
  const m = avatar?.match(/^emoji:([^:]+):(#[0-9a-fA-F]{6})$/);
  if (m) return { emoji: m[1], color: m[2] };
  return { emoji: ai.emoji, color: ai.color };
}

export const emojiAvatar = (emoji: string, color: string) => `emoji:${emoji}:${color}`;
