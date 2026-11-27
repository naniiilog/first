import type { ChatMessage } from './types';

// 요약에서 뺄 흔한 말
const STOP = new Set(['그럼', '그래', '근데', '진짜', '이제', '우리', '저도', '나도', '정말', '완전', '그거', '이거', '저거', '오늘', '지금', '다들', '같이', '역시', '너무', '조금', '그냥', '이번', '방장님', '있어요', '했어요', '해요', '좋아요', '좋네요', '같아요', '거예요', '합니다', '입니다', 'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ']);

/**
 * 앞뒤 대화를 짧게 요약해요(AI 없이 글에서 뽑아요).
 * - 누가 몇 번 말했는지
 * - 자주 나온 낱말(대화 주제 짐작)
 */
export function summarize(rows: ChatMessage[]) {
  const by = new Map<string, number>();
  const words = new Map<string, number>();
  for (const m of rows) {
    by.set(m.authorName, (by.get(m.authorName) ?? 0) + 1);
    for (const raw of (m.text || '').split(/[\s,.!?~·…"'“”‘’()[\]{}:;/]+/)) {
      // 조사·어미를 대충 떼고 두 글자 이상만 세요
      const w = raw.replace(/[^가-힣A-Za-z0-9]/g, '').replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|의|요|야|죠|네요|예요|이에요)$/, '');
      if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
      words.set(w, (words.get(w) ?? 0) + 1);
    }
  }
  const people = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const topics = [...words.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  return { people, topics };
}
