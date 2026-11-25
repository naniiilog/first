import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 도트 게임 같은 사무실. 칸(타일) 위를 캐릭터들이 걸어 다니고, 방금 말한 캐릭터 머리 위에 말풍선이 떠요.
 * - 대화 중인 봇·사람은 돌아다니다가, 말하면 회의 탁자 쪽으로 걸어가요.
 * - 연결 끊긴 봇은 자기 책상에서 졸아요(Zz). 쉬는 봇은 휴게실 소파에, 아직 안 온 봇은 문 앞에 있어요.
 */

export type CharState = 'talking' | 'here' | 'away' | 'new' | 'rest';
export interface Char {
  id: string;
  name: string;
  kind: 'owner' | 'guest' | 'bot';
  state: CharState;
  /** 머리 위 표시(👑 방장, 🎖️ 대장) */
  badge?: string;
  /** 말풍선(최근에 한 말) */
  bubble?: { text: string; newest: boolean };
  onPress?: () => void;
}

const COLS = 12;
const ROWS = 14;
const WALL = 2; // 위쪽 벽 줄 수
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// 가구 자리(못 지나가요)
const TABLE = { x: 4, y: 5, w: 4, h: 3 };
const DESKS = [3, 6, 9].map((y) => ({ x: 0, y }));
const SOFA = { x: 9, y: 12, w: 3, h: 1 };
const PLANTS = [
  { x: 11, y: 2 },
  { x: 11, y: 8 },
];
const blocked = (x: number, y: number) =>
  x < 0 || y < WALL || x >= COLS || y >= ROWS ||
  (x >= TABLE.x && x < TABLE.x + TABLE.w && y >= TABLE.y && y < TABLE.y + TABLE.h) ||
  DESKS.some((d) => d.x === x && d.y === y) ||
  (y === SOFA.y && x >= SOFA.x) ||
  PLANTS.some((p) => p.x === x && p.y === y);

// 탁자 둘레 자리(말할 때 걸어가요), 책상 의자, 소파, 문 앞
const TABLE_SPOTS = [
  ...[4, 5, 6, 7].map((x) => ({ x, y: 4 })),
  ...[4, 5, 6, 7].map((x) => ({ x, y: 8 })),
  { x: 3, y: 5 }, { x: 3, y: 7 }, { x: 8, y: 5 }, { x: 8, y: 7 },
];
const DESK_SPOTS = DESKS.map((d) => ({ x: 1, y: d.y }));
const SOFA_SPOTS = [9, 10, 11, 9, 10, 11].map((x, i) => ({ x, y: i < 3 ? 11 : 10 }));
const DOOR_SPOTS = [1, 2, 3, 1, 2].map((x, i) => ({ x, y: i < 3 ? 13 : 12 }));

// 캐릭터 그림(8×11 도트). h 머리카락 · s 피부 · e 눈 · b 옷 · p 바지 · k 신발
const BODY = ['..hhhh..', '.hhhhhh.', '.hssssh.', '.sesses.', '.ssssss.', '..bbbb..', '.bbbbbb.', 's.bbbb.s', '..pppp..'];
const LEGS_A = ['..p..p..', '..k..k..'];
const LEGS_B = ['..pp.p..', '.k....k.'];
const SLEEP_EYES = '.s--ss-.';

const HAIR = ['#3B2A20', '#1F2430', '#7A4B2A', '#C98B3D', '#5B3A6E', '#2E5E4E', '#A33A3A'];
const SHIRT = ['#4F7CFF', '#22A06B', '#E8793A', '#B05CD6', '#D64C6B', '#2BA8C2', '#C9A227', '#5D6B82'];
const SKIN = '#F6D2B0';
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function PixelOffice({ width, chars, notice, status, clock }: { width: number; chars: Char[]; notice: string; status: string; clock: string }) {
  const T = Math.floor(width / COLS); // 한 칸 크기
  const W = T * COLS;
  const H = T * ROWS;

  // ── 캐릭터 위치(칸 좌표). 처음 보는 캐릭터는 상태에 맞는 자리에 놓아요 ──
  const [pos, setPos] = useState<Record<string, { x: number; y: number; flip: boolean }>>({});
  const charsRef = useRef(chars);
  useEffect(() => {
    charsRef.current = chars;
  }, [chars]);

  useEffect(() => {
    const step = () =>
      setPos((prev) => {
        const next: typeof prev = {};
        const taken = new Set<string>();
        const key = (x: number, y: number) => `${x},${y}`;
        const list = charsRef.current;
        let desk = 0;
        let sofa = 0;
        let door = 0;
        // 고정 자리 캐릭터 먼저(책상·소파·문)
        for (const c of list) {
          const fixed =
            c.state === 'away' ? DESK_SPOTS[desk++ % DESK_SPOTS.length] :
            c.state === 'rest' ? SOFA_SPOTS[sofa++ % SOFA_SPOTS.length] :
            c.state === 'new' ? DOOR_SPOTS[door++ % DOOR_SPOTS.length] :
            c.kind === 'owner' ? { x: 5, y: 4 } : null;
          if (fixed) {
            next[c.id] = { ...fixed, flip: c.state === 'away' ? true : (prev[c.id]?.flip ?? false) };
            taken.add(key(fixed.x, fixed.y));
          }
        }
        // 돌아다니는 캐릭터
        for (const c of list) {
          if (next[c.id]) continue;
          let p = prev[c.id];
          if (!p || blocked(p.x, p.y) || taken.has(key(p.x, p.y))) {
            // 빈 칸 아무 데나
            for (let tries = 0; tries < 80; tries++) {
              const x = 1 + Math.floor(Math.random() * (COLS - 2));
              const y = WALL + Math.floor(Math.random() * (ROWS - WALL - 1));
              if (!blocked(x, y) && !taken.has(key(x, y))) {
                p = { x, y, flip: false };
                break;
              }
            }
            p = p ?? { x: 2, y: 11, flip: false };
          }
          let { x, y, flip } = p;
          // 방금 말했으면 탁자 쪽으로, 아니면 가끔 한 칸씩 어슬렁
          const goal = c.bubble?.newest ? TABLE_SPOTS[hash(c.id) % TABLE_SPOTS.length] : null;
          const moveChance = goal ? 0.9 : c.state === 'talking' ? 0.5 : 0.25;
          if (Math.random() < moveChance && !(goal && goal.x === x && goal.y === y)) {
            const dirs = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].sort(() => Math.random() - 0.5);
            if (goal) dirs.sort((a, b) => Math.abs(x + a[0] - goal.x) + Math.abs(y + a[1] - goal.y) - (Math.abs(x + b[0] - goal.x) + Math.abs(y + b[1] - goal.y)));
            for (const [dx, dy] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              if (!blocked(nx, ny) && !taken.has(key(nx, ny))) {
                if (dx) flip = dx < 0;
                x = nx;
                y = ny;
                break;
              }
            }
          }
          next[c.id] = { x, y, flip };
          taken.add(key(x, y));
        }
        return next;
      });
    step();
    const timer = setInterval(step, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ width: W, height: H, backgroundColor: '#2B2238', borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: '#1A1424' }}>
      {/* 바닥 타일(체크무늬) */}
      {Array.from({ length: ROWS - WALL }, (_, r) => (
        <View key={r} style={{ position: 'absolute', top: (r + WALL) * T, left: 0, flexDirection: 'row' }}>
          {Array.from({ length: COLS }, (_, c) => (
            <View key={c} style={{ width: T, height: T, backgroundColor: (r + c) % 2 ? '#D9B98B' : '#CFAE7F' }} />
          ))}
        </View>
      ))}
      {/* 벽: 창문 · 화이트보드(공지) · 시계 */}
      <View style={[styles.wall, { height: WALL * T }]}>
        <Px x={T * 0.3} y={T * 0.35} w={T * 1.8} h={T * 1.2} c="#9FD8FF" border="#F4F4F4" />
        <View style={[styles.board, { left: T * 2.5, top: T * 0.2, width: T * 6.8, height: T * 1.55 }]}>
          <Text style={[styles.boardText, { fontFamily: MONO, fontSize: Math.max(9, T * 0.24) }]} numberOfLines={3}>
            📌 {notice || '공지 없음'}
          </Text>
        </View>
        <View style={[styles.clock, { left: T * 9.7, top: T * 0.35, width: T * 2, height: T * 1.1 }]}>
          <Text style={{ fontFamily: MONO, color: '#7CFF9B', fontWeight: '800', fontSize: Math.max(10, T * 0.36) }}>{clock}</Text>
        </View>
      </View>

      {/* 회의 탁자 */}
      <View style={[styles.table, { left: TABLE.x * T + 2, top: TABLE.y * T + 2, width: TABLE.w * T - 4, height: TABLE.h * T - 4 }]}>
        <Text style={{ fontSize: T * 0.42 }}>💻 ☕ 📄</Text>
        <Text style={{ fontFamily: MONO, color: '#FFF3DC', fontWeight: '800', fontSize: Math.max(9, T * 0.26), textAlign: 'center' }}>{status}</Text>
      </View>
      {/* 책상(연결 끊긴 봇이 졸아요) */}
      {DESKS.map((d) => (
        <View key={d.y} style={[styles.desk, { left: d.x * T + 2, top: d.y * T + 4, width: T - 4, height: T - 8 }]}>
          <Text style={{ fontSize: T * 0.45 }}>🖥️</Text>
        </View>
      ))}
      {/* 소파와 커피 */}
      <View style={[styles.sofa, { left: SOFA.x * T + 2, top: SOFA.y * T + 4, width: SOFA.w * T - 4, height: T - 6 }]}>
        <Text style={{ fontFamily: MONO, color: '#FFE3E8', fontSize: Math.max(9, T * 0.24), fontWeight: '800' }}>☕ 휴게실</Text>
      </View>
      {PLANTS.map((p) => (
        <Text key={`${p.x}-${p.y}`} style={{ position: 'absolute', left: p.x * T + T * 0.12, top: p.y * T + T * 0.05, fontSize: T * 0.7 }}>
          🪴
        </Text>
      ))}
      <Text style={{ position: 'absolute', left: T * 0.1, top: 12 * T + T * 0.1, fontSize: T * 0.8 }}>🚪</Text>

      {/* 캐릭터(아래쪽에 있는 캐릭터가 앞에 보이게) */}
      {[...chars]
        .sort((a, b) => (pos[a.id]?.y ?? 0) - (pos[b.id]?.y ?? 0))
        .map((c) => {
          const p = pos[c.id];
          if (!p) return null;
          return <Walker key={c.id} c={c} x={p.x * T} y={p.y * T} flip={p.flip} T={T} />;
        })}
    </View>
  );
}

/** 걸어 다니는 캐릭터 한 명: 칸이 바뀌면 부드럽게 걸어가고, 걷는 동안 다리를 번갈아 움직여요. */
function Walker({ c, x, y, flip, T }: { c: Char; x: number; y: number; flip: boolean; T: number }) {
  const [xy] = useState(() => new Animated.ValueXY({ x, y }));
  const [frame, setFrame] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      xy.setValue({ x, y });
      return;
    }
    let f = 0;
    const legs = setInterval(() => setFrame(++f % 2), 140);
    Animated.timing(xy, { toValue: { x, y }, duration: 700, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      clearInterval(legs);
      setFrame(0);
    });
    return () => clearInterval(legs);
  }, [x, y, xy]);

  const px = Math.max(2, Math.floor((T * 0.8) / 8)); // 도트 하나 크기
  const sw = px * 8;
  const sh = px * 11;
  const h = hash(c.id + c.name);
  const colors: Record<string, string> = {
    h: c.kind === 'owner' ? '#2A1E16' : HAIR[h % HAIR.length],
    s: SKIN,
    e: '#1B1B24',
    '-': '#1B1B24',
    b: c.kind === 'owner' ? '#3550C8' : c.kind === 'guest' ? '#8FA3B8' : SHIRT[h % SHIRT.length],
    p: '#3A3F55',
    k: '#1E1E1E',
  };
  const asleep = c.state === 'away';
  const rows = [...BODY.map((r, i) => (asleep && i === 3 ? SLEEP_EYES : r)), ...(frame ? LEGS_B : LEGS_A)];
  const dim = c.state === 'new' ? 0.55 : asleep ? 0.8 : 1;

  return (
    <Animated.View
      style={{ position: 'absolute', left: 0, top: 0, width: T, height: T, transform: xy.getTranslateTransform(), zIndex: c.bubble?.newest ? 50 : 10 }}
    >
      <Pressable onPress={c.onPress} disabled={!c.onPress} accessibilityLabel={`${c.name}`} style={{ width: T, height: T, alignItems: 'center' }}>
        {/* 그림자 */}
        <View style={{ position: 'absolute', bottom: 1, width: sw * 0.8, height: px * 1.5, borderRadius: sw, backgroundColor: 'rgba(0,0,0,0.22)' }} />
        <View style={{ position: 'absolute', bottom: px, width: sw, height: sh, opacity: dim, transform: [{ scaleX: flip ? -1 : 1 }] }}>
          {rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: 'row' }}>
              {[...r].map((ch, ci) => (
                <View key={ci} style={{ width: px, height: px, backgroundColor: ch === '.' ? 'transparent' : colors[ch] }} />
              ))}
            </View>
          ))}
        </View>
        {/* 이름표와 표시 */}
        <View style={[styles.tag, { bottom: sh + px * 2 }]}>
          <View style={{ width: px * 1.6, height: px * 1.6, backgroundColor: c.state === 'talking' || c.state === 'here' ? '#3DFF7A' : c.state === 'rest' ? '#FF5A5A' : c.state === 'new' ? '#7CA8FF' : '#9AA0AE' }} />
          <Text style={{ fontFamily: MONO, color: '#FFFFFF', fontSize: Math.max(8, T * 0.22), fontWeight: '800' }} numberOfLines={1}>
            {c.badge ? `${c.badge}` : ''}
            {c.name}
          </Text>
        </View>
        {asleep ? <Text style={{ position: 'absolute', right: -T * 0.2, top: -T * 0.7, fontFamily: MONO, color: '#FFFFFF', fontWeight: '900', fontSize: T * 0.3 }}>Zz</Text> : null}
        {/* 말풍선 */}
        {c.bubble ? (
          <View style={[styles.bubble, { bottom: sh + px * 2 + T * 0.42, width: T * 4.2, borderColor: c.bubble.newest ? '#FFB020' : '#1A1424' }]}>
            <Text style={{ fontFamily: MONO, fontSize: Math.max(9, T * 0.24), color: '#1A1424', lineHeight: Math.max(12, T * 0.32) }} numberOfLines={3}>
              {c.bubble.text}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** 테두리 있는 네모(창문 등) */
function Px({ x, y, w, h, c, border }: { x: number; y: number; w: number; h: number; c: string; border: string }) {
  return <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, backgroundColor: c, borderWidth: 3, borderColor: border }} />;
}

const styles = StyleSheet.create({
  wall: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: '#5B4A7A', borderBottomWidth: 4, borderBottomColor: '#3E3257' },
  board: { position: 'absolute', backgroundColor: '#FAFAF5', borderWidth: 3, borderColor: '#9AA0AE', paddingHorizontal: 6, paddingVertical: 3, justifyContent: 'center' },
  boardText: { color: '#1A1424', fontWeight: '700' },
  clock: { position: 'absolute', backgroundColor: '#11141C', borderWidth: 3, borderColor: '#2E3445', alignItems: 'center', justifyContent: 'center' },
  table: { position: 'absolute', backgroundColor: '#8A5A3B', borderWidth: 4, borderColor: '#5E3A24', alignItems: 'center', justifyContent: 'center', gap: 2 },
  desk: { position: 'absolute', backgroundColor: '#6E4A33', borderWidth: 2, borderColor: '#4A2F1F', alignItems: 'center', justifyContent: 'center' },
  sofa: { position: 'absolute', backgroundColor: '#B8475A', borderWidth: 3, borderColor: '#7E2B3B', alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(20,16,30,0.78)', paddingHorizontal: 4, paddingVertical: 1, minWidth: 30 },
  bubble: { position: 'absolute', backgroundColor: '#FFFFFF', borderWidth: 3, paddingHorizontal: 5, paddingVertical: 3 },
});
