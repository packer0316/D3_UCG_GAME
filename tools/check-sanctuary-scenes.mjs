/** Real game scene switching, projection, GPU validation and review screenshots. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const baseUrl = process.env.SCENE_TEST_URL ?? 'http://127.0.0.1:5173';
const output = 'node_modules/.cache/sanctuaries';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], reports = [];
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error(m.text()); } });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const url = new URL(baseUrl); url.searchParams.set('debug', '');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__debug && window.__ugc?.client.profile, null, { timeout: 120000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 120000 });
  if (await page.locator('.debug-panel').isVisible()) await page.keyboard.press('Backquote');
  for (const [id, name] of [[21, 'rose-castle'], [22, 'tide-palace'], [23, 'maple-shrine']]) {
    await page.evaluate(id => window.__debug.scene(id), id);
    await page.waitForFunction(id => {
      const d = window.__debug;
      return d.ctx.services.get(d.tokens.SceneSystem).sceneType === id && d.ctx.layers.bg.getObjectByName(`scene_${id}`)?.visible;
    }, id);
    await page.waitForTimeout(2600);
    await page.evaluate(() => window.__debug.summon(1));
    await page.waitForFunction(() => window.__debug.fish.alive.size > 0, null, { timeout: 12000 });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${output}/${name}-game.png` });
    const report = await page.evaluate(id => {
      const d = window.__debug, ctx = d.ctx, bg = ctx.layers.bg, node = bg.getObjectByName(`scene_${id}`);
      let meshes = 0, triangles = 0, nonfinite = 0;
      node.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        const p = o.geometry.attributes.position;
        triangles += (o.geometry.index?.count ?? p.count) / 3;
        for (const n of p.array) if (!Number.isFinite(n)) nonfinite++;
      });
      const cam = ctx.stage.camera;
      return {
        id, theme: node.userData.theme, meshes, triangles, nonfinite,
        camera: { position: cam.position.toArray(), fov: cam.fov, rotationX: cam.rotation.x },
        visibleScenes: bg.children.filter(c => c.visible).map(c => c.name),
        glError: ctx.stage.renderer.getContext().getError(),
        reflectionSize: [node.userData.reflection.width, node.userData.reflection.height],
        environmentSize: node.userData.environment.width,
        shadowSize: node.userData.staticShadow.width,
        drawCalls: ctx.stage.renderer.info.render.calls,
      };
    }, id);
    assert.equal(report.nonfinite, 0, `${name}: finite geometry`);
    assert.ok(report.meshes > 12 && report.meshes < 95, `${name}: detail is batched into a bounded number of draws`);
    assert.deepEqual(report.camera.position, [5.251, -192.289, 61.57]);
    assert.equal(report.camera.fov, 32);
    assert.deepEqual(report.reflectionSize, [1024, 576]);
    assert.equal(report.environmentSize,256);
    assert.equal(report.shadowSize,2048);
    assert.deepEqual(report.visibleScenes, [`scene_${id}`]);
    assert.equal(report.glError, 0);
    reports.push(report);
    await page.evaluate(() => {
      const ctx = window.__debug.ctx;
      for (const [key, layer] of Object.entries(ctx.layers)) if (key !== 'bg') layer.visible = false;
      ctx.stage.overlay.visible = false;
      document.querySelector('.ui-root')?.style.setProperty('visibility', 'hidden');
    });
    await page.waitForTimeout(120);
    await page.locator('.game-canvas').screenshot({ path: `${output}/${name}.png` });
    await page.evaluate(() => {
      const ctx = window.__debug.ctx;
      for (const [key, layer] of Object.entries(ctx.layers)) if (key !== 'bg') layer.visible = true;
      ctx.stage.overlay.visible = true;
      document.querySelector('.ui-root')?.style.removeProperty('visibility');
    });
  }
  for (const [width, height, name] of [[430, 932, 'portrait'], [1920, 800, 'wide']]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${output}/maple-shrine-${name}.png` });
    assert.equal(await page.evaluate(() => window.__debug.ctx.stage.renderer.getContext().getError()), 0);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  // Same camera transition, different camera transition, then return to a cached scene.
  for (const id of [6, 2, 21]) {
    await page.evaluate(id => window.__debug.scene(id), id);
    await page.waitForTimeout(2400);
    assert.equal(await page.evaluate(() => {
      const d = window.__debug; return d.ctx.services.get(d.tokens.SceneSystem).sceneType;
    }), id);
  }
  assert.deepEqual(errors, [], 'No missing assets, shader compile errors or runtime errors');
  console.log(JSON.stringify({ reports, errors, screenshots: output }, null, 2));
} finally { await browser.close(); }
