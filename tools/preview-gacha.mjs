import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__ugc?.client.profile, null, { timeout: 60_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.keyboard.press('Backquote');
  await page.evaluate(() => window.__ugc.panels.gacha.panel.open());
  await page.waitForTimeout(1600);
  await mkdir('node_modules/.cache/gacha', { recursive: true });
  await page.screenshot({ path: 'node_modules/.cache/gacha/welcome.png' });
  console.log(JSON.stringify({ errors, size: await page.locator('.summon-panel').boundingBox(), shader: await page.evaluate(() => !!window.__ugc.panels.gacha.effects.program) }));
} finally { await browser.close(); }
