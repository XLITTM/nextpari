import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '.pharaoh-verify');
fs.mkdirSync(OUT, { recursive: true });

const EXPECTED = [
  'cat_10000.png',
  'scroll_1000.png',
  'nemes_200.png',
  'pyramid_100.png',
  'ring_50.png',
  'ankh_20.png',
  'canopic_10.png',
  'lotus_5.png',
  'cylinder_4.png',
  'harp_2.png',
  'sistrum_1.png',
];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--window-size=430,900', '--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 430, height: 900, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);

const failedRequests = [];
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/assets/games/pharaoh/') && res.status() !== 200) {
    failedRequests.push({ url, status: res.status() });
  }
});

await page.goto('http://127.0.0.1:5173/games/pharaoh', { waitUntil: 'networkidle0' });
await page.waitForSelector('[aria-label="Старт"]');

const idleTitle = await page.title();
await page.screenshot({ path: path.join(OUT, '01-idle.png'), fullPage: false });

await page.click('[aria-label="Старт"]');
await page.waitForFunction(
  () => document.querySelectorAll('.pharaoh-tile.is-flipped img').length >= 7,
  { timeout: 12000 },
);
await new Promise((r) => setTimeout(r, 600));

const afterPlay = await page.evaluate(() => ({
  status: document.querySelector('.pharaoh-banner')?.textContent?.trim() ?? '',
  flippedCount: document.querySelectorAll('.pharaoh-tile.is-flipped').length,
  tileImgs: [...document.querySelectorAll('.pharaoh-tile.is-flipped img')].map((img) => ({
    src: img.getAttribute('src'),
    alt: img.alt,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  })),
  flippedTexts: [...document.querySelectorAll('.pharaoh-tile.is-flipped')].map((el) =>
    (el.textContent || '').replace(/\s+/g, ' ').trim(),
  ),
  bodyHasSnakeOrFlail: /snake|flail/i.test(document.body.innerHTML),
}));

await page.screenshot({ path: path.join(OUT, '02-after-play.png'), fullPage: false });

await page.click('[aria-label="Правила"]');
await page.waitForSelector('[role="dialog"] img');
await new Promise((r) => setTimeout(r, 300));

const rules = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const imgs = [...(dialog?.querySelectorAll('img') ?? [])];
  return {
    title: dialog?.querySelector('h2')?.textContent?.trim() ?? '',
    imgCount: imgs.length,
    imgs: imgs.map((img) => ({
      src: img.getAttribute('src'),
      alt: img.alt,
      className: img.className,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    })),
    multipliers: [...(dialog?.querySelectorAll('span') ?? [])]
      .map((s) => s.textContent?.trim())
      .filter((t) => t && /^x\d+/.test(t)),
  };
});

await page.screenshot({ path: path.join(OUT, '03-rules.png'), fullPage: false });

const report = {
  idleTitle,
  failedRequests,
  afterPlay,
  rules,
  expectedAssets: EXPECTED,
  tileBroken: afterPlay.tileImgs.filter((i) => !i.complete || i.naturalWidth === 0),
  rulesBroken: rules.imgs.filter((i) => !i.complete || i.naturalWidth === 0),
  missingExpectedInRules: EXPECTED.filter(
    (name) => !rules.imgs.some((i) => (i.src || '').includes(name)),
  ),
};

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('SCREENSHOTS', OUT);

await browser.close();
