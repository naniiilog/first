import { useEffect, useRef, useState } from 'react';
import { Animated, Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 도트 게임 같은 사무실(가구·캐릭터 그림: Kenney "RPG Urban Pack"·"Roguelike Indoors", CC0).
 * 그림이 흐리지 않게, 화면의 실제 점(픽셀) 수에 딱 맞는 배율(2~6배) 그림을 골라 그대로 그려요.
 * - 대화 중인 봇·사람은 걸어 다니다가, 말하면 회의 탁자 의자로 가서 앉아요.
 * - 연결 끊긴 봇은 왼쪽 책상에서 졸고, 쉬는 봇은 휴게실 벤치에, 아직 안 온 봇은 문 앞에 있어요.
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

/** 배율별 그림(배경 160×192점, 캐릭터 384×240점을 정수배로 키운 것) */
const ROOM: Record<number, number> = {
  2: require('../../assets/office/room2.png'),
  3: require('../../assets/office/room3.png'),
  4: require('../../assets/office/room4.png'),
  5: require('../../assets/office/room5.png'),
  6: require('../../assets/office/room6.png'),
};
const PEOPLE: Record<number, number> = {
  2: require('../../assets/office/people2.png'),
  3: require('../../assets/office/people3.png'),
  4: require('../../assets/office/people4.png'),
  5: require('../../assets/office/people5.png'),
  6: require('../../assets/office/people6.png'),
};

const COLS = 10;
const ROWS = 12;

type Dir = 'left' | 'down' | 'up' | 'right';
const DIR_COL: Record<Dir, number> = { left: 0, down: 1, up: 2, right: 3 };
interface Spot {
  x: number;
  y: number;
  dir: Dir;
}

// 못 지나가는 칸: 탁자·책상·화분·책장·자판기·벤치
const BLOCK = new Set<string>([
  ...[3, 4, 5, 6].flatMap((x) => [`${x},5`, `${x},6`]),
  '0,3', '0,6', '0,9', '0,2', '8,2', '9,2', '9,5', '9,6',
  ...[7, 8, 9].flatMap((x) => [`${x},10`, `${x},11`]),
]);
const blocked = (x: number, y: number) => x < 0 || x > 9 || y < 2 || y > 11 || BLOCK.has(`${x},${y}`);

const OWNER_SPOT: Spot = { x: 4, y: 4, dir: 'down' };
const TABLE_SPOTS: Spot[] = [
  { x: 3, y: 4, dir: 'down' }, { x: 5, y: 4, dir: 'down' }, { x: 6, y: 4, dir: 'down' },
  { x: 3, y: 7, dir: 'up' }, { x: 4, y: 7, dir: 'up' }, { x: 5, y: 7, dir: 'up' }, { x: 6, y: 7, dir: 'up' },
  { x: 2, y: 5, dir: 'right' }, { x: 2, y: 6, dir: 'right' }, { x: 7, y: 5, dir: 'left' }, { x: 7, y: 6, dir: 'left' },
];
const DESK_SPOTS: Spot[] = [3, 6, 9].map((y) => ({ x: 1, y, dir: 'left' as Dir }));
const REST_SPOTS: Spot[] = [7, 8, 9, 7, 8, 9].map((x, i) => ({ x, y: i < 3 ? 10 : 11, dir: 'down' as Dir }));
const DOOR_SPOTS: Spot[] = [2, 3, 4, 2, 3].map((x, i) => ({ x, y: i < 3 ? 11 : 10, dir: 'up' as Dir }));
const isSeat = (x: number, y: number) => TABLE_SPOTS.some((s) => s.x === x && s.y === y);

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 캐릭터 그림: 기본 6명 × 색 5가지 = 30가지(그림판에서 가로 6묶음 × 세로 5묶음) */
export const SKINS = 30;
export const OWNER_SKIN = 5;
const skinOf = (c: Char) => (c.kind === 'owner' ? OWNER_SKIN : (c.skin ?? hash(c.id)) % SKINS);

/** 이 너비(dp)에 들어가는 가장 큰 정수 배율과 그때 한 칸 크기(dp) */
export function officeScale(maxWidth: number) {
  const ratio = PixelRatio.get();
  const k = Math.max(2, Math.min(6, Math.floor((maxWidth * ratio) / (COLS * 16))));
  return { k, T: (16 * k) / ratio };
}

export function PixelOffice({ maxWidth, chars, notice, status, clock }: { maxWidth: number; chars: Char[]; notice: string; status: string; clock: string }) {
  const { k, T } = officeScale(maxWidth);
  const W = T * COLS;
  const H = T * ROWS;

  const [pos, setPos] = useState<Record<string, Spot & { sit: boolean }>>({});
  const charsRef = useRef(chars);
  useEffect(() => {
    charsRef.current = chars;
  }, [chars]);

  // 0.9초마다 한 걸음
  useEffect(() => {
    const step = () =>
      setPos((prev) => {
        const next: typeof prev = {};
        const taken = new Set<string>();
        const key = (x: number, y: number) => `${x},${y}`;
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
            taken.add(key(fixed.x, fixed.y));
          }
        }
        for (const c of list) {
          if (next[c.id]) continue;
          let p: (Spot & { sit: boolean }) | undefined = prev[c.id];
          if (!p || taken.has(key(p.x, p.y)) || (blocked(p.x, p.y) && !isSeat(p.x, p.y))) {
            p = undefined;
            for (let tries = 0; tries < 100 && !p; tries++) {
              const x = Math.floor(Math.random() * COLS);
              const y = 2 + Math.floor(Math.random() * (ROWS - 2));
              if (!blocked(x, y) && !isSeat(x, y) && !taken.has(key(x, y))) p = { x, y, dir: 'down', sit: false };
            }
            p = p ?? { x: 4, y: 9, dir: 'down', sit: false };
          }
          let { x, y, dir } = p;
          const goal = c.bubble?.newest ? TABLE_SPOTS[hash(c.id) % TABLE_SPOTS.length] : null;
          const atGoal = !!goal && goal.x === x && goal.y === y;
          if (!atGoal && Math.random() < (goal ? 0.95 : c.state === 'talking' ? 0.4 : 0.2)) {
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
              const ok = goal && goal.x === nx && goal.y === ny ? true : !blocked(nx, ny) && !isSeat(nx, ny);
              if (ok && !taken.has(key(nx, ny))) {
                x = nx;
                y = ny;
                dir = d;
                break;
              }
            }
          }
          const seated = !!goal && goal.x === x && goal.y === y;
          next[c.id] = { x, y, dir: seated ? goal!.dir : dir, sit: seated };
          taken.add(key(x, y));
        }
        return next;
      });
    step();
    const timer = setInterval(step, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ width: W, height: H, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E2DACE' }}>
      <Image source={ROOM[k]} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} fadeDuration={0} />
      {/* 화이트보드(공지)와 벽시계 */}
      <View style={[styles.board, { left: T * 2.6, top: T * 0.22, width: T * 4.9, height: T * 1.3 }]}>
        <Text style={[styles.boardText, { fontSize: Math.max(10, T * 0.3), lineHeight: Math.max(13, T * 0.4) }]} numberOfLines={3}>
          📌 {notice || '공지 없음'}
        </Text>
      </View>
      <View style={[styles.clock, { left: T * 8.1, top: T * 0.3, width: T * 1.4, height: T * 0.75 }]}>
        <Text style={{ color: '#3B3B3B', fontWeight: '800', fontSize: Math.max(9, T * 0.3) }}>{clock}</Text>
      </View>
      {/* 탁자 위 상태 */}
      <View style={[styles.status, { left: T * 3.25, top: T * 5.62, width: T * 3.5 }]}>
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: Math.max(9, T * 0.27), textAlign: 'center' }} numberOfLines={1}>
          {status}
        </Text>
      </View>

      {[...chars]
        .sort((a, b) => (pos[a.id]?.y ?? 0) - (pos[b.id]?.y ?? 0))
        .map((c) => {
          const p = pos[c.id];
          if (!p) return null;
          return <Walker key={c.id} c={c} p={p} T={T} k={k} W={W} />;
        })}
    </View>
  );
}

/** 걸어 다니는 캐릭터 */
function Walker({ c, p, T, k, W }: { c: Char; p: Spot & { sit: boolean }; T: number; k: number; W: number }) {
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

  const skin = skinOf(c);
  const row = Math.floor(skin / 6) * 3 + frame;
  const col = (skin % 6) * 4 + DIR_COL[p.dir];
  const asleep = c.state === 'away';
  const dot = c.state === 'talking' || c.state === 'here' ? '#22C55E' : c.state === 'rest' ? '#EF4444' : c.state === 'new' ? '#60A5FA' : '#9CA3AF';
  // 말풍선이 방 밖으로 잘리지 않게: 풍선 칸을 방 안으로 밀고, 꼬리는 늘 캐릭터 머리 위를 가리켜요
  const bw = Math.min(T * 6, W - 8);
  const me = p.x * T;
  const wrapLeft = Math.max(4, Math.min(W - bw - 4, me + T / 2 - bw / 2)) - me;
  const align = me + T / 2 - bw / 2 < 4 ? 'flex-start' : me + T / 2 + bw / 2 > W - 4 ? 'flex-end' : 'center';
  const tailLeft = T / 2 - wrapLeft - 5;
  // 앉으면 2점만 위로(정수 점 단위라 흐려지지 않아요)
  const lift = p.sit ? -(k / PixelRatio.get()) * 2 : 0;

  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: T, height: T, transform: xy.getTranslateTransform(), zIndex: c.bubble?.newest ? 50 : c.bubble ? 40 : 10 }}>
      <Pressable onPress={c.onPress} disabled={!c.onPress} accessibilityLabel={c.name} style={{ width: T, height: T }}>
        <View style={{ position: 'absolute', left: 0, top: lift, width: T, height: T, overflow: 'hidden', opacity: c.state === 'new' ? 0.6 : 1 }}>
          <Image source={PEOPLE[k]} fadeDuration={0} style={{ position: 'absolute', width: T * 24, height: T * 15, left: -col * T, top: -row * T }} />
        </View>
        {/* 이름표: 머리 바로 위, 가운데 */}
        <View
          style={[
            styles.tagWrap,
            {
              width: T * 4,
              left: Math.max(2, Math.min(W - T * 4 - 2, me - T * 1.5)) - me,
              bottom: T + 1,
              alignItems: me - T * 1.5 < 2 ? 'flex-start' : me + T * 2.5 > W - 2 ? 'flex-end' : 'center',
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.tag}>
            <View style={[styles.tagDot, { backgroundColor: dot }]} />
            <Text style={[styles.tagText, { fontSize: Math.max(9, T * 0.27) }]} numberOfLines={1}>
              {c.badge ?? ''}
              {c.name}
            </Text>
          </View>
        </View>
        {asleep ? <Text style={[styles.zz, { right: -T * 0.25, top: -T * 0.55, fontSize: Math.max(10, T * 0.3) }]}>z z</Text> : null}
        {/* 말풍선: 글 길이에 맞춰 늘어나는 둥근 풍선, 꼬리가 말한 사람을 가리켜요 */}
        {c.bubble ? (
          <View style={[styles.bubbleWrap, { width: bw, left: wrapLeft, bottom: T + Math.max(16, T * 0.5) + 2, alignItems: align }]} pointerEvents="none">
            <View style={[styles.bubble, c.bubble.newest && styles.bubbleNew, { maxWidth: bw }]}>
              <Text style={[styles.bubbleText, { fontSize: Math.max(11, T * 0.32), lineHeight: Math.max(15, T * 0.44) }]} numberOfLines={3}>
                {c.bubble.text}
              </Text>
            </View>
            <View style={[styles.tail, c.bubble.newest && styles.tailNew, { position: 'absolute', bottom: -5, left: tailLeft }]} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 2, borderColor: '#B9B2A6', paddingHorizontal: 6, paddingVertical: 2, justifyContent: 'center' },
  boardText: { color: '#2B2B2B', fontWeight: '600' },
  clock: { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 6, borderWidth: 2, borderColor: '#B9B2A6', alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', backgroundColor: 'rgba(60,35,20,0.55)', paddingVertical: 2, borderRadius: 999 },
  tagWrap: { position: 'absolute', alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(17,24,39,0.72)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { color: '#FFFFFF', fontWeight: '700' },
  zz: { position: 'absolute', color: '#6B7280', fontWeight: '900', fontStyle: 'italic' },
  bubbleWrap: { position: 'absolute', alignItems: 'center' },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bubbleNew: { borderColor: '#F5B544', borderWidth: 2 },
  bubbleText: { color: '#1F2937' },
  // 꼬리: 45° 돌린 작은 네모를 풍선 아래 가운데에 반쯤 겹쳐요
  tail: { width: 10, height: 10, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.08)', elevation: 4 },
  tailNew: { borderColor: '#F5B544', borderRightWidth: 2, borderBottomWidth: 2 },
});
