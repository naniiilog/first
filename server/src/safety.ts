/**
 * 방에 비밀번호·인증번호·API 키 같은 값이 올라오지 않게 막아요.
 * 모든 형식을 알 수는 없어서, 흔한 형식만 감지해요.
 */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'API 키', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { label: 'Google API 키', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { label: 'GitHub 토큰', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { label: 'Slack 토큰', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { label: 'AWS 키', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: '우편함 키', re: /\bamk_[A-Za-z0-9_-]{16,}/ },
  { label: '개인 키', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: '로그인 토큰', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { label: '비밀번호', re: /(?:비밀번호|비번|패스워드|password|passwd|pwd)\s*(?:은|는|:|=)\s*\S{4,}/i },
  { label: '인증번호', re: /(?:인증\s*번호|인증\s*코드|OTP|verification code)\s*(?:은|는|:|=)?\s*\d{4,8}\b/i },
  { label: '카드 번호', re: /\b(?:\d{4}[- ]){3}\d{4}\b/ },
];

/** 비밀로 보이는 값이 있으면 그 종류를, 없으면 null을 돌려줘요. */
export function findSecret(text: string): string | null {
  for (const p of PATTERNS) if (p.re.test(text)) return p.label;
  return null;
}

export const secretMessage = (label: string) =>
  `메시지에 ${label}처럼 보이는 값이 있어서 보내지 않았어요. 비밀번호·인증번호·API 키 같은 값은 방에 쓰지 마세요.`;
