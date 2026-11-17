// Serves every component preview in both themes: http://localhost:4174
//   node design/scripts/preview.mjs [port]
// Each preview.html is a bare document. Like the published reference, this page gives it the
// tokens, the fonts and the component stylesheet, and sets the theme on <html>.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { DESIGN, compile, readTokens } from './build.mjs';

const SYSTEM = join(DESIGN, 'system');
const VEXFLOW = join(DESIGN, '../node_modules/vexflow/build/cjs/vexflow.js');
const port = Number(process.argv[2] ?? 4174);
const TYPES = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function previews() {
  return readdirSync(join(SYSTEM, 'components'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SYSTEM, 'components', entry.name, 'preview.html')))
    .map((entry) => {
      const marker = readFileSync(join(SYSTEM, 'components', entry.name, 'preview.html'), 'utf8').split('\n', 1)[0];
      return {
        name: entry.name,
        group: /group="([^"]*)"/.exec(marker)?.[1] ?? '',
        height: Number(/height=(\d+)/.exec(marker)?.[1] ?? 120),
      };
    });
}

function frame(name, theme) {
  const head = '<head><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/system/components/bundle.css">';
  return readFileSync(join(SYSTEM, 'components', name, 'preview.html'), 'utf8')
    .replace(/<html[^>]*>/, `<html lang="en" data-theme="${theme}">`)
    .replace('<head>', head)
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/vexflow@[^/]+\/build\/cjs\/vexflow\.js/, '/vendor/vexflow.js'); // works offline
}

function index() {
  const list = previews();
  const groups = [...new Set(list.map((p) => p.group))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
  // The cover is laid out at 960px; everything else adapts to the width it gets.
  const card = (p) =>
    `<section><h2>${p.name}</h2><div class="pair${p.name === 'Cover' ? ' is-cover' : ''}">${['light', 'dark']
      .map((theme) => `<iframe title="${p.name}, ${theme}" src="/frame/${p.name}/${theme}" style="height:${p.height}px"></iframe>`)
      .join('')}</div></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Practice Piano design system</title>
<style>
  body { margin: 0; padding: 24px; font: 14px/1.4 system-ui, sans-serif; background: #e9e6e0; color: #26211d; }
  h1 { margin: 0 0 4px; font-size: 20px; } h2 { margin: 24px 0 8px; font-size: 13px; } h3 { margin: 40px 0 0; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 640px), 1fr)); gap: 8px; }
  .pair.is-cover { grid-template-columns: 1fr; overflow-x: auto; }
  iframe { width: 100%; border: 0; border-radius: 8px; background: #fff; }
  .is-cover iframe { width: 960px; }
</style></head><body>
<h1>Practice Piano design system</h1><p>Every component preview, light and dark. Guidelines are the README beside each preview in design/system/components.</p>
${groups.map((group) => `${group ? `<h3>${group}</h3>` : ''}${list.filter((p) => p.group === group).map(card).join('')}`).join('')}
<script>
  // Each frame takes the height of its content, at whatever width it has here.
  for (const frame of document.querySelectorAll('.pair:not(.is-cover) iframe')) {
    const fit = () => { frame.style.height = frame.contentDocument.body.scrollHeight + 'px'; };
    frame.addEventListener('load', () => { fit(); new ResizeObserver(fit).observe(frame.contentDocument.body); });
  }
</script>
</body></html>`;
}

createServer((request, response) => {
  const send = (status, type, body) => response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const framed = /^\/frame\/([A-Za-z0-9]+)\/(light|dark)$/.exec(path);
    if (path === '/') return send(200, 'text/html', index());
    if (framed) return send(200, 'text/html', frame(framed[1], framed[2]));
    if (path === '/tokens.css') return send(200, 'text/css', compile(readTokens(), '/system/')); // always fresh
    if (path === '/vendor/vexflow.js') return send(200, 'text/javascript', readFileSync(VEXFLOW));
    const file = join(SYSTEM, normalize(path.replace(/^\/system\//, '')));
    if (path.startsWith('/system/') && file.startsWith(SYSTEM) && existsSync(file)) {
      return send(200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file));
    }
    send(404, 'text/plain', 'Not found');
  } catch (error) {
    send(500, 'text/plain', String(error));
  }
}).listen(port, () => console.log(`Design system previews: http://localhost:${port}`));
