// Renders every .card of an HTML page to its own PNG (headless Chrome, GPU on, never --disable-gpu).
// Usage: node tools/cards/render.mjs <page.html> <outdir> [--chrome <dir>]
//   --chrome also shoots every card a second time with the channel chrome shown (body.show-chrome), for the proof sheet.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, basename } from 'node:path';

const FILE = process.argv[2], OUTDIR = process.argv[3];
const ci = process.argv.indexOf('--chrome'), CHROME = ci > 0 ? process.argv[ci + 1] : null;
const DIR = dirname(FILE);
mkdirSync(OUTDIR, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const srv = createServer((q, r) => {
  const p = join(DIR, decodeURIComponent(q.url.split('?')[0]));
  if (!existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p));
}).listen(0);
const sport = srv.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UDD = mkdtempSync(join(tmpdir(), 'cards-'));
const port = 9700 + Math.floor(Math.random() * 90);
const W = 2600;
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${UDD}`, `--window-size=${W},2000`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let t;
for (let i = 0; i < 80 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + JSON.stringify(m.params.args).slice(0, 300));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url.slice(-80));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: 2000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${sport}/${basename(FILE)}` });
await sleep(1500); await ev('document.fonts.ready.then(()=>1)');
await ev('Promise.all([...document.images].map(i=>i.decode().catch(()=>0)))'); await sleep(500);
const boxes = await ev(`[...document.querySelectorAll('.card')].map(c=>{const r=c.getBoundingClientRect();return [c.id,r.left+scrollX,r.top+scrollY,r.width,r.height]})`);
for (const [n, x, y, w, h] of boxes) {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 1 } });
  writeFileSync(join(OUTDIR, `${n}.png`), Buffer.from(s.result.data, 'base64'));
}
console.log(boxes.length + ' cards');
if (CHROME) {
  mkdirSync(CHROME, { recursive: true });
  await ev('document.body.classList.add("show-chrome"),1');
  const ph = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: ph, deviceScaleFactor: 1, mobile: false });
  await ev('window.scrollTo(0,0),1'); await sleep(800);
  const b2 = await ev(`[...document.querySelectorAll('.card')].map(c=>{const r=c.getBoundingClientRect();return [c.id,r.left+scrollX,r.top+scrollY,r.width,r.height]})`);
  for (const [n, x, y, w, h] of b2) {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 1 } });
    writeFileSync(join(CHROME, `${n}.png`), Buffer.from(s.result.data, 'base64'));
  }
  console.log('chrome pass done');
}
console.log(await ev('[...document.fonts].map(f=>f.family+" "+f.weight+" "+f.status).join(", ")'));
console.log(logs.join('\n') || 'no errors');
await send('Browser.close').catch(() => {}); await sleep(800); try { proc.kill(); } catch {} await sleep(400);
try { rmSync(UDD, { recursive: true, force: true }); } catch {}
srv.close(); process.exit(0);
