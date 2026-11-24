import INDEX_HTML from '../public/index.html';
import ADMIN_HTML from '../public/admin.html';
import MANIFEST from '../public/manifest.webmanifest';
import ICON_180 from '../public/icon-180.png';
import ICON_192 from '../public/icon-192.png';
import ICON_512 from '../public/icon-512.png';
import OG_IMAGE from '../public/og.jpg';
import SW_JS from '../public/sw.js';
import ADMIN_MANIFEST from '../public/admin.webmanifest';

const STATIC = {
  '/': [INDEX_HTML, 'text/html; charset=utf-8'],
  '/index.html': [INDEX_HTML, 'text/html; charset=utf-8'],
  '/admin.html': [ADMIN_HTML, 'text/html; charset=utf-8'],
  '/manifest.webmanifest': [MANIFEST, 'application/manifest+json'],
  '/icon-180.png': [ICON_180, 'image/png'],
  '/icon-192.png': [ICON_192, 'image/png'],
  '/icon-512.png': [ICON_512, 'image/png'],
  '/og.jpg': [OG_IMAGE, 'image/jpeg'],
  '/sw.js': [SW_JS, 'text/javascript; charset=utf-8'],
  '/admin.webmanifest': [ADMIN_MANIFEST, 'application/manifest+json'],
};

// 대나무숲 — Cloudflare Worker API
// Leaves live for 24 hours. No raw IPs are stored: visitors are identified only by a
// daily-rotating HMAC, used for rate limiting and one-reaction-per-leaf.

const LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_LEN = 200;
const POSTS_PER_10MIN = 3;
const POSTS_PER_DAY = 20;
const AUTO_HIDE_REPORTS = 3;
const PRESENCE_MS = 75 * 1000;
const MODES = ['whisper', 'shout', 'sigh'];
const PLACES = ['plaza', 'g0', 'g1', 'g2'];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const fail = (status, message) => json({ error: message }, status);

async function visitorId(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SALT || 'unset-salt'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ip}|${day}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- content checks ----
const PERSONAL_INFO = [
  [/01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/, '전화번호'],
  [/\d{6}[\s-]?[1-4]\d{6}/, '주민등록번호'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, '이메일'],
  [/\d{3,6}-\d{2,6}-\d{4,8}/, '계좌번호'],
];
const LINKS = /(https?:\/\/|www\.|\.(com|net|kr|io|me|ly|gg|xyz)\b)/i;
const PROFANITY = /(씨발|시발|씨바|씨빨|ㅆㅂ|ㅅㅂ|병신|븅신|ㅄ|ㅂㅅ|개새|좆|느금|니애미|니에미|애미뒤|엠창|섹스|창녀|걸레년|fuck|shit)/i;

function checkText(raw) {
  if (typeof raw !== 'string') return { error: '내용을 적어 주세요.' };
  const text = raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { error: '내용을 적어 주세요.' };
  if ([...text].length > MAX_LEN) return { error: `${MAX_LEN}자까지 외칠 수 있어요.` };
  for (const [re, label] of PERSONAL_INFO) {
    if (re.test(text)) return { error: `${label}처럼 보이는 내용이 있어요. 개인정보는 숲에 남길 수 없어요.` };
  }
  if (LINKS.test(text)) return { error: '링크는 남길 수 없어요.' };
  const squashed = text.replace(/[\s\d.,!?~^*_\-|/\\()[\]{}'"`:;]+/g, '');
  if (PROFANITY.test(squashed)) return { error: '거친 말은 바람에 실어 보낼 수 없어요. 조금만 순하게 바꿔 볼까요?' };
  if (/(.)\1{14,}/.test(squashed)) return { error: '같은 글자가 너무 많이 반복돼요.' };
  return { text };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// admin password: once the admin sets their own, only a salted PBKDF2 hash is stored (nobody can read it back)
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function pbkdf2(password, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
const adminOk = new Map();   // sha256(password + stored hash) -> expiry; avoids re-running PBKDF2 on every request
async function isAdmin(request, env) {
  let given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  try { given = decodeURIComponent(given); } catch {}   // passwords may be Korean: the page sends them URI-encoded
  if (!given) return false;
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'admin_hash'").first();
  const key = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(given + '|' + (row ? row.v : 'env'))));
  if ((adminOk.get(key) || 0) > Date.now()) return true;
  let ok;
  if (row) { const [salt, hash] = row.v.split(':'); ok = safeEqual(await pbkdf2(given, salt), hash); }
  else ok = !!env.ADMIN_TOKEN && safeEqual(given, env.ADMIN_TOKEN);
  if (ok) adminOk.set(key, Date.now() + 10 * 60 * 1000);
  return ok;
}
// a request from the forest keeper (logged-in admin walking the site)? only checked when a password is sent
const isKeeper = (request, env) => (request.headers.get('authorization') ? isAdmin(request, env) : Promise.resolve(false));

// ---------- numbers only: daily counters (no personal data) ----------
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
const bump = (env, day, metric, by = 1) =>
  env.DB.prepare('INSERT INTO daily_stats (day, metric, n) VALUES (?, ?, ?) ON CONFLICT(day, metric) DO UPDATE SET n = n + excluded.n').bind(day, metric, by);
// first time today for this (daily-rotating, hashed) visitor at this place? then count it once
async function countOnce(env, day, visitor, what, metric) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO daily_seen (day, visitor, what) VALUES (?, ?, ?)').bind(day, visitor, what).run();
  if (r.meta.changes) await bump(env, day, metric).run();
}

// ---------- web push to the admin (no payload, so no encryption needed; the admin's service worker fetches the text) ----------
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let vapidKey = null;
async function vapidHeader(env, endpoint) {
  if (!vapidKey) vapidKey = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://bambooforest.pages.dev' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
async function notify(env, title, body) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO notifications (ts, title, body) VALUES (?, ?, ?)').bind(Date.now(), title, body),
    env.DB.prepare('DELETE FROM notifications WHERE id <= (SELECT MAX(id) FROM notifications) - 100'),
  ]);
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
  const { results } = await env.DB.prepare('SELECT endpoint FROM push_subs').all();
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, endpoint), TTL: '86400', Urgency: 'high', 'Content-Length': '0' } });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    } catch (e) { console.error('push failed', e); }
  }));
}
const GROVE_NAME = ['🍃 바람 숲', '🌙 달빛 숲', '💧 이슬 숲'];
const CRISIS = /(죽고\s*싶|죽을\s*래|죽어\s*버리|자살|살기\s*싫|살고\s*싶지\s*않|사라지고\s*싶|없어지고\s*싶|극단적|자해|목숨|살\s*이유|뛰어\s*내리|유서|끝내고\s*싶|손목)/;
const MODE_NAME = { whisper: '🤫 속삭임', shout: '📣 소리침', sigh: '😮‍💨 한숨' };
const clip = (t, n = 60) => ([...t].length > n ? [...t].slice(0, n).join('') + '…' : t);

async function cleanup(env) {
  const cutoff = Date.now() - LIFETIME_MS;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reactions WHERE leaf_id IN (SELECT id FROM leaves WHERE created < ?)').bind(cutoff),
    env.DB.prepare('DELETE FROM leaves WHERE created < ?').bind(cutoff),
    env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(Date.now() - 3600 * 1000),
    env.DB.prepare('DELETE FROM daily_seen WHERE day < ?').bind(kstDay(Date.now() - 2 * 86400 * 1000)),
  ]);
}

async function handleApi(request, env, url, ctx) {
  const later = (p) => (ctx && ctx.waitUntil ? ctx.waitUntil(p.catch((e) => console.error(e))) : p.catch(() => {}));
  const { pathname } = url;
  const method = request.method;
  const now = Date.now();

  // Writes must be JSON — blocks cross-site HTML form posts.
  if (method === 'POST' && !(request.headers.get('content-type') || '').includes('application/json')) {
    return fail(415, 'JSON으로 보내 주세요.');
  }

  if (pathname === '/api/leaves' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, text, created, heard, mode, grove FROM leaves WHERE hidden = 0 AND created >= ? ORDER BY id DESC LIMIT 300',
    ).bind(now - LIFETIME_MS).all();
    return json({ now, lifetime: LIFETIME_MS, leaves: results });
  }

  if (pathname === '/api/leaves' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail(400, '잘못된 요청이에요.'); }
    const checked = checkText(body?.text);
    if (checked.error) return fail(400, checked.error);

    const visitor = await visitorId(request, env);
    const recent = await env.DB.prepare(
      'SELECT SUM(created >= ?) AS m10, COUNT(*) AS d FROM leaves WHERE author = ? AND created >= ?',
    ).bind(now - 10 * 60 * 1000, visitor, now - LIFETIME_MS).first();
    if ((recent?.m10 || 0) >= POSTS_PER_10MIN) return fail(429, '숨 한 번 고르고, 잠시 뒤에 다시 외쳐 주세요.');
    if ((recent?.d || 0) >= POSTS_PER_DAY) return fail(429, '오늘은 충분히 외쳤어요. 내일 다시 만나요.');

    const row = await env.DB.prepare(
      'INSERT INTO leaves (text, created, author, mode, grove) VALUES (?, ?, ?, ?, ?) RETURNING id, text, created, heard, mode, grove',
    ).bind(checked.text, now, visitor, MODES.includes(body?.mode) ? body.mode : 'whisper', [0, 1, 2].includes(body?.grove) ? body.grove : 0).first();
    const keeperPost = body?.ad === 1 || await isKeeper(request, env);
    if (!keeperPost) { const day = kstDay(now);
      await env.DB.batch([bump(env, day, 'leaves'), bump(env, day, 'leaves_g' + row.grove), bump(env, day, 'leaves_' + row.mode)]); }
    if (!keeperPost) later(notify(env, CRISIS.test(row.text) ? `🆘 위기 신호가 있는 사연 · ${GROVE_NAME[row.grove] || ''}` : `🎋 새 사연 · ${GROVE_NAME[row.grove] || ''}`, `${MODE_NAME[row.mode] || ''}  ${clip(row.text)}`));
    return json({ leaf: row }, 201);
  }

  const react = pathname.match(/^\/api\/leaves\/(\d+)\/(heard|report)$/);
  if (react && method === 'POST') {
    const id = Number(react[1]);
    const kind = react[2];
    const leaf = await env.DB.prepare('SELECT id FROM leaves WHERE id = ? AND hidden = 0 AND created >= ?')
      .bind(id, now - LIFETIME_MS).first();
    if (!leaf) return fail(404, '이미 바람에 날아간 잎이에요.');
    const visitor = await visitorId(request, env);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO reactions (leaf_id, visitor, kind) VALUES (?, ?, ?)')
      .bind(id, visitor, kind).run();
    if (ins.meta.changes) {
      if (kind === 'heard') {
        let rb = {}; try { rb = await request.clone().json(); } catch {}
        const kp = rb?.ad === 1 || await isKeeper(request, env);
        await env.DB.batch([env.DB.prepare('UPDATE leaves SET heard = heard + 1 WHERE id = ?').bind(id), ...(kp ? [] : [bump(env, kstDay(now), 'heard')])]);
      } else {
        await env.DB.prepare(
          'UPDATE leaves SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?',
        ).bind(AUTO_HIDE_REPORTS, id).run();
        const rl = await env.DB.prepare('SELECT text, reports, hidden FROM leaves WHERE id = ?').bind(id).first();
        if (rl) later(notify(env, rl.hidden ? `🚨 신고 ${rl.reports}번 · 자동으로 숨겼어요` : `🚨 신고 들어옴 (${rl.reports}번째)`, clip(rl.text)));
      }
    }
    const after = await env.DB.prepare('SELECT heard FROM leaves WHERE id = ?').bind(id).first();
    return json({ ok: true, heard: after?.heard ?? 0, already: !ins.meta.changes });
  }

  // ---- presence: who is strolling right now ----
  if (pathname === '/api/presence' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail(400, '잘못된 요청이에요.'); }
    const sid = String(body?.sid || '');
    if (!/^[a-z0-9]{12,40}$/.test(sid)) return fail(400, '잘못된 요청이에요.');
    const place = PLACES.includes(body?.place) ? body.place : 'plaza';
    const keeper = await isKeeper(request, env);
    const adminDevice = keeper || body?.ad === 1;   // the admin's own phone: never counted, even outside 숲지기 mode
    if (keeper && body?.keeper !== 'visible') {
      await env.DB.prepare('DELETE FROM presence WHERE sid = ?').bind(sid).run();           // invisible keeper: not stored, not shown
    } else {
      await env.DB.prepare('INSERT INTO presence (sid, seen, place, keeper) VALUES (?, ?, ?, ?) ON CONFLICT(sid) DO UPDATE SET seen = excluded.seen, place = excluded.place, keeper = excluded.keeper')
        .bind(sid, now, place, keeper ? 1 : adminDevice ? 2 : 0).run();
    }
    if (!adminDevice) {
      const day = kstDay(now), who = await visitorId(request, env);
      await countOnce(env, day, who, 'site', 'visits');
      if (place !== 'plaza') await countOnce(env, day, who, place, 'visits_' + place);
    }
    if (Math.random() < .05) await env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(now - 3600 * 1000).run();
    const { results } = await env.DB.prepare('SELECT sid, place, keeper FROM presence WHERE seen >= ? ORDER BY seen DESC LIMIT 60')
      .bind(now - PRESENCE_MS).all();
    // other strollers only, as short one-way hashes (enough to tell them apart)
    const short = (x) => { let h = 2166136261; for (const c of x) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
    return json({ walkers: results.filter((r) => r.sid !== sid).map((r) => ({ id: short(r.sid), place: r.place, keeper: r.keeper === 1 ? 1 : 0 })) });
  }

  // ---- admin ----
  if (pathname.startsWith('/api/admin/')) {
    const who = await visitorId(request, env);
    const since = now - 15 * 60 * 1000;
    const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_fails WHERE visitor = ? AND ts >= ?').bind(who, since).first();
    if ((fails?.n || 0) >= 5) return fail(429, '비밀번호를 여러 번 틀려서 15분 동안 잠겼어요. 잠시 뒤에 다시 시도해 주세요.');
    if (!(await isAdmin(request, env))) {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO admin_fails (visitor, ts) VALUES (?, ?)').bind(who, now),
        env.DB.prepare('DELETE FROM admin_fails WHERE ts < ?').bind(now - 24 * 3600 * 1000),
      ]);
      return fail(401, `관리자 비밀번호가 맞지 않아요. (남은 시도 ${Math.max(0, 4 - (fails?.n || 0))}번)`);
    }
    if (pathname === '/api/admin/password' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return fail(400, '잘못된 요청이에요.'); }
      const next = typeof body?.next === 'string' ? body.next : '';
      if ([...next].length < 6) return fail(400, '비밀번호는 6자 이상으로 해 주세요.');
      if ([...next].length > 64) return fail(400, '비밀번호가 너무 길어요.');
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('admin_hash', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(`${salt}:${await pbkdf2(next, salt)}`).run();
      return json({ ok: true });
    }
    if (pathname === '/api/admin/ping' && method === 'GET') return json({ ok: true });
    if (pathname === '/api/admin/uncount-me' && method === 'POST') {
      const day = kstDay(now), who = await visitorId(request, env);
      const { results } = await env.DB.prepare('SELECT what FROM daily_seen WHERE day = ? AND visitor = ?').bind(day, who).all();
      const ops = results.map((r) => bump(env, day, r.what === 'site' ? 'visits' : 'visits_' + r.what, -1));
      if (ops.length) await env.DB.batch([...ops, env.DB.prepare('DELETE FROM daily_seen WHERE day = ? AND visitor = ?').bind(day, who)]);
      return json({ ok: true, removed: results.length });
    }
    if (pathname === '/api/admin/push/key' && method === 'GET') return json({ key: env.VAPID_PUBLIC || null });
    if (pathname === '/api/admin/push/subscribe' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return fail(400, '잘못된 요청이에요.'); }
      const ep = String(body?.endpoint || '');
      if (!/^https:\/\/[^\s]+$/.test(ep) || ep.length > 1000) return fail(400, '잘못된 요청이에요.');
      await env.DB.prepare('INSERT OR IGNORE INTO push_subs (endpoint, created) VALUES (?, ?)').bind(ep, now).run();
      return json({ ok: true });
    }
    if (pathname === '/api/admin/push/unsubscribe' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return fail(400, '잘못된 요청이에요.'); }
      await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(String(body?.endpoint || '')).run();
      return json({ ok: true });
    }
    if (pathname === '/api/admin/push/test' && method === 'POST') { await notify(env, '🔔 알림 시험', '알림이 잘 와요! 이제 새 사연과 신고를 알려드릴게요.'); return json({ ok: true }); }
    if (pathname === '/api/admin/notifications' && method === 'GET') {
      const after = Number(url.searchParams.get('after') || 0);
      const { results } = await env.DB.prepare('SELECT id, ts, title, body FROM notifications WHERE id > ? ORDER BY id DESC LIMIT 10').bind(after).all();
      return json({ items: results });
    }
    if (pathname === '/api/admin/stats' && method === 'GET') {
      const today = kstDay(now), week = [...Array(7)].map((_, i) => kstDay(now - (6 - i) * 86400 * 1000));
      const [live, tot, td, days] = await Promise.all([
        env.DB.prepare('SELECT place, COUNT(*) AS n FROM presence WHERE seen >= ? AND keeper = 0 GROUP BY place').bind(now - PRESENCE_MS).all(),
        env.DB.prepare('SELECT metric, SUM(n) AS n FROM daily_stats GROUP BY metric').all(),
        env.DB.prepare('SELECT metric, n FROM daily_stats WHERE day = ?').bind(today).all(),
        env.DB.prepare("SELECT day, metric, n FROM daily_stats WHERE day >= ? AND metric IN ('visits', 'leaves')").bind(week[0]).all(),
      ]);
      const obj = (rows) => Object.fromEntries(rows.results.map((r) => [r.metric ?? r.place, r.n]));
      const byDay = week.map((d) => ({ day: d, visits: 0, leaves: 0 }));
      for (const r of days.results) { const x = byDay.find((b) => b.day === r.day); if (x) x[r.metric] = r.n; }
      return json({ today, live: obj(live), total: obj(tot), todayStats: obj(td), week: byDay });
    }
    if (pathname === '/api/admin/leaves' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, text, created, heard, reports, hidden, mode, grove FROM leaves WHERE created >= ? ORDER BY hidden DESC, reports DESC, id DESC LIMIT 500',
      ).bind(now - LIFETIME_MS).all();
      return json({ now, leaves: results });
    }
    const act = pathname.match(/^\/api\/admin\/leaves\/(\d+)\/(delete|hide|unhide)$/);
    if (act && method === 'POST') {
      const id = Number(act[1]);
      if (act[2] === 'delete') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM reactions WHERE leaf_id = ?').bind(id),
          env.DB.prepare('DELETE FROM leaves WHERE id = ?').bind(id),
        ]);
      } else {
        await env.DB.prepare('UPDATE leaves SET hidden = ? WHERE id = ?').bind(act[2] === 'hide' ? 1 : 0, id).run();
      }
      return json({ ok: true });
    }
  }

  return fail(404, '없는 길이에요.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url, ctx);
      } catch (err) {
        console.error(err);
        return fail(500, '숲에 잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.');
      }
    }
    const file = STATIC[url.pathname];
    if (file) return new Response(file[0], { headers: { 'content-type': file[1], 'cache-control': /\.(png|jpg)$/.test(url.pathname) ? 'public, max-age=86400' : 'no-cache' } });
    return new Response('없는 길이에요.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
  async scheduled(_event, env) {
    await cleanup(env);
    // one summary per hour about new visitors (only when someone new came)
    const tot = await env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM daily_stats WHERE metric = 'visits'").first();
    const last = await env.DB.prepare("SELECT v FROM settings WHERE k = 'notified_visits'").first();
    const prev = last ? Number(last.v) : tot.n;
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('notified_visits', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(tot.n)).run();
    const diff = tot.n - prev;
    if (last && diff > 0) {
      const live = await env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE seen >= ? AND keeper = 0').bind(Date.now() - PRESENCE_MS).first();
      await notify(env, `👣 지난 1시간 새 방문자 ${diff}명`, `지금 숲에 ${live.n}명 · 오늘까지 누적 ${tot.n}명`);
    }
  },
};
