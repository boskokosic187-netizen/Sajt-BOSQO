// Builds the CV: tools/cv/cv.html -> media/cv/Bosko-Kosic-CV.pdf (A4, one page) and a preview PNG.
// usage: node tools/build_cv.mjs      (needs Chrome; the page is read from disk)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UDD = mkdtempSync(join(tmpdir(), 'cv-'));
const port = 9500 + Math.floor(Math.random() * 90);
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let t;
for (let i = 0; i < 80 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: pathToFileURL(join(ROOT, 'tools/cv/cv.html')).href });
await sleep(1500);
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true });
const fit = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ body: document.querySelector('.body').getBoundingClientRect().bottom, foot: document.querySelector('.foot').getBoundingClientRect().top, fonts: [...document.fonts].filter(f => f.status === 'loaded').length })` });
console.log('fit', fit.result.result.value);
mkdirSync(join(ROOT, 'media/cv'), { recursive: true });
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
writeFileSync(join(ROOT, 'media/cv/Bosko-Kosic-CV.pdf'), Buffer.from(pdf.result.data, 'base64'));
const png = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(ROOT, 'tools/cv/preview.png'), Buffer.from(png.result.data, 'base64'));
await send('Browser.close').catch(() => {});
await sleep(900); try { proc.kill(); } catch {} await sleep(400);
try { rmSync(UDD, { recursive: true, force: true }); } catch {}
console.log('written media/cv/Bosko-Kosic-CV.pdf');
