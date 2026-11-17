// Offline only: npm install --no-save --package-lock=false playwright, start Vite, then run this file.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error(e.message));
  await page.goto('http://127.0.0.1:5173/tools/gacha-art.html');
  await page.waitForFunction(() => window.artStudio);
  const items = await page.evaluate(() => window.artStudio.items);
  const out = resolve('public/res/gacha/portraits');
  await mkdir(out, { recursive: true });
  for (const item of items) {
    const data = await page.evaluate(({kind, id}) => window.artStudio.render(kind, id), item);
    await writeFile(resolve(out, `${item.kind}-${item.id}.webp`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${item.kind}-${item.id}`);
  }
} finally { await browser.close(); }
