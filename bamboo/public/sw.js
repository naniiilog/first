// 숲지기 알림: the push carries no text; we fetch the newest notifications with the saved admin password.
const STORE = 'bamboo-admin';
async function getVal(k) { const c = await caches.open(STORE); const r = await c.match('/__' + k); return r ? r.text() : ''; }
async function setVal(k, v) { const c = await caches.open(STORE); await c.put('/__' + k, new Response(String(v))); }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = '🎋 대나무숲', body = '새 소식이 있어요.', tag = 'bamboo';
    try {
      const token = await getVal('token'), last = Number(await getVal('last')) || 0;
      const r = await fetch('/api/admin/notifications?after=' + last, { headers: { authorization: 'Bearer ' + encodeURIComponent(token) } });
      if (r.ok) {
        const { items } = await r.json();
        if (items.length) {
          await setVal('last', items[0].id);
          if (items.length === 1) { title = items[0].title; body = items[0].body; tag = 'n' + items[0].id; }
          else { title = `🎋 새 알림 ${items.length}개`; body = items.slice(0, 3).map((i) => i.title).join('\n'); tag = 'n' + items[0].id; }
        }
      }
    } catch (e) {}
    await self.registration.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes('/admin.html'));
    if (open) { open.focus(); open.postMessage('refresh'); } else await self.clients.openWindow('/admin.html');
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.token !== undefined) e.waitUntil(setVal('token', e.data.token)); });
