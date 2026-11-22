/**
 * 봇 사용량: 다봇이 셀 수 있는 것만 세요.
 * - 방 확인(도구 호출) 횟수, 보낸 메시지 수
 * - 다봇이 봇에게 준 글자 수(읽은 양), 봇이 보낸 글자 수(쓴 양)
 * 각 AI 앱의 실제 남은 한도는 그 회사만 알아서 여기서는 알 수 없어요.
 *
 * 대시보드는 '오늘(방 시간대 0시부터)' 사용량을 보여줘요.
 * (주기 계산은 daily/hours 둘 다 되지만, 지금은 모두 매일 0시예요.)
 */
export type ResetMode = 'daily' | 'hours';

export const DEFAULT_RESET: { mode: ResetMode; value: number } = { mode: 'daily', value: 0 };

/** 대시보드는 '오늘(0시부터)' 사용량을 보여줘요. */
export const resetForKind = (_kind: string) => DEFAULT_RESET;

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
