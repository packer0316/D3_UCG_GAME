/** Browser projection regression: compare actual GPU uniforms against Chromium's independent DOM quads. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const baseUrl = process.env.GACHA_TEST_URL ?? 'http://127.0.0.1:5173';
const checks = [], errors = [];
let maxError = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__ugc?.client.profile);
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  if (await page.locator('.debug-panel').isVisible()) await page.keyboard.press('Backquote');
  await page.evaluate(() => window.__ugc.panels.gacha.panel.open());
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  const readQuad = async selector => {
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { quads } = await cdp.send('DOM.getContentQuads', { nodeId });
    assert.ok(quads?.length, `Missing projected quad: ${selector}`);
    return quads[0];
  };
  const verify = async (label, selector, index) => {
    const expected = await readQuad(`${selector} .summon-card-turn`);
    const actual = await page.evaluate(i => {
      const fx = window.__ugc.panels.gacha.effects, gl = fx.gl;
      if (!fx.program) throw new Error('Card effect shader did not compile');
      const a = gl.getUniform(fx.program, gl.getUniformLocation(fx.program, `uCornersA[${i}]`));
      const b = gl.getUniform(fx.program, gl.getUniformLocation(fx.program, `uCornersB[${i}]`));
      const r = fx.canvas.getBoundingClientRect();
      return [...a, ...b].map((v, j) => j % 2 === 0 ? r.x + v * r.width : r.y + v * r.height);
    }, index);
    const error = Math.max(...expected.map((v, i) => Math.abs(v - actual[i])));
    maxError = Math.max(maxError, error);
    assert.ok(error < .25, `${label}: shader differs from rendered card by ${error.toFixed(3)} px`);
    checks.push(label);
    return actual;
  };

  for (let i = 0; i < 5; i++) await verify(`fan ${i}: rotated and scaled outline`, `.fan-${i}`, i);
  const before = await readQuad('.fan-1 .summon-card-turn');
  const box = await page.locator('.fan-1').boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .35);
  await page.waitForTimeout(500);
  const after = await verify('hover tilt and lift update without resize', '.fan-1', 1);
  assert.ok(Math.max(...before.map((v, i) => Math.abs(v - after[i]))) > 3, 'Hover must actually move the card');

  await page.evaluate(() => {
    const turn = document.querySelector('.fan-1 .summon-card-turn');
    window.projectionAnimation = turn.animate([{ transform:'rotateY(0deg)' }, { transform:'rotateY(180deg)' }], {duration:1000, fill:'both'});
    window.projectionAnimation.pause(); window.projectionAnimation.currentTime = 360;
    window.__ugc.panels.gacha.effects.burst('blue', document.querySelector('.fan-1'));
  });
  await page.waitForTimeout(120);
  await verify('mid-flip back-face projection', '.fan-1', 1);
  await page.evaluate(() => { window.projectionAnimation.currentTime = 690; });
  await page.waitForTimeout(120);
  const flipped = await verify('mid-flip front-face projection with reversed winding', '.fan-1', 1);
  const burst = await page.evaluate(() => {
    const fx = window.__ugc.panels.gacha.effects, gl = fx.gl, r = fx.canvas.getBoundingClientRect();
    const origin = gl.getUniform(fx.program, gl.getUniformLocation(fx.program, 'uOrigin'));
    return [r.x + origin[0] * r.width, r.y + origin[1] * r.height];
  });
  for (let axis = 0; axis < 2; axis++) {
    const center = (flipped[axis] + flipped[axis+2] + flipped[axis+4] + flipped[axis+6]) / 4;
    assert.ok(Math.abs(burst[axis] - center) < .25, 'Burst origin must follow the projected card');
  }
  checks.push('reveal burst follows the moving card center');
  await page.evaluate(() => window.projectionAnimation.cancel());
  await page.mouse.move(30, 30);
  await page.waitForTimeout(500);
  await mkdir('node_modules/.cache/gacha', { recursive: true });
  await page.screenshot({ path: 'node_modules/.cache/gacha/projected-effects.png' });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(150);
  await verify('viewport / design-scale changes retain alignment', '.fan-3', 3);
  await page.evaluate(() => { document.querySelector('.fan-0').style.display = 'none'; });
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => {
    const fx = window.__ugc.panels.gacha.effects;
    return fx.gl.getUniform(fx.program, fx.gl.getUniformLocation(fx.program, 'uCount'));
  }), 4);
  await verify('hidden cards are omitted and remaining quads stay aligned', '.fan-1', 0);
  assert.ok(await page.evaluate(() => {
    const fx = window.__ugc.panels.gacha.effects;
    return fx.gl.getError() === fx.gl.NO_ERROR;
  }), 'WebGL must remain error-free');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, maxCornerErrorPx: maxError, errors }, null, 2));
} finally { await browser.close(); }
