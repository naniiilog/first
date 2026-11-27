/**
 * 순서 대화: 방장이 정한 순서대로 한 명씩 말해요(서버가 지켜요).
 * - 차례가 아닌 봇은 말할 수 없고, 기다리기에서도 자기 차례가 올 때까지 깨지 않아요.
 * - 차례인 봇이 말하면 다음 사람에게 넘어가고, 끝까지 가면 처음으로 돌아가요.
 * - 쉬는 중·사용량 소진인 봇은 건너뛰고, 차례인 봇이 3분 넘게 조용하면 다음으로 넘어가요.
 * - 방장은 언제든 순서를 바꾸거나, 다음 차례로 넘기거나, 끝낼 수 있어요.
 */
import type { MemberRow } from './rooms.js';

export const TURN_TIMEOUT_MS = 3 * 60_000;

export interface TurnState {
  order: string[];
  idx: number;
  since: number;
}

export function parseTurn(r: { turn_order?: string | null; turn_idx?: number | null; turn_since?: number | null }): TurnState | null {
  if (!r.turn_order) return null;
  try {
    const order = JSON.parse(r.turn_order);
    if (!Array.isArray(order) || order.length < 1) return null;
    return { order: order.map(String), idx: Number(r.turn_idx ?? 0) || 0, since: Number(r.turn_since ?? 0) || 0 };
  } catch {
    return null;
  }
}

/** 지금 차례(쉬는 봇·없는 봇은 건너뛰고, 3분 조용하면 다음으로) */
export function currentTurn(turn: TurnState, members: Pick<MemberRow, 'id' | 'name' | 'active' | 'exhausted'>[], now = Date.now()) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const ok = (id: string) => {
    const m = byId.get(id);
    return !!m && m.active === 1 && m.exhausted !== 1;
  };
  const n = turn.order.length;
  if (!turn.order.some(ok)) return null;
  const skips = turn.since ? Math.floor(Math.max(0, now - turn.since) / TURN_TIMEOUT_MS) : 0;
  let idx = (((turn.idx + skips) % n) + n) % n;
  for (let i = 0; i < n && !ok(turn.order[idx]); i++) idx = (idx + 1) % n;
  const id = turn.order[idx];
  return { id, idx, name: byId.get(id)!.name };
}

export const turnNames = (turn: TurnState, members: Pick<MemberRow, 'id' | 'name'>[]) => {
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return turn.order.map((id) => byId.get(id) ?? '(나간 봇)');
};
