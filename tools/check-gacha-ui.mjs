/** Isolated browser regression checks; never uses the player's browser profile. Start Vite first. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const baseUrl = process.env.GACHA_TEST_URL ?? 'http://127.0.0.1:5173';
const output = 'node_modules/.cache/gacha';
await mkdir(output, { recursive: true });
const errors = [], checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__ugc?.client.profile, null, { timeout: 60000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.keyboard.press('Backquote');
  await page.evaluate(() => { window.__debug.server.profile.profile.tickets = 0; window.__debug.server.sendProfile(); window.__ugc.panels.gacha.panel.open(); });
  await page.waitForFunction(() => window.__ugc.client.profile.tickets === 0);
  check('zero tickets disables both draws', await page.locator('.summon-draw:disabled').count() === 2);
  await page.waitForTimeout(500);
  check('WebGL shader compiled', await page.evaluate(() => !!window.__ugc.panels.gacha.effects.program));
  await page.screenshot({ path: `${output}/welcome.png` });
  // Real server request, currency and inventory receipt; no animation stub in this case.
  await page.evaluate(() => window.__debug.tickets(30));
  await page.waitForFunction(() => window.__ugc.client.profile.tickets === 30);
  const startDraws = await page.evaluate(() => window.__ugc.client.profile.stats.draws);
  await page.locator('.summon-draw.primary').click();
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'charging');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/sealed.png` });
  check('ten draw charged exactly ten tickets', await page.evaluate(() => window.__ugc.client.profile.tickets === 20));
  await page.evaluate(() => { const p = window.__ugc.panels.gacha; void p.draw(1); void p.draw(10); });
  check('busy rejects additional requests', await page.evaluate(n => window.__ugc.client.profile.stats.draws === n + 10, startDraws));
  await page.locator('.summon-skip').click();
  check('skip shows all ten real results', await page.locator('.summon-result-grid .is-revealed').count() === 10);
  check('skip releases timers', await page.evaluate(() => window.__ugc.panels.gacha.timers.size === 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${output}/ten-real.png` });
  await page.locator('.summon-result-grid .summon-card').first().click();
  check('result opens inspect view', await page.locator('.summon-inspect').count() === 1);
  await page.keyboard.press('Escape');
  check('first Escape closes only inspect', await page.evaluate(() => window.__ugc.panels.gacha.panel.isOpen && !window.__ugc.panels.gacha.overlay));
  await page.keyboard.press('Escape');
  check('second Escape closes panel and stops GPU', await page.evaluate(() => !window.__ugc.panels.gacha.panel.isOpen && !window.__ugc.panels.gacha.effects.running));
  await page.evaluate(() => window.__ugc.panels.gacha.panel.open());
  check('reopening preserves the last receipt', await page.locator('.summon-result-grid .is-revealed').count() === 10);
  await page.getByRole('button', { name: '卡池一覽 / 機率', exact: true }).click();
  check('pool shows all 35 rewards', await page.locator('.summon-pool-grid .summon-card').count() === 35);
  await page.waitForFunction(() => [...document.querySelectorAll('.summon-pool-grid img')].every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: `${output}/pool.png` });
  await page.getByRole('button', { name: '領域 5', exact: true }).click();
  check('scene filter contains all five scene cards', await page.locator('.summon-pool-grid .summon-card').count() === 5);
  await page.screenshot({ path: `${output}/scenes.png` });
  await page.getByRole('button', { name: '造物 7', exact: true }).click();
  check('decoration filter contains all seven illustrated cards', await page.locator('.summon-pool-grid .summon-card').count() === 7);
  await page.screenshot({ path: `${output}/decorations.png` });
  await page.keyboard.press('Escape');
  // Controlled receipt exercises every finish, including both SSR finishes, without changing production probabilities.
  await page.evaluate(() => {
    const client = window.__ugc.client;
    window.testOriginalDraw = client.draw.bind(client);
    window.testResults = [
      { kind:'fish', id:1, rarity:'N', isNew:false, copies:2 },
      { kind:'fish', id:14, rarity:'R', isNew:true },
      { kind:'fish', id:17, rarity:'SR', isNew:true },
      { kind:'fish', id:25, rarity:'SSR', isNew:true },
      { kind:'fish', id:27, rarity:'SSR', isNew:true },
      { kind:'scene', id:1, rarity:'R', isNew:false, gold:100000 },
      { kind:'scene', id:15, rarity:'SR', isNew:true },
      { kind:'deco', id:'plate_gold', rarity:'SSR', isNew:true, count:1 },
      { kind:'deco', id:'cube_red', rarity:'N', isNew:false, count:3 },
      { kind:'fish', id:24, rarity:'SSR', isNew:true },
    ];
    client.draw = async times => ({ ok: true, results: times === 1 ? [window.testResults[4]] : window.testResults });
  });
  await page.locator('.summon-draw.primary').click();
  // 發完牌停在 ready，玩家按一下才開始依序翻
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'ready');
  await page.waitForTimeout(1500);
  check('dealt cards wait for the player', await page.evaluate(() => window.__ugc.panels.gacha.phase === 'ready') && await page.locator('.summon-result-grid .is-revealed').count() === 0 && await page.locator('.summon-tap-hint').isVisible());
  await page.locator('.summon-tap-hint').click();
  await page.locator('.summon-spotlight').waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForTimeout(350);
  check('SSR receives a dedicated central spotlight', await page.locator('.summon-spotlight .summon-card').count() === 1);
  await page.screenshot({ path: `${output}/revealing.png` });
  // 紫卡以上逐張瞇牌：這組固定結果有 4 張 SSR + 2 張 SR，整輪約 30 秒
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'complete', null, { timeout: 45000 });
  check('automatic reveal completes all ten', await page.locator('.summon-result-grid .is-revealed').count() === 10);
  check('five distinct finishes shown', await page.evaluate(() => new Set([...document.querySelectorAll('.summon-result-grid .summon-card')].map(c => c.dataset.finish)).size === 5));
  await page.screenshot({ path: `${output}/ten-all-finishes.png` });
  await page.locator('.summon-draw:not(.primary)').click();
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'ready');
  await page.locator('.summon-result-grid .summon-card').click({ position: { x: 30, y: 20 } });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${output}/single-reveal.png` });
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'complete');
  check('single summon has one large card', await page.locator('.summon-result-grid.is-single .is-revealed').count() === 1);
  await page.screenshot({ path: `${output}/single.png` });
  // Delay server receipt across close/reopen. Pending still blocks a second draw.
  await page.evaluate(() => { window.__ugc.client.draw = () => new Promise(resolve => { window.testResolve = resolve; }); void window.__ugc.panels.gacha.draw(10); window.__ugc.panels.gacha.panel.close(); window.__ugc.panels.gacha.panel.open(); });
  check('pending request remains locked across reopen', await page.locator('.summon-draw:disabled').count() === 2);
  await page.evaluate(() => { window.__ugc.panels.gacha.panel.close(); window.testResolve({ok:true,results:window.testResults}); });
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'complete');
  await page.evaluate(() => window.__ugc.panels.gacha.panel.open());
  check('late receipt retained after close', await page.locator('.summon-result-grid .is-revealed').count() === 10);
  await page.evaluate(() => { window.__ugc.client.draw = async () => ({ok:false,results:[],reason:'測試：券數不足'}); });
  await page.locator('.summon-draw.primary').click();
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'complete');
  check('failure keeps previous result and unlocks buttons', await page.locator('.summon-result-grid .is-revealed').count() === 10 && await page.locator('.summon-draw:disabled').count() === 0);
  await page.locator('.ui-toast').last().waitFor({ state: 'detached', timeout: 6000 });
  await page.evaluate(() => { window.__ugc.client.draw = window.testOriginalDraw; window.__ugc.panels.gacha.panel.close(); window.__ugc.panels.cards.panel.open(); });
  check('collection has all 36 full-art cards plus selected preview', await page.locator('.collection-panel .summon-card').count() === 37);
  await page.screenshot({ path: `${output}/collection.png` });
  await page.evaluate(() => { window.__ugc.panels.cards.panel.close(); window.__ugc.panels.gacha.panel.open(); });
  // Portrait screen: three columns, scrolling all results, controls remain accessible.
  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${output}/mobile-ten.png` });
  check('mobile does not overflow horizontally', await page.evaluate(() => { const p = document.querySelector('.summon-panel'); return p.scrollWidth <= p.clientWidth + 2; }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: `${output}/landscape-ten.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__ugc.panels.gacha.panel.close(); window.__ugc.panels.gacha.panel.open(); });
  await page.locator('.summon-draw:not(.primary)').click();
  await page.waitForFunction(() => window.__ugc.panels.gacha.phase === 'complete');
  check('reduced motion bypasses animation and GPU', await page.evaluate(() => !window.__ugc.panels.gacha.effects.running && window.__ugc.panels.gacha.timers.size === 0));
  const fallback = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl' ? null : original.call(this, type, ...args); };
  });
  await fallback.goto(baseUrl);
  await fallback.waitForFunction(() => window.__ugc?.client.profile);
  await fallback.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await fallback.evaluate(() => window.__ugc.panels.gacha.panel.open());
  check('unavailable effect WebGL retains functional cards', await fallback.evaluate(() => window.__ugc.panels.gacha.effects.canvas.hidden && document.querySelectorAll('.summon-fan .summon-card').length === 5));
  await fallback.getByRole('button', { name:'卡池一覽 / 機率', exact:true }).click();
  check('effect fallback retains the full interactive pool', await fallback.locator('.summon-pool-grid .summon-card').count() === 35);
  await fallback.close();
  check('no runtime or shader errors', errors.length === 0);
  console.log(JSON.stringify({ checks, errors, screenshots: output }, null, 2));
} finally { await browser.close(); }
