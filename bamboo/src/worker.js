// 대나무숲 — Cloudflare Worker API
// Leaves live for 24 hours. No raw IPs are stored: visitors are identified only by a
// daily-rotating HMAC, used for rate limiting and one-reaction-per-leaf.

const LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_LEN = 200;
const POSTS_PER_10MIN = 3;
const POSTS_PER_DAY = 20;
const AUTO_HIDE_REPORTS = 3;
const PRESENCE_MS = 75 * 1000;

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
function isAdmin(request, env) {
  const auth = request.headers.get('authorization') || '';
  return !!env.ADMIN_TOKEN && safeEqual(auth.replace(/^Bearer\s+/i, ''), env.ADMIN_TOKEN);
}

async function cleanup(env) {
  const cutoff = Date.now() - LIFETIME_MS;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reactions WHERE leaf_id IN (SELECT id FROM leaves WHERE created < ?)').bind(cutoff),
    env.DB.prepare('DELETE FROM leaves WHERE created < ?').bind(cutoff),
    env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(Date.now() - 3600 * 1000),
  ]);
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  const now = Date.now();

  // Writes must be JSON — blocks cross-site HTML form posts.
  if (method === 'POST' && !(request.headers.get('content-type') || '').includes('application/json')) {
    return fail(415, 'JSON으로 보내 주세요.');
  }

  if (pathname === '/api/leaves' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, text, created, heard FROM leaves WHERE hidden = 0 AND created >= ? ORDER BY id DESC LIMIT 300',
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
      'INSERT INTO leaves (text, created, author) VALUES (?, ?, ?) RETURNING id, text, created, heard',
    ).bind(checked.text, now, visitor).first();
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
        await env.DB.prepare('UPDATE leaves SET heard = heard + 1 WHERE id = ?').bind(id).run();
      } else {
        await env.DB.prepare(
          'UPDATE leaves SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?',
        ).bind(AUTO_HIDE_REPORTS, id).run();
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
    await env.DB.prepare('INSERT INTO presence (sid, seen) VALUES (?, ?) ON CONFLICT(sid) DO UPDATE SET seen = excluded.seen')
      .bind(sid, now).run();
    if (Math.random() < .05) await env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(now - 3600 * 1000).run();
    const { results } = await env.DB.prepare('SELECT sid FROM presence WHERE seen >= ? ORDER BY seen DESC LIMIT 40')
      .bind(now - PRESENCE_MS).all();
    // other strollers only, as short one-way hashes (enough to tell them apart)
    const short = (x) => { let h = 2166136261; for (const c of x) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
    return json({ walkers: results.filter((r) => r.sid !== sid).map((r) => short(r.sid)) });
  }

  // ---- admin ----
  if (pathname.startsWith('/api/admin/')) {
    if (!isAdmin(request, env)) return fail(401, '관리자 비밀번호가 맞지 않아요.');
    if (pathname === '/api/admin/leaves' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, text, created, heard, reports, hidden FROM leaves WHERE created >= ? ORDER BY hidden DESC, reports DESC, id DESC LIMIT 500',
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err);
        return fail(500, '숲에 잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.');
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    await cleanup(env);
  },
};
