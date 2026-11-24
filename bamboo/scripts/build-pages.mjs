// Builds a self-contained _worker.js for Cloudflare Pages (advanced mode) from src/worker.js,
// inlining the page files so nothing else has to be uploaded.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
let src = readFileSync(root + 'src/worker.js', 'utf8');
const text = (f) => JSON.stringify(readFileSync(root + 'public/' + f, 'utf8'));
const bin = (f) => `Uint8Array.from(atob(${JSON.stringify(readFileSync(root + 'public/' + f).toString('base64'))}), (c) => c.charCodeAt(0))`;
const map = { INDEX_HTML: text('index.html'), ADMIN_HTML: text('admin.html'), MANIFEST: text('manifest.webmanifest'), ICON_180: bin('icon-180.png'), ICON_192: bin('icon-192.png'), ICON_512: bin('icon-512.png'), OG_IMAGE: bin('og.jpg'), SW_JS: text('sw.js'), ADMIN_MANIFEST: text('admin.webmanifest') };
src = src.replace(/^import (\w+) from '[^']+';\n/gm, (m, name) => { if (!(name in map)) throw new Error('unknown import ' + name); return `const ${name} = ${map[name]};\n`; });
mkdirSync(root + 'pages/dist', { recursive: true });
writeFileSync(root + 'pages/dist/_worker.js', src);
console.log('pages/dist/_worker.js', (src.length / 1024).toFixed(0) + 'KB');
