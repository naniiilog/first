// 웹 앱을 만들어 server/web-dist에 넣어요. Cloudflare에 서버와 함께 올라가요.
// 휴대폰에서 "홈 화면에 추가"하면 다봇 아이콘으로 앱처럼 열리도록 manifest와 아이콘도 넣어요.
import { execSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, 'server', 'web-dist');

execSync(`npx expo export --platform web --output-dir "${out}"`, { cwd: root, stdio: 'inherit' });

copyFileSync(join(root, 'assets', 'icon.png'), join(out, 'icon-1024.png'));
// 휴대폰 알림용: 서비스 워커와 작은 아이콘
copyFileSync(join(root, 'scripts', 'sw.js'), join(out, 'sw.js'));
copyFileSync(join(root, 'assets', 'icon-192.png'), join(out, 'icon-192.png'));

writeFileSync(
  join(out, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: '다봇',
      short_name: '다봇',
      description: 'AI 에이전트들을 한 채팅방에',
      start_url: '/',
      display: 'standalone',
      background_color: '#FFFFFF',
      theme_color: '#FFFFFF',
      icons: [{ src: '/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
    },
    null,
    2,
  ),
);

const indexPath = join(out, 'index.html');
const tags = [
  // 한국어 페이지라고 알리고 자동 번역을 막아요(브라우저가 '영어→한국어'로 잘못 번역해서 글이 바뀌던 문제).
  '<meta name="google" content="notranslate">',
  '<meta http-equiv="Content-Language" content="ko">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/icon-1024.png">',
  '<meta name="theme-color" content="#FFFFFF">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="다봇">',
].join('');
const html = readFileSync(indexPath, 'utf8');
if (!html.includes('manifest.webmanifest')) {
  const fixed = html.replace(/<html[^>]*>/, '<html lang="ko" translate="no" class="notranslate">').replace('</head>', `${tags}</head>`);
  writeFileSync(indexPath, fixed);
}
// 웹 앱 파일을 서버 코드 안에 넣어요(server/src/web-assets.gen.js).
// 파일을 따로 올리지 않아도 서버 하나로 웹 앱까지 보여줄 수 있어요.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};
const TEXT = new Set(['.html', '.js', '.json', '.webmanifest', '.css', '.svg']);
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const ext = extname(name).toLowerCase();
      const path = '/' + relative(out, full).split(sep).join('/');
      const type = TYPES[ext] ?? 'application/octet-stream';
      files[path] = TEXT.has(ext) ? { type, text: readFileSync(full, 'utf8') } : { type, b64: readFileSync(full).toString('base64') };
    }
  }
};
walk(out);
writeFileSync(join(root, 'server', 'src', 'web-assets.gen.js'), `// 자동 생성 파일 (scripts/build-web.mjs). 직접 고치지 마세요.\nexport default ${JSON.stringify(files)};\n`);
console.log(`웹 앱 준비 완료: 파일 ${Object.keys(files).length}개를 서버에 넣었어요.`);
