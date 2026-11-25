// ATS-friendly CVs: one column, standard headings, no photo, text in reading order.
// One data set, four role variants -> media/cv/ats/Bosko-Kosic-CV-<role>.pdf (+ the HTML in tools/cv/ats/).
// usage: node tools/build_cv_ats.mjs        (needs Chrome; GPU stays on)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Change here once the custom LinkedIn URL exists (e.g. linkedin.com/in/boskokosic).
const LINKEDIN = { href: 'https://www.linkedin.com/in/bo%C5%A1ko-kosi%C4%87-37aa8925a/', text: 'linkedin.com/in/boško-kosić-37aa8925a' };

// ---------- shared facts (only what Boško's CV, site and projects already state) ----------
const B = {
  billboards: 'Concept, design, animation and delivery of <b>50+ billboards and DOOH screens</b> across Belgrade, each shipped with its social, web and email set.',
  fsu: 'Art direction for the Faculty of Contemporary Arts: <b>80+ campaign, exhibition and event identities</b>.',
  series: 'Content systems for social: <b>eight series, 330+ assets</b>, built so the last post looks as considered as the first.',
  enrol: 'Enrolment campaigns for three schools at once: one message, three identities.',
  meta: 'Paid social creatives for Meta (feed, story, reels), with every element placed inside the placement safe zones.',
  python: 'Advanced <b>Claude Code</b> user: my own production pipelines and Python scripts that batch-render and export every format and size from one master file.',
  print: 'Print production for billboards, roll-ups and posters: press-ready CMYK PDFs (FOGRA39).',
  aiProd: 'AI imagery and video in daily production: generated scenes, composited and finished in Photoshop and After Effects.',
};
const JOB_GROUP = { when: '2024 — now', title: 'In-house Campaign & Motion Designer', org: 'Private education group (IT college, art faculty, IT high school), Belgrade' };
const BALLIES = { when: '2023 — 2026', title: 'Digital Artist', org: 'Ballies, Web3 sports',
  items: ['Built a team of characters as a layered system for a <b>9,999-piece collection</b>.', 'Three years of launches, seasons and key art with the same cast, in still and motion.'] };
const FREELANCE = { when: '2020 — now', title: 'Freelance Visual & Motion Designer', org: 'Brands and studios' };
const BABYBOO = '<b>Baby Boo</b>, natural cosmetics: <b>AI product films</b> and stills with no studio days, edited for Reels and TikTok, plus hand-drawn mascots cut into parts and animated.';
const BECLUTCH = '<b>BeClutch</b>: launch and product key visuals.';
const WEB = '<b>UI/UX and web</b>: designed and coded my own portfolio site, bosko.trif.rs, with four working interface prototypes (web shop, live game app, campaign dashboard, watch face).';
const MICRO1 = { when: 'Jun 2026', title: 'Adobe Illustrator Expert, AI training data', org: 'micro1', items: ['Expert Illustrator tasks and evaluation used to train AI models.'] };
const TA = { when: '2024 — now', title: 'Teaching Assistant', org: 'ITS, Information Technology School, Belgrade', items: ['Graphic Design and NFT Technology courses: practical classes, briefs and feedback on student work.'] };
const LINK = { when: '2023', title: 'Graphic Designer', org: 'LINK Group', items: ['Campaign and social visuals for an education group with several schools.'] };
const CLIENTS = 'Faculty of Contemporary Arts, Information Technology School, IT High School, Ballies, Wall Street Games, BeClutch, Baby Boo, micro1, Telegraf, LINK Group';

// ---------- the four role variants: title, summary, order of skills and bullets ----------
const VARIANTS = [
  { slug: 'Performance-Motion', title: 'Motion Designer, Performance & Ad Creatives',
    summary: 'Motion and visual designer with 5+ years of making creatives that have to work in a second: paid social, Reels and TikTok, and 50+ billboards and DOOH screens. I turn one idea into hooks, variants and every placement, use AI image and video tools in daily production, and automate production with Claude Code and my own Python scripts.',
    skills: ['Ad creatives for paid social (Meta, TikTok, Reels)', 'Hooks and creative variants per brief', 'Motion design and 2D animation', 'Video editing for 9:16, 1:1, 4:5 and 16:9', 'AI image and video production', 'Billboards and DOOH', 'Key visuals and compositing', 'Automation with Claude Code and Python'],
    tools: 'After Effects, Premiere Pro, Photoshop, Illustrator, Figma, Midjourney, Nano Banana, ChatGPT Images, Higgsfield, ElevenLabs, Freepik, Claude Code, Python, HTML/CSS/JS',
    group: ['billboards', 'meta', 'python', 'series', 'fsu'], free: [BABYBOO, BECLUTCH, WEB] },
  { slug: 'AI-Creative', title: 'AI Creative Designer, Image & Video',
    summary: 'Visual and motion designer (5+ years) who builds AI image and video into finished, on-brand production. Product films and stills with no studio days, campaign key visuals and social at scale, all finished by hand. I also train AI models as an Illustrator expert.',
    skills: ['AI image production', 'AI product films and video', 'Compositing and retouching', 'Campaign key visuals', 'Motion design and video editing', 'Social content at scale', 'Brand consistency across formats', 'Automation with Claude Code and Python'],
    tools: 'Midjourney, Nano Banana, ChatGPT Images, Higgsfield, ElevenLabs, Freepik, Photoshop, Illustrator, After Effects, Premiere Pro, Figma, Claude Code, Python, HTML/CSS/JS',
    group: ['aiProd', 'series', 'billboards', 'fsu', 'python'], free: [BABYBOO, BECLUTCH, WEB], micro1First: true },
  { slug: 'Brand-Campaign', title: 'Campaign & Brand Designer',
    summary: 'Campaign and brand designer with 5+ years of taking one idea to every format: from a social post to a city billboard. Art direction for an art faculty (80+ campaign, exhibition and event identities), 50+ billboards and DOOH screens in Belgrade, brand systems that stay consistent across hundreds of assets, and motion when the idea needs to move.',
    skills: ['Campaign concepts and key visuals', 'Art direction', 'Brand systems and visual identity', 'Billboards, DOOH and print', 'Social content systems', 'Editorial and poster design', 'Motion design', 'AI image production'],
    tools: 'Photoshop, Illustrator, InDesign, After Effects, Premiere Pro, Figma, Midjourney, Nano Banana, ChatGPT Images, Higgsfield, ElevenLabs, Freepik, Claude Code, Python, HTML/CSS/JS',
    group: ['fsu', 'billboards', 'enrol', 'series', 'print'], free: [BABYBOO, BECLUTCH, WEB] },
  { slug: 'Motion-Designer', title: 'Motion Designer, Brand & Product',
    summary: 'Motion designer who also designs, with 5+ years of animating brands, characters and campaigns: 50+ animated billboards and DOOH screens, a 9,999-piece character collection with three years of launches in motion, and AI product films for Reels and TikTok. I design the frame, animate it and deliver it to every format.',
    skills: ['Motion design', '2D and character animation', 'Animated billboards and DOOH', 'Brand motion and title design', 'Video editing', 'AI video production', 'Key visuals and compositing', 'Automation with Claude Code and Python'],
    tools: 'After Effects, Premiere Pro, Photoshop, Illustrator, Figma, Midjourney, Nano Banana, ChatGPT Images, Higgsfield, ElevenLabs, Freepik, Claude Code, Python, HTML/CSS/JS',
    group: ['billboards', 'series', 'fsu', 'meta', 'python'], free: [BABYBOO, BECLUTCH, WEB], balliesFirst: true },
];

const esc = (s) => s.replace(/&(?!amp;|#)/g, '&amp;');
const job = (j) => `<div class="job"><h3>${esc(j.title)} <span>| ${esc(j.org)} | ${j.when}</span></h3><ul>${j.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;

function html(v) {
  const group = { ...JOB_GROUP, items: v.group.map((k) => B[k]) };
  const free = { ...FREELANCE, items: v.free };
  let jobs = [group, BALLIES, free, TA, MICRO1, LINK];
  if (v.micro1First) jobs = [group, free, MICRO1, BALLIES, TA, LINK];
  if (v.balliesFirst) jobs = [group, BALLIES, free, TA, MICRO1, LINK];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Boško Kosić — ${esc(v.title)} — CV</title>
<meta name="author" content="Boško Kosić">
<style>
@font-face { font-family: "Archivo"; font-weight: 300 900; font-stretch: 62% 125%; src: url(../../../media/fonts/archivo-v25-latin-ext.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Archivo"; font-weight: 300 900; font-stretch: 62% 125%; src: url(../../../media/fonts/archivo-v25-latin.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { width: 210mm; min-height: 297mm; padding: 10mm 15mm 9mm; background: #fff; color: #111; font: 400 8.8pt/1.34 "Archivo", Arial, sans-serif; }
a { color: inherit; text-decoration: none; }
h1 { font-weight: 800; font-stretch: 112%; font-size: 20pt; line-height: 1.05; letter-spacing: -0.01em; }
.role { margin-top: 1.2mm; font-weight: 600; font-size: 11.5pt; color: #d63a12; }
.contact { margin-top: 2.2mm; font-size: 8.8pt; color: #333; }
h2 { margin: 3.6mm 0 1.4mm; padding-bottom: 0.8mm; border-bottom: 0.3mm solid #111; font-weight: 800; font-stretch: 100%; font-size: 9.6pt; letter-spacing: 0.08em; text-transform: uppercase; }
p { max-width: 178mm; }
.job + .job { margin-top: 1.8mm; }
.job h3 { font-size: 9.6pt; font-weight: 700; }
.job h3 span { font-weight: 400; color: #444; }
ul { margin: 0.8mm 0 0 4.6mm; }
li { padding-left: 0.6mm; }
li + li { margin-top: 0.2mm; }
li b, p b { font-weight: 700; }
.cols { columns: 2; column-gap: 8mm; }
.cols li { break-inside: avoid; }
.edu div + div { margin-top: 1mm; }
</style></head><body>
<h1>Boško Kosić</h1>
<p class="role">${esc(v.title)}</p>
<p class="contact">Belgrade, Serbia | Remote (CET, UTC+1), full-time or contract | <a href="mailto:boskokosic187@gmail.com">boskokosic187@gmail.com</a> | Portfolio: <a href="https://bosko.trif.rs/">bosko.trif.rs</a> | LinkedIn: <a href="${LINKEDIN.href}">${LINKEDIN.text}</a></p>

<h2>Summary</h2>
<p>${esc(v.summary)}</p>

<h2>Experience</h2>
${jobs.map(job).join('\n')}

<h2>Skills</h2>
<ul class="cols">${v.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>

<h2>Tools</h2>
<p>${esc(v.tools)}</p>

<h2>Education</h2>
<div class="edu"><div><b>Master's, Digital Communication and Multimedia</b> | ITS Belgrade | in progress</div><div><b>B.Sc. Computer Multimedia Engineering</b> | ITS Belgrade | 2022</div></div>

<h2>Languages</h2>
<p>Serbian (native), English (professional working proficiency)</p>

<h2>Selected clients</h2>
<p>${esc(CLIENTS)}</p>
</body></html>`;
}

// ---------- render ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UDD = mkdtempSync(join(tmpdir(), 'cvats-'));
const port = 9600 + Math.floor(Math.random() * 90);
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${UDD}`,
  '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let t;
for (let i = 0; i < 80 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const HTML_DIR = join(ROOT, 'tools/cv/ats'); const OUT = join(ROOT, 'media/cv/ats');
mkdirSync(HTML_DIR, { recursive: true }); mkdirSync(OUT, { recursive: true });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 2, mobile: false });
for (const v of VARIANTS) {
  const file = join(HTML_DIR, `${v.slug}.html`);
  writeFileSync(file, html(v));
  await send('Page.navigate', { url: pathToFileURL(file).href });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true });
  const h = await send('Runtime.evaluate', { returnByValue: true, expression: 'document.body.scrollHeight' });
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  writeFileSync(join(OUT, `Bosko-Kosic-CV-${v.slug}.pdf`), Buffer.from(pdf.result.data, 'base64'));
  const png = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(HTML_DIR, `${v.slug}.png`), Buffer.from(png.result.data, 'base64'));
  console.log(v.slug, 'height px', h.result.result.value, h.result.result.value > 1123 ? 'OVER ONE PAGE' : 'one page');
}
await send('Browser.close').catch(() => {});
await sleep(900); try { proc.kill(); } catch {} await sleep(400);
try { rmSync(UDD, { recursive: true, force: true }); } catch {}
