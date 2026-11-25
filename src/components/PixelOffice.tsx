import { useFonts } from 'expo-font';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * 도트 게임 같은 사무실.
 * 배경: 방장이 AI로 만든 사무실 그림(1672×941점). 캐릭터: 방장이 AI로 만든 한 사람 그림을 머리·넥타이 색만 바꾼 30가지.
 * - 대화 중인 봇·사람은 통로를 따라 걸어 다니다가, 말하면 회의실 의자로 가서 앉아요.
 * - 연결 끊긴 봇(z z)과 쉬는·사용량 다 쓴 봇은 라운지 소파·빈백에 앉아 있고, 아직 안 온 봇은 출입문 앞에 있어요.
 * - 돌아다니던 봇은 가끔 컴퓨터 자리에 앉아 일하기도 해요.
 * 그림 좌표(점) 기준으로 위치를 정하고, 화면에 그릴 때 배율 s를 곱해요.
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

const BG = require('../../assets/office/office.jpg');
/** 도트 글꼴(갈무리9, OFL). 그림과 어울리게 칠판·이름표·시계에 써요 */
const PIXEL_FONT = { Galmuri9: require('../../assets/fonts/Galmuri9.ttf') };
const BG_W = 1672;
const BG_H = 941;
/** 캐릭터 그림(방장이 AI로 만든 한 사람 그림을 머리·넥타이 색만 바꿔 30가지).
 * walk: 한 줄 = 한 사람, 칸 0~3 앞으로 걷기 · 4~7 뒤로 걷기 · 8~11 왼쪽으로 걷기(오른쪽은 뒤집어요), 칸 60×96
 * bean: 한 줄 = 한 사람, 칸 0 태블릿 · 1 음악 · 2 미소 · 3 기지개 · 4 잠(z z) · 5 커피, 칸 132×126 */
const WALK = require('../../assets/office/walk.png');
const BEAN = require('../../assets/office/bean.png');
const WCELL = { w: 60, h: 96 };
const BCELL = { w: 132, h: 126 };
/** 그림 속 캐릭터 크기(점). 의자 크기에 맞췄어요 */
const BODY = 66;
/** 걷는 빠르기(그림 점/초) */
const SPEED = 110;

type Dir = 'left' | 'down' | 'up' | 'right';
const DIR_COL: Record<Dir, number> = { down: 0, up: 4, left: 8, right: 8 };
interface P {
  x: number;
  y: number;
}
interface Seat extends P {
  dir: Dir;
}

// ── 자리(발 위치 기준) ──
const OWNER_SEAT: Seat = { x: 808, y: 248, dir: 'down' };
const TOP_X = [633, 690, 750, 866, 925, 985, 1043];
const MEETING: Seat[] = [
  ...TOP_X.map((x) => ({ x, y: 248, dir: 'down' as Dir })),
  ...TOP_X.map((x) => ({ x, y: 392, dir: 'up' as Dir })),
  { x: 560, y: 300, dir: 'right' },
  { x: 560, y: 348, dir: 'right' },
  { x: 1118, y: 300, dir: 'left' },
  { x: 1118, y: 348, dir: 'left' },
];
const DESKS: Seat[] = [
  { x: 425, y: 640, dir: 'up' }, { x: 565, y: 640, dir: 'up' }, { x: 1105, y: 640, dir: 'up' }, { x: 1245, y: 640, dir: 'up' },
  { x: 425, y: 772, dir: 'up' }, { x: 565, y: 772, dir: 'up' }, { x: 1105, y: 772, dir: 'up' }, { x: 1245, y: 772, dir: 'up' },
];
const LOUNGE: Seat[] = [
  { x: 1400, y: 395, dir: 'down' }, { x: 1455, y: 395, dir: 'down' }, { x: 1355, y: 455, dir: 'down' },
  { x: 1465, y: 630, dir: 'down' }, { x: 1545, y: 655, dir: 'down' }, { x: 1435, y: 690, dir: 'down' },
  { x: 315, y: 200, dir: 'down' }, { x: 210, y: 220, dir: 'down' }, { x: 185, y: 278, dir: 'down' },
  { x: 180, y: 450, dir: 'down' }, { x: 240, y: 500, dir: 'down' },
  { x: 1330, y: 195, dir: 'down' }, { x: 1525, y: 190, dir: 'down' }, { x: 1355, y: 250, dir: 'down' },
];
const DOOR: Seat[] = [
  { x: 800, y: 905, dir: 'up' }, { x: 870, y: 905, dir: 'up' }, { x: 740, y: 912, dir: 'up' }, { x: 930, y: 912, dir: 'up' }, { x: 835, y: 930, dir: 'up' },
];

// ── 걸어 다니는 통로(가로·세로 선). 교차점과 50점마다 길목을 만들어 이어요 ──
const LANES: [P, P][] = [
  [{ x: 300, y: 515 }, { x: 1360, y: 515 }], // 회의실 아래 큰 복도
  [{ x: 350, y: 805 }, { x: 1330, y: 805 }], // 아래 복도
  [{ x: 325, y: 515 }, { x: 325, y: 805 }],
  [{ x: 682, y: 515 }, { x: 682, y: 805 }],
  [{ x: 988, y: 515 }, { x: 988, y: 805 }],
  [{ x: 1350, y: 515 }, { x: 1350, y: 805 }],
  [{ x: 440, y: 130 }, { x: 440, y: 515 }], // 왼쪽 휴게실 옆
  [{ x: 1258, y: 115 }, { x: 1258, y: 515 }], // 오른쪽 휴게실 옆
  [{ x: 835, y: 432 }, { x: 835, y: 515 }], // 회의실 문
  [{ x: 505, y: 432 }, { x: 1165, y: 432 }], // 회의실 안 아래
  [{ x: 520, y: 205 }, { x: 520, y: 432 }],
  [{ x: 1150, y: 205 }, { x: 1150, y: 432 }],
  [{ x: 520, y: 205 }, { x: 1150, y: 205 }], // 회의실 안 위(의자 뒤)
  [{ x: 835, y: 805 }, { x: 835, y: 860 }], // 출입문
];
const NODES: P[] = [];
const EDGES = new Map<number, Set<number>>();
{
  const idOf = (p: P) => {
    let i = NODES.findIndex((n) => Math.abs(n.x - p.x) < 8 && Math.abs(n.y - p.y) < 8);
    if (i < 0) {
      NODES.push(p);
      i = NODES.length - 1;
      EDGES.set(i, new Set());
    }
    return i;
  };
  // 다른 통로와 만나는 점도 길목으로
  const cuts = (a: P, b: P) => {
    const pts: P[] = [a, b];
    for (const [c, d] of LANES) {
      if (a.y === b.y && c.x === d.x && c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x) && a.y >= Math.min(c.y, d.y) && a.y <= Math.max(c.y, d.y)) pts.push({ x: c.x, y: a.y });
      if (a.x === b.x && c.y === d.y && c.y > Math.min(a.y, b.y) && c.y < Math.max(a.y, b.y) && a.x >= Math.min(c.x, d.x) && a.x <= Math.max(c.x, d.x)) pts.push({ x: a.x, y: c.y });
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 50; t < len; t += 50) pts.push({ x: Math.round(a.x + ((b.x - a.x) * t) / len), y: Math.round(a.y + ((b.y - a.y) * t) / len) });
    return pts.sort((p, q) => (a.x === b.x ? p.y - q.y : p.x - q.x));
  };
  for (const [a, b] of LANES) {
    const ids = cuts(a, b).map(idOf);
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) continue;
      EDGES.get(ids[i])!.add(ids[i - 1]);
      EDGES.get(ids[i - 1])!.add(ids[i]);
    }
  }
}
const nearest = (p: P) => NODES.reduce((best, n, i) => (Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(NODES[best].x - p.x, NODES[best].y - p.y) ? i : best), 0);
/** 통로를 따라 가는 길(BFS). 마지막 자리까지는 곧장 걸어가요 */
function route(from: P, to: P): P[] {
  const a = nearest(from);
  const b = nearest(to);
  const prev = new Map<number, number>([[a, -1]]);
  const q = [a];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === b) break;
    for (const n of EDGES.get(cur) ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      q.push(n);
    }
  }
  const path: P[] = [];
  for (let c = b; c !== -1 && prev.has(c); c = prev.get(c)!) path.unshift(NODES[c]);
  return [...path, to];
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const SKINS = 30;
export const OWNER_SKIN = 0;
const skinOf = (c: Char) => (c.kind === 'owner' ? OWNER_SKIN : (c.skin ?? hash(c.id)) % SKINS);


interface Plan {
  route: P[];
  seq: number;
  face?: Dir;
  sit: boolean;
}

/**
 * boxW×boxH 안에 사무실 그림 전체가 들어가게 그려요(잘리지 않게).
 * rotate면 90° 돌려서 그려요(폰을 옆으로 돌려서 크게 보기).
 */
/** 날짜·요일·시:분:초 시계(이 칸만 1초마다 다시 그려요) */
function WallClock({ size, font }: { size: number; font?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const text = `${now.getMonth() + 1}/${now.getDate()}(${'일월화수목금토'[now.getDay()]}) ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  return (
    <View style={styles.clockPill}>
      <Text style={[{ color: '#1F2937', fontSize: size }, font ? { fontFamily: font } : null]}>{text}</Text>
    </View>
  );
}

export function PixelOffice({ boxW, boxH, rotate = false, chars, notice, status }: { boxW: number; boxH: number; rotate?: boolean; chars: Char[]; notice: string; status: string; clock?: string }) {
  const [fontReady] = useFonts(PIXEL_FONT);
  const px = fontReady ? { fontFamily: 'Galmuri9' } : null;
  const s = rotate ? Math.min(boxW / BG_H, boxH / BG_W) : Math.min(boxW / BG_W, boxH / BG_H);
  const W = BG_W * s;
  const height = BG_H * s;
  // 작게 볼 때도 캐릭터가 너무 작아지지 않게 최소 크기를 둬요
  const size = Math.max(BODY * s, 18);

  const posRef = useRef<Record<string, P>>({});
  const goalRef = useRef<Record<string, string>>({});
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const busyRef = useRef<Record<string, boolean>>({});
  const charsRef = useRef(chars);
  useEffect(() => {
    charsRef.current = chars;
  }, [chars]);

  // 1.2초마다: 각자 가야 할 곳을 정하고, 바뀌었으면 길을 짜서 걸어가게 해요
  useEffect(() => {
    const tick = () => {
      const list = charsRef.current;
      const used = new Set<string>();
      const take = (spots: Seat[], start: number) => {
        for (let i = 0; i < spots.length; i++) {
          const sp = spots[(start + i) % spots.length];
          const key = `${sp.x},${sp.y}`;
          if (!used.has(key)) {
            used.add(key);
            return sp;
          }
        }
        return spots[start % spots.length];
      };
      const updates: Record<string, Plan> = {};
      for (const c of list) {
        const h = hash(c.id);
        const seat: Seat | null =
          c.kind === 'owner' ? OWNER_SEAT :
          c.state === 'away' || c.state === 'rest' ? take(LOUNGE, h) :
          c.state === 'new' ? take(DOOR, h) :
          c.bubble?.newest ? take(MEETING, h) : null;
        const goalKey = seat ? `${seat.x},${seat.y}` : 'wander';
        const here = posRef.current[c.id];
        if (!here) {
          // 처음엔 바로 그 자리(돌아다니는 캐릭터는 아무 길목)에 놓아요
          const start = seat ?? NODES[h % NODES.length];
          posRef.current[c.id] = start;
          goalRef.current[c.id] = goalKey;
          updates[c.id] = { route: [start], seq: 0, face: seat?.dir ?? 'down', sit: !!seat && c.state !== 'new' };
          continue;
        }
        if (busyRef.current[c.id]) continue;
        if (seat) {
          if (goalRef.current[c.id] !== goalKey) {
            goalRef.current[c.id] = goalKey;
            busyRef.current[c.id] = true;
            updates[c.id] = { route: route(here, seat), seq: Date.now(), face: seat.dir, sit: c.state !== 'new' };
          }
        } else {
          // 컴퓨터 자리에 앉아 있었으면 한동안 일하다가 일어나요
          if (goalRef.current[c.id]?.startsWith('desk') && Math.random() < 0.85) continue;
          // 가끔 빈 컴퓨터 자리에 가서 앉아요
          if (Math.random() < 0.08) {
            const free = DESKS.filter((d) => !Object.values(posRef.current).some((q) => q.x === d.x && q.y === d.y));
            const d = free[Math.floor(Math.random() * free.length)];
            if (d) {
              goalRef.current[c.id] = `desk${d.x},${d.y}`;
              busyRef.current[c.id] = true;
              updates[c.id] = { route: route(here, d), seq: Date.now(), face: d.dir, sit: true };
              continue;
            }
          }
          goalRef.current[c.id] = 'wander';
          // 가끔 근처 길목으로 산책
          if (Math.random() < (c.state === 'talking' ? 0.35 : 0.15)) {
            const near = NODES.filter((n) => Math.hypot(n.x - here.x, n.y - here.y) < 320 && Math.hypot(n.x - here.x, n.y - here.y) > 40);
            const to = near[Math.floor(Math.random() * near.length)];
            if (to) {
              busyRef.current[c.id] = true;
              updates[c.id] = { route: route(here, to), seq: Date.now(), sit: false };
            }
          }
        }
      }
      if (Object.keys(updates).length) setPlans((p) => ({ ...p, ...updates }));
    };
    tick();
    const timer = setInterval(tick, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ width: rotate ? height : W, height: rotate ? W : height }}>
      <View
        style={{
          position: 'absolute',
          width: W,
          height,
          left: rotate ? (height - W) / 2 : 0,
          top: rotate ? (W - height) / 2 : 0,
          transform: rotate ? [{ rotate: '90deg' }] : [],
          overflow: 'hidden',
          borderRadius: 8,
        }}
      >
        <Image source={BG} style={{ position: 'absolute', left: 0, top: 0, width: W, height }} fadeDuration={0} />
        {/* 칠판: 원래 내용을 지운 흰 칠판에 공지를 써요 */}
        <View style={[styles.notice, { left: 630 * s, top: 80 * s, width: 414 * s, height: 78 * s }]}>
          <Text
            style={[styles.noticeText, px, { fontSize: Math.max(7, Math.round(14 * s * 2) / 2), lineHeight: Math.max(9, Math.round(19 * s)) }]}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            <Text style={styles.noticeTitle}>공지 </Text>
            {notice || '아직 공지가 없어요'}
          </Text>
        </View>
        {/* 벽시계 */}
        {/* 칠판 위 시계: 날짜·요일·초까지, 1초마다 */}
        <View style={[styles.clock, { left: 835 * s - 160, width: 320, top: 6 * s }]} pointerEvents="none">
          <WallClock size={Math.max(8, 15 * s)} font={fontReady ? 'Galmuri9' : undefined} />
        </View>
        {/* 회의 탁자 위 상태 */}
        <View style={[styles.status, { left: 700 * s, top: 340 * s, width: 270 * s }]}>
          <Text style={[{ color: '#FFFFFF', fontSize: Math.max(8, 14 * s), textAlign: 'center' }, px]} numberOfLines={1}>
            {status}
          </Text>
        </View>

        {chars.map((c) => {
          const plan = plans[c.id];
          if (!plan) return null;
          return (
            <Walker
              key={c.id}
              c={c}
              plan={plan}
              s={s}
              W={W}
              size={c.kind === 'owner' ? size * 1.25 : size}
              font={fontReady ? 'Galmuri9' : undefined}
              onDone={(last) => {
                posRef.current[c.id] = last;
                busyRef.current[c.id] = false;
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** 걸어 다니는 캐릭터: 길(점 목록)을 한 칸씩 걸어가며 방향과 걷는 그림을 바꿔요. */
function Walker({ c, plan, s, W, size, font, onDone }: { c: Char; plan: Plan; s: number; W: number; size: number; font?: string; onDone: (last: P) => void }) {
  const first = plan.route[0];
  const [xy] = useState(() => new Animated.ValueXY({ x: first.x * s, y: first.y * s }));
  const [frame, setFrame] = useState(0);
  const [dir, setDir] = useState<Dir>(plan.face ?? 'down');
  const [sit, setSit] = useState(plan.sit);
  const [feet, setFeet] = useState<P>(first);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (plan.seq === 0) {
      xy.setValue({ x: first.x * s, y: first.y * s });
      return;
    }
    let cancelled = false;
    let from: P = feet;
    let f = 0;
    const legs = setInterval(() => {
      setSit(false);
      setFrame(++f % 4);
    }, 160);
    const walk = (i: number) => {
      if (cancelled) return;
      if (i >= plan.route.length) {
        clearInterval(legs);
        setFrame(0);
        if (plan.face) setDir(plan.face);
        setSit(plan.sit);
        doneRef.current(from);
        return;
      }
      const to = plan.route[i];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        from = to;
        walk(i + 1);
        return;
      }
      setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      Animated.timing(xy, { toValue: { x: to.x * s, y: to.y * s }, duration: (dist / SPEED) * 1000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
        from = to;
        setFeet(to);
        if (finished) walk(i + 1);
      });
    };
    walk(0);
    return () => {
      cancelled = true;
      clearInterval(legs);
    };
    // 새 길(seq)이 올 때만 걸어요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.seq]);

  const skin = skinOf(c);
  // 소파·빈백 자리에 앉아 있으면 빈백 그림(끊긴 봇은 잠, 쉬는 봇은 여러 모습)
  const lounging = sit && (c.state === 'away' || c.state === 'rest');
  const beanFrame = c.state === 'away' ? 4 : [0, 1, 2, 3, 5][hash(c.id) % 5];
  const spriteW = lounging ? size * 1.55 : size * (WCELL.w / WCELL.h);
  const spriteH = lounging ? spriteW * (BCELL.h / BCELL.w) : size;
  const col = lounging ? beanFrame : DIR_COL[dir] + (sit ? 0 : frame);
  const flip = !lounging && dir === 'right';
  const asleep = c.state === 'away';
  const dot = c.state === 'talking' || c.state === 'here' ? '#22C55E' : c.state === 'rest' ? '#EF4444' : c.state === 'new' ? '#60A5FA' : '#9CA3AF';
  // 말풍선·이름표가 그림 밖으로 안 잘리게(발 위치 기준으로 계산)
  // 말풍선은 작게: 그림 크기에 맞춰 폭을 줄이고 2줄까지만
  const bw = Math.min(90 * s + 50, W - 8);
  const me = feet.x * s;
  const wrapLeft = Math.max(4, Math.min(W - bw - 4, me - bw / 2)) - me;
  const tailLeft = -wrapLeft - 3;
  // 위쪽 끝에 있으면 말풍선을 아래로(그림 밖으로 잘리지 않게)
  const below = feet.y * s - size - 80 < 0;
  const tagW = 160 * s + 40;
  const tagLeft = Math.max(2, Math.min(W - tagW - 2, me - tagW / 2)) - me;

  return (
    // 이 View의 (0,0)이 발 위치예요
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: xy.getTranslateTransform(), zIndex: Math.round(feet.y) + (c.bubble ? 2000 : 0) }}>
      {/* 방장: 발밑에 금색 빛(어디 있는지 한눈에) */}
      {c.kind === 'owner' ? (
        <View pointerEvents="none" style={[styles.glow, { left: -size * 0.62, top: -size * 0.2, width: size * 1.24, height: size * 0.42, borderRadius: size }]} />
      ) : null}
      <Pressable
        onPress={c.onPress}
        disabled={!c.onPress}
        accessibilityLabel={c.name}
        style={{ position: 'absolute', left: -spriteW / 2, top: -spriteH * (lounging ? 0.85 : 0.97), width: spriteW, height: spriteH }}
      >
        <View style={{ width: spriteW, height: spriteH, overflow: 'hidden', opacity: c.state === 'new' ? 0.65 : 1, transform: flip ? [{ scaleX: -1 }] : [] }}>
          <Image
            source={lounging ? BEAN : WALK}
            fadeDuration={0}
            style={{ position: 'absolute', width: spriteW * (lounging ? 6 : 12), height: spriteH * 30, left: -col * spriteW, top: -skin * spriteH }}
          />
        </View>
      </Pressable>
      {/* 방장은 이름표 없이 머리 위에 왕관만, 나머지는 작은 이름표 */}
      {c.kind === 'owner' ? (
        <Text style={[styles.crown, { left: -size * 0.28, top: -spriteH * (lounging ? 0.85 : 0.97) - size * 0.4, fontSize: Math.max(12, size * 0.48) }]} pointerEvents="none">
          👑
        </Text>
      ) : (
        <View style={[styles.tagWrap, { width: tagW, left: tagLeft, top: -spriteH * (lounging ? 0.8 : 0.97) - 12 }]} pointerEvents="none">
          <View style={styles.tag}>
            <View style={[styles.tagDot, { backgroundColor: dot }]} />
            <Text style={[styles.tagText, font ? { fontFamily: font, fontWeight: 'normal' } : null]} numberOfLines={1}>
              {c.badge ?? ''}
              {c.name}
            </Text>
          </View>
        </View>
      )}
      {asleep && !lounging ? <Text style={[styles.zz, { left: size * 0.25, top: -size * 1.25 }]}>z z</Text> : null}
      {/* 말풍선 */}
      {c.bubble ? (
        <View style={[styles.bubbleWrap, { width: bw, left: wrapLeft }, below ? { top: 6 } : { bottom: size * 0.95 + 13 }]} pointerEvents="none">
          <View style={[styles.bubble, c.bubble.newest && styles.bubbleNew, { maxWidth: bw }]}>
            <Text style={[styles.bubbleText, font ? { fontFamily: font, fontSize: 8, lineHeight: 10 } : null]} numberOfLines={1}>
              {c.bubble.text}
            </Text>
          </View>
          <View
            style={[
              styles.tail,
              c.bubble.newest && styles.tailNew,
              { position: 'absolute', left: tailLeft },
              below ? { top: -3, transform: [{ rotate: '225deg' }] } : { bottom: -3 },
            ]}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: { position: 'absolute', justifyContent: 'center' },
  noticeTitle: { color: '#C2410C' },
  // 칠판에 마커로 쓴 느낌: 굵지 않게, 진한 남색
  noticeText: { color: '#24325C' },
  clock: { position: 'absolute', alignItems: 'center' },
  clockPill: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  status: { position: 'absolute', backgroundColor: 'rgba(60,35,20,0.6)', paddingVertical: 2, borderRadius: 999 },
  tagWrap: { position: 'absolute', alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(17,24,39,0.72)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  tagDot: { width: 4, height: 4, borderRadius: 2 },
  tagText: { color: '#FFFFFF', fontWeight: '700', fontSize: 8 },
  crown: { position: 'absolute', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,196,40,0.5)', borderWidth: 1.5, borderColor: 'rgba(255,215,80,0.95)' },
  zz: { position: 'absolute', color: '#4B5563', fontWeight: '900', fontStyle: 'italic', fontSize: 13 },
  bubbleWrap: { position: 'absolute', alignItems: 'center' },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bubbleNew: { borderColor: '#F5B544', borderWidth: 1.5 },
  bubbleText: { color: '#1F2937', fontSize: 9, lineHeight: 11 },
  tail: { width: 5, height: 5, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.08)', elevation: 4 },
  tailNew: { borderColor: '#F5B544', borderRightWidth: 1.5, borderBottomWidth: 1.5 },
});
