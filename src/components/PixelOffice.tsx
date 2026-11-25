import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 도트 게임 같은 사무실(그림: Kenney "RPG Urban Pack"·"Roguelike Indoors", CC0).
 * - 대화 중인 봇·사람은 사무실을 걸어 다니다가, 말하면 회의 탁자 의자로 가서 앉아요.
 * - 연결 끊긴 봇은 왼쪽 책상에서 졸고(Zz), 쉬는 봇은 휴게실 벤치에, 아직 안 온 봇은 문 앞에 있어요.
 */

export type CharState = 'talking' | 'here' | 'away' | 'new' | 'rest';
export interface Char {
  id: string;
  name: string;
  kind: 'owner' | 'guest' | 'bot';
  state: CharState;
  /** 이름 앞 표시(👑 방장, 🎖️ 대장) */
  badge?: string;
  /** 캐릭터 그림 번호(0~29). 방 안에서 겹치지 않게 office 화면이 정해줘요 */
  skin?: number;
  /** 말풍선(최근에 한 말) */
  bubble?: { text: string; newest: boolean };
  onPress?: () => void;
}

const ROOM = require('../../assets/office/room.png');
const PEOPLE = require('../../assets/office/people.png');

const COLS = 14;
const ROWS = 16;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type Dir = 'left' | 'down' | 'up' | 'right';
const DIR_COL: Record<Dir, number> = { left: 0, down: 1, up: 2, right: 3 };
interface Spot {
  x: number;
  y: number;
  dir: Dir;
}

// 못 지나가는 칸: 벽·테두리·탁자·책상·화분·책장·자판기·벤치
const BLOCK = new Set<string>([
  ...[5, 6, 7, 8].flatMap((x) => [`${x},6`, `${x},7`]),
  '1,4', '1,7', '1,10', '1,3', '12,3', '12,8', '10,3', '11,3', '12,9', '12,10',
  ...[10, 11, 12].flatMap((x) => [`${x},13`, `${x},14`]),
]);
const blocked = (x: number, y: number) => x < 1 || x > 12 || y < 3 || y > 14 || BLOCK.has(`${x},${y}`);

// 방장 자리(탁자 위쪽 가운데), 탁자 의자, 책상 의자, 휴게실 벤치, 문 앞
const OWNER_SPOT: Spot = { x: 6, y: 5, dir: 'down' };
const TABLE_SPOTS: Spot[] = [
  { x: 5, y: 5, dir: 'down' }, { x: 7, y: 5, dir: 'down' }, { x: 8, y: 5, dir: 'down' },
  { x: 5, y: 8, dir: 'up' }, { x: 6, y: 8, dir: 'up' }, { x: 7, y: 8, dir: 'up' }, { x: 8, y: 8, dir: 'up' },
  { x: 4, y: 6, dir: 'right' }, { x: 4, y: 7, dir: 'right' }, { x: 9, y: 6, dir: 'left' }, { x: 9, y: 7, dir: 'left' },
];
const DESK_SPOTS: Spot[] = [4, 7, 10].map((y) => ({ x: 2, y, dir: 'left' as Dir }));
const REST_SPOTS: Spot[] = [10, 11, 12, 10, 11, 12].map((x, i) => ({ x, y: i < 3 ? 13 : 14, dir: 'down' as Dir }));
const DOOR_SPOTS: Spot[] = [3, 4, 2, 3, 4].map((x, i) => ({ x, y: i < 3 ? 14 : 13, dir: 'up' as Dir }));

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 캐릭터 그림: 기본 6명 × 색 5가지 = 30가지(그림판에서 가로 6묶음 × 세로 5묶음) */
export const SKINS = 30;
export const OWNER_SKIN = 5;
const skinOf = (c: Char) => (c.kind === 'owner' ? OWNER_SKIN : (c.skin ?? hash(c.id)) % SKINS);

export function PixelOffice({ width, chars, notice, status, clock }: { width: number; chars: Char[]; notice: string; status: string; clock: string }) {
  const T = Math.floor(width / COLS);
  const W = T * COLS;
  const H = T * ROWS;

  const [pos, setPos] = useState<Record<string, Spot & { sit: boolean }>>({});
  const charsRef = useRef(chars);
  useEffect(() => {
    charsRef.current = chars;
  }, [chars]);

  // 0.9초마다 한 걸음: 고정 자리 캐릭터는 제자리, 대화 중인 캐릭터는 어슬렁, 방금 말한 캐릭터는 탁자 의자로
  useEffect(() => {
    const step = () =>
      setPos((prev) => {
        const next: typeof prev = {};
        const taken = new Set<string>();
        const k = (x: number, y: number) => `${x},${y}`;
        let desk = 0;
        let rest = 0;
        let door = 0;
        const list = charsRef.current;
        for (const c of list) {
          const fixed =
            c.kind === 'owner' ? OWNER_SPOT :
            c.state === 'away' ? DESK_SPOTS[desk++ % DESK_SPOTS.length] :
            c.state === 'rest' ? REST_SPOTS[rest++ % REST_SPOTS.length] :
            c.state === 'new' ? DOOR_SPOTS[door++ % DOOR_SPOTS.length] : null;
          if (fixed) {
            next[c.id] = { ...fixed, sit: c.state !== 'new' };
            taken.add(k(fixed.x, fixed.y));
          }
        }
        for (const c of list) {
          if (next[c.id]) continue;
          let p: (Spot & { sit: boolean }) | undefined = prev[c.id];
          if (!p || taken.has(k(p.x, p.y)) || (blocked(p.x, p.y) && !TABLE_SPOTS.some((s) => s.x === p!.x && s.y === p!.y))) {
            p = undefined;
            for (let tries = 0; tries < 100 && !p; tries++) {
              const x = 1 + Math.floor(Math.random() * 12);
              const y = 3 + Math.floor(Math.random() * 12);
              if (!blocked(x, y) && !taken.has(k(x, y))) p = { x, y, dir: 'down', sit: false };
            }
            p = p ?? { x: 5, y: 11, dir: 'down', sit: false };
          }
          let { x, y, dir } = p;
          const goal = c.bubble?.newest ? TABLE_SPOTS[hash(c.id) % TABLE_SPOTS.length] : null;
          const atGoal = !!goal && goal.x === x && goal.y === y;
          if (!atGoal && Math.random() < (goal ? 0.95 : c.state === 'talking' ? 0.45 : 0.2)) {
            const moves: [number, number, Dir][] = [
              [1, 0, 'right'],
              [-1, 0, 'left'],
              [0, 1, 'down'],
              [0, -1, 'up'],
            ];
            moves.sort(() => Math.random() - 0.5);
            if (goal) moves.sort((a, b) => Math.abs(x + a[0] - goal.x) + Math.abs(y + a[1] - goal.y) - (Math.abs(x + b[0] - goal.x) + Math.abs(y + b[1] - goal.y)));
            for (const [dx, dy, d] of moves) {
              const nx = x + dx;
              const ny = y + dy;
              const isGoal = !!goal && goal.x === nx && goal.y === ny;
              if ((isGoal || !blocked(nx, ny)) && !taken.has(k(nx, ny))) {
                x = nx;
                y = ny;
                dir = d;
                break;
              }
            }
          }
          const seated = !!goal && goal.x === x && goal.y === y;
          next[c.id] = { x, y, dir: seated ? goal!.dir : dir, sit: seated };
          taken.add(k(x, y));
        }
        return next;
      });
    step();
    const timer = setInterval(step, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ width: W, height: H, borderRadius: 6, overflow: 'hidden', borderWidth: 3, borderColor: '#1A1424', backgroundColor: '#1A1424' }}>
      <Image source={ROOM} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} resizeMode="stretch" />
      {/* 화이트보드(공지)와 시계 */}
      <View style={[styles.board, { left: T * 3.3, top: T * 0.25, width: T * 6.4, height: T * 1.35 }]}>
        <Text style={{ fontFamily: MONO, color: '#1A1424', fontWeight: '700', fontSize: Math.max(9, T * 0.27), lineHeight: Math.max(12, T * 0.36) }} numberOfLines={3}>
          📌 {notice || '공지 없음'}
        </Text>
      </View>
      <View style={[styles.clock, { left: T * 9.85, top: T * 0.4, width: T * 1.05, height: T * 0.8 }]}>
        <Text style={{ fontFamily: MONO, color: '#7CFF9B', fontWeight: '800', fontSize: Math.max(8, T * 0.24) }}>{clock}</Text>
      </View>
      {/* 탁자 위 상태 */}
      <View style={[styles.status, { left: T * 5.2, top: T * 6.62, width: T * 3.6 }]}>
        <Text style={{ fontFamily: MONO, color: '#FFFFFF', fontWeight: '800', fontSize: Math.max(8, T * 0.26), textAlign: 'center' }} numberOfLines={1}>
          {status}
        </Text>
      </View>

      {/* 캐릭터(아래쪽이 앞에 보이게) */}
      {[...chars]
        .sort((a, b) => (pos[a.id]?.y ?? 0) - (pos[b.id]?.y ?? 0))
        .map((c) => {
          const p = pos[c.id];
          if (!p) return null;
          return <Walker key={c.id} c={c} p={p} T={T} />;
        })}
    </View>
  );
}

/** 걸어 다니는 캐릭터: 칸이 바뀌면 부드럽게 걸어가며 걷는 그림을 번갈아 보여줘요. */
function Walker({ c, p, T }: { c: Char; p: Spot & { sit: boolean }; T: number }) {
  const [xy] = useState(() => new Animated.ValueXY({ x: p.x * T, y: p.y * T }));
  const [frame, setFrame] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const to = { x: p.x * T, y: p.y * T };
    if (first.current) {
      first.current = false;
      xy.setValue(to);
      return;
    }
    let f = 0;
    const legs = setInterval(() => setFrame((++f % 2) + 1), 150);
    Animated.timing(xy, { toValue: to, duration: 720, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      clearInterval(legs);
      setFrame(0);
    });
    return () => clearInterval(legs);
  }, [p.x, p.y, T, xy]);

  const Z = Math.round(T * 1.4);
  const skin = skinOf(c);
  const row = Math.floor(skin / 6) * 3 + frame;
  const col = (skin % 6) * 4 + DIR_COL[p.dir];
  const asleep = c.state === 'away';
  const dot = c.state === 'talking' || c.state === 'here' ? '#3DFF7A' : c.state === 'rest' ? '#FF5A5A' : c.state === 'new' ? '#7CA8FF' : '#9AA0AE';

  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: T, height: T, transform: xy.getTranslateTransform(), zIndex: c.bubble?.newest ? 50 : 10 }}>
      <Pressable onPress={c.onPress} disabled={!c.onPress} accessibilityLabel={c.name} style={{ width: T, height: T }}>
        {/* 캐릭터 그림(그림판에서 한 칸만 잘라 보여줘요) */}
        {/* 칸보다 조금 크게(1.4배) 그려서 잘 보이게, 발이 칸 아래에 닿게 */}
        <View style={{ position: 'absolute', left: -(Z - T) / 2, top: -(Z - T) - (p.sit ? T * 0.12 : 0), width: Z, height: Z, overflow: 'hidden', opacity: c.state === 'new' ? 0.6 : 1 }}>
          <Image source={PEOPLE} style={{ position: 'absolute', width: Z * 24, height: Z * 15, left: -col * Z, top: -row * Z }} resizeMode="stretch" />
        </View>
        {/* 이름표 */}
        <View style={[styles.tag, { top: -(Z - T) - T * 0.42 }]}>
          <View style={{ width: Math.max(4, T * 0.16), height: Math.max(4, T * 0.16), backgroundColor: dot }} />
          <Text style={{ fontFamily: MONO, color: '#FFFFFF', fontSize: Math.max(8, T * 0.24), fontWeight: '800' }} numberOfLines={1}>
            {c.badge ?? ''}
            {c.name}
          </Text>
        </View>
        {asleep ? <Text style={{ position: 'absolute', right: -T * 0.3, top: -T * 0.85, fontFamily: MONO, color: '#FFFFFF', fontWeight: '900', fontSize: T * 0.32 }}>Zz</Text> : null}
        {/* 말풍선 */}
        {c.bubble ? (
          <View style={[styles.bubble, { bottom: T * 1.9, width: T * 4.4, left: -T * 1.7, borderColor: c.bubble.newest ? '#FFB020' : '#1A1424' }]}>
            <Text style={{ fontFamily: MONO, fontSize: Math.max(9, T * 0.26), color: '#1A1424', lineHeight: Math.max(12, T * 0.34) }} numberOfLines={3}>
              {c.bubble.text}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: { position: 'absolute', backgroundColor: '#FAFAF5', borderWidth: 3, borderColor: '#9AA0AE', paddingHorizontal: 6, paddingVertical: 2, justifyContent: 'center' },
  clock: { position: 'absolute', backgroundColor: '#11141C', borderWidth: 2, borderColor: '#2E3445', alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', backgroundColor: 'rgba(30,20,40,0.55)', paddingVertical: 1, borderRadius: 3 },
  tag: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(20,16,30,0.78)', paddingHorizontal: 4, paddingVertical: 1 },
  bubble: { position: 'absolute', backgroundColor: '#FFFFFF', borderWidth: 3, paddingHorizontal: 5, paddingVertical: 3 },
});
