// Records the demo video docs/demo/robo-trassa-demo.mp4: a new project, a robot with one line sensor, a line follower
// built from blocks, a run on track 1. Russian captions and a drawn mouse pointer are added to the page only while
// recording; the app itself is unchanged.
// Needs the production build served and an ffmpeg with H.264 on PATH (or FFMPEG=/path/to/ffmpeg):
//   npm run build && npm run preview -- --port 4173 --strictPort
//   node scripts/record-demo.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.DEMO_URL ?? 'http://localhost:4173/';
const OUT = 'docs/demo/robo-trassa-demo.mp4';
const SIZE = { width: 1366, height: 768 }; // the target school laptop

// Runs in the page before the app: the pointer, the click ripple, the caption bar and the title cards.
function addOverlay() {
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
      .demo { position: fixed; pointer-events: none; z-index: 2147483647; } /* the later one is on top: the card hides the pointer */
      #demo-pointer { left: 0; top: 0; width: 26px; height: 30px; }
      #demo-ripple { width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #f59e0b; opacity: 0; }
      #demo-ripple.on { animation: demo-ripple .45s ease-out; }
      @keyframes demo-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.2); opacity: 0; } }
      #demo-caption { left: 50%; bottom: 20px; max-width: 720px; width: max-content; padding: 12px 24px; border-radius: 14px;
        background: rgba(17, 24, 39, .9); color: #fff; font-size: 22px; font-weight: 600; line-height: 1.35; text-align: center;
        box-shadow: 0 6px 24px rgba(0, 0, 0, .25); transform: translateX(-50%); opacity: 0; transition: opacity .3s; }
      #demo-caption.on { opacity: 1; }
      #demo-card { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        background: #243042; color: #fff; text-align: center; opacity: 0; transition: opacity .5s; }
      #demo-card.on { opacity: 1; }
      #demo-card b { font-size: 64px; } #demo-card span { font-size: 28px; color: #fcd34d; max-width: 1100px; }`;
    document.head.append(style);
    const add = (id, html = '') => {
      const el = Object.assign(document.createElement('div'), { id, className: 'demo', innerHTML: html });
      document.body.append(el);
      return el;
    };
    const caption = add('demo-caption'), ripple = add('demo-ripple');
    const pointer = add('demo-pointer', `<svg viewBox="0 0 26 30" width="26" height="30">
      <path d="M2 2v22l6-5.5 4 9 4-1.8-4-8.7h8z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
    const card = add('demo-card');
    pointer.style.transform = 'translate(-50px, -50px)';
    addEventListener('pointermove', e => { pointer.style.transform = `translate(${e.clientX - 2}px, ${e.clientY - 2}px)`; }, true);
    addEventListener('pointerdown', e => {
      Object.assign(ripple.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      ripple.classList.remove('on'); void ripple.offsetWidth; ripple.classList.add('on');
    }, true);
    window.demoCaption = text => {
      caption.classList.toggle('on', !!text);
      if (text) caption.textContent = text;
    };
    window.demoCard = (title, subtitle) => {
      card.classList.toggle('on', !!title);
      if (title) card.innerHTML = `<b>${title}</b><span>${subtitle}</span>`;
    };
  });
}

const videoDir = mkdtempSync(join(tmpdir(), 'demo-video-'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: SIZE, colorScheme: 'light', recordVideo: { dir: videoDir, size: SIZE } });
await context.addInitScript(addOverlay);
const page = await context.newPage();
const recordingStarted = Date.now();

const pause = ms => page.waitForTimeout(ms);
const caption = text => page.evaluate(t => window.demoCaption(t), text);
const card = (title, subtitle) => page.evaluate(([t, s]) => window.demoCard(t, s), [title, subtitle]);

// The real mouse moves in small eased steps, so the drawn pointer glides instead of jumping.
let at = { x: SIZE.width / 2, y: SIZE.height - 120 };
async function glide(to) {
  const from = at, steps = Math.max(8, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 12));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await pause(12);
  }
  at = to;
}
const center = async locator => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function click(target) {
  await glide(target.x === undefined ? await center(target) : target);
  await pause(250); await page.mouse.down(); await page.mouse.up();
}
// Press, move along the path, release.
async function drag(from, ...path) {
  await glide(from); await pause(300); await page.mouse.down();
  for (const point of path) await glide(point);
  await pause(200); await page.mouse.up(); await pause(400);
}

// Blocks: categories, flyout blocks and where the workspace's blocks are. Labels are the Russian block texts.
const pane = page.getByTestId('blocks-pane');
const category = name => pane.locator('.blocklyToolboxCategory', { hasText: name });
const flyoutBlock = label => page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: label }).first();
// The nth label with this exact text in the workspace and the outline of the block it belongs to.
// Blockly writes spaces in labels as non-breaking ones.
const label = (text, nth = 0) => page.evaluate(([text, nth]) => {
  const el = [...document.querySelectorAll('svg.blocklySvg .blocklyBlockCanvas text')]
    .filter(t => t.textContent.replaceAll(' ', ' ') === text)[nth];
  const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  return { ...rect(el), block: rect(el.closest('[data-id]').querySelector(':scope > .blocklyPath')) };
}, [text, nth]);
// A flyout block is held 10 px inside its top-left corner, so dropping at (x + 10, y + 10) puts that corner at (x, y).
// The drag starts with a short pull, so Blockly sees a drag and closes its flyout, then comes in level from the right:
// a block passing near another connection on the way gets a placeholder there, which can push the target away.
async function dragBlock(categoryName, blockLabel, corner) {
  await click(category(categoryName)); await pause(600);
  const b = await flyoutBlock(blockLabel).boundingBox(), to = { x: corner.x + 10, y: corner.y + 10 };
  await drag({ x: b.x + 10, y: b.y + 10 }, { x: b.x + 50, y: b.y + 20 }, { x: to.x + 140, y: to.y }, to);
}
// The mouth of a statement input sits right of the block's widest label («выполнить»), level with its own label.
const mouth = (widest, own = widest) => ({ x: widest.right + 10, y: own.top - 5 });
async function setNumber(text, nth, value) {
  const field = await label(text, nth);
  await click({ x: (field.left + field.right) / 2, y: (field.top + field.bottom) / 2 }); await pause(400);
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value, { delay: 180 });
  await pause(300); await page.keyboard.press('Enter'); await pause(500);
}

await page.goto(URL);
await page.getByTestId('to-program').waitFor();

// Title. The video starts once the card has faded in: the blank frames before it are cut.
await card('Робо-трасса', 'Собираем робота, программируем блоками и запускаем на трассе'); await pause(600);
const trimStart = (Date.now() - recordingStarted) / 1000;
await pause(3500); await card(null); await pause(600);

// Step 1: assembly
await caption('Шаг 1 — сборка: у робота пять слотов для датчиков');
await glide(await center(page.getByTestId('slot-front_center'))); await pause(1200);
await glide(await center(page.getByTestId('slot-left'))); await pause(1200);
await caption('Перетащим датчик линии в слот «перед-лево»'); await pause(1200);
await drag(await center(page.getByTestId('tray-line')), await center(page.getByTestId('slot-front_left')));
await caption('Датчик смотрит вниз и замечает чёрную линию');
await glide(await center(page.getByTestId('slot-row-front_left'))); await pause(2800);
await caption('Робот готов — переходим к программе'); await pause(1200);
await click(page.getByTestId('to-program')); await pause(1200);

// Step 2: the program
await caption('Шаг 2 — программа: сверху блоки, снизу тот же код на Python');
await glide({ x: 450, y: 300 }); await pause(1500); await glide({ x: 300, y: 620 }); await pause(2000);
await caption('Робот должен ехать всё время: берём «повторять всегда»');
const start = await label('при запуске');
await dragBlock('Циклы', 'повторять всегда', { x: start.block.left, y: start.block.bottom - 6 });
await caption('В Python сразу появился цикл while True');
await glide({ x: 160, y: 585 }); await pause(2500);
await caption('Внутрь кладём «если … иначе»');
const loop = await label('выполнить');
await dragBlock('Логика', 'иначе', mouth(loop)); await pause(1000);
await caption('Условие — датчик линии в слоте «перед-лево»');
const ifBlock = await label('если');
await dragBlock('Датчики', 'линия', { x: ifBlock.block.right - 8, y: ifBlock.top - 5 }); await pause(1000);
await caption('Видит линию — поворачиваем влево: левое колесо медленнее');
await dragBlock('Робот', 'моторы', mouth(await label('выполнить', 1)));
await setNumber('50', 0, '20'); await pause(800);
await caption('Не видит — поворачиваем вправо: правое колесо медленнее');
await dragBlock('Робот', 'моторы', mouth(await label('выполнить', 1), await label('иначе')));
await setNumber('50', 2, '20'); await pause(800);
await caption('Так робот едет вдоль края линии, слегка виляя');
await glide({ x: 260, y: 640 }); await pause(3500);

// Step 3: the run
await caption('Шаг 3 — запуск. Трасса «Первые шаги» уже выбрана');
await glide(await center(page.getByTestId('track-select'))); await pause(2200);
await click(page.getByTestId('run'));
await caption('Сейчас работают подсвеченные блок и строка Python');
await glide({ x: 330, y: 300 }); await pause(4500);
await caption('Под трассой — показания датчика в реальном времени');
await glide(await center(page.getByTestId('readings'))); await pause(1000);
await page.getByTestId('banner').waitFor({ timeout: 120_000 });
await caption('Робот доехал до финиша!'); await pause(3500); await caption(null);
await card('Попробуйте сами', 'wispwisp.github.io/robots'); await pause(4000);

const python = (await page.locator('[data-testid=python-editor] .cm-line').allTextContents()).join('\n');
const banner = await page.getByTestId('banner').textContent();
const video = page.video();
await context.close(); await browser.close();

console.log(python); console.log(banner);
execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-y', '-loglevel', 'error', '-ss', trimStart.toFixed(2), '-i', await video.path(),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
rmSync(videoDir, { recursive: true });
console.log(`Saved ${OUT}`);
