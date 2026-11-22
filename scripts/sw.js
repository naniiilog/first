// 다봇 알림 담당(서비스 워커). 앱이 꺼져 있어도 휴대폰이 알림을 받아 보여줘요.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: d.body || '',
    tag: d.tag || 'dabot',
    renotify: true,
    silent: !!d.silent,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' },
  };
  if (!d.silent) options.vibrate = [120, 60, 120];
  event.waitUntil(self.registration.showNotification(d.title || '다봇', options));
});

// 알림을 누르면 그 채팅방을 열어요(이미 열린 창이 있으면 그 창으로).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
