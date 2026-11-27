const pad = (n: number) => String(n).padStart(2, '0');

/** 2026/11/21 17:24:05 (메시지 옆 시간) */
export function stamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 오후 3:07 */
export function clock(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`;
}

/** 2026년 11월 21일 토요일 */
export function fullDate(ts: number): string {
  const d = new Date(ts);
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${day}요일`;
}

export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
export const sameMinute = (a: number, b: number) => Math.floor(a / 60_000) === Math.floor(b / 60_000);

/** 채팅 목록용: 오늘이면 시간, 어제면 '어제', 그 외엔 날짜 */
export function listTime(ts: number): string {
  const now = Date.now();
  if (sameDay(ts, now)) return clock(ts);
  if (sameDay(ts, now - 86_400_000)) return '어제';
  const d = new Date(ts);
  return d.getFullYear() === new Date(now).getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
