/**
 * 봇 사용량: 다봇이 셀 수 있는 것만 세요.
 * - 방 확인(도구 호출) 횟수, 보낸 메시지 수
 * - 다봇이 봇에게 준 글자 수(읽은 양), 봇이 보낸 글자 수(쓴 양)
 * 각 AI 앱의 실제 남은 한도는 그 회사만 알아서 여기서는 알 수 없어요.
 *
 * 초기화 주기는 봇마다 정해요.
 * - daily: 매일 그 시각(방 시간대 기준)에 0으로
 * - hours: 첫 사용부터 N시간이 지나면 0으로(클로드 같은 '몇 시간 창' 방식)
 */
export type ResetMode = 'daily' | 'hours';

export const DEFAULT_RESET: { mode: ResetMode; value: number } = { mode: 'daily', value: 0 };

/**
 * AI 종류별 기본 초기화 주기(2026년 11월에 찾아본 정보 기준, 앱 화면의 설명과 같아요).
 * 클로드·제미나이: 첫 메시지부터 5시간 창, ChatGPT: 약 3시간 창, 그록(무료): 약 2시간 창, 피클: 매일 새벽 4시.
 * 정보가 없는 앱은 매일 0시로 두고, 방장이 바꿀 수 있어요.
 */
export const RESET_BY_KIND: Record<string, { mode: ResetMode; value: number }> = {
  chatgpt: { mode: 'hours', value: 3 },
  claude: { mode: 'hours', value: 5 },
  gemini: { mode: 'hours', value: 5 },
  grok: { mode: 'hours', value: 2 },
  pickle: { mode: 'daily', value: 4 },
};
export const resetForKind = (kind: string) => RESET_BY_KIND[kind] ?? DEFAULT_RESET;

/** 그 시간대에서 지금 몇 시 몇 분 몇 초인지 */
function localSeconds(tz: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  } catch {
    const d = new Date(at + 9 * 3600_000);
    return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  }
}

/** start에 시작한 사용 주기가 끝나는(초기화되는) 시각 */
export function windowEnd(start: number, mode: string, value: number, tz: string): number {
  if (mode === 'hours') return start + Math.max(1, value) * 3600_000;
  // 매일 value시: start 다음에 오는 그 시각
  const nowSec = localSeconds(tz, start);
  let left = value * 3600 - nowSec;
  if (left <= 0) left += 24 * 3600;
  return start - (start % 1000) + left * 1000;
}

export const cleanReset = (mode: unknown, value: unknown): { mode: ResetMode; value: number } | null => {
  if (mode === 'daily' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23) return { mode, value };
  if (mode === 'hours' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 168) return { mode, value };
  return null;
};
