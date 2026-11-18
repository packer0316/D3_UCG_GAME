/** Full client/server decorating workflow, isolated from the player's save. Requires Vite. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile } from 'node:fs/promises';
const base=process.env.GARDEN_TEST_URL??'http://127.0.0.1:5173';
const output='node_modules/.cache/garden';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[],checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${base}/?debug`);
 await page.waitForFunction(()=>window.__debug&&window.__ugc?.client.profile,null,{timeout:120000});
 await page.locator('#loading').waitFor({state:'detached',timeout:120000});
 if(await page.locator('.debug-panel').isVisible())await page.keyboard.press('Backquote');
 // Exercise a normal starter save before any rewards or debug unlocks.
 const starterInventory=await page.evaluate(()=>window.__ugc.client.profile.decos);
 await page.evaluate(()=>window.__ugc.decor.enter());
 await page.waitForFunction(()=>window.__ugc.decor.active);
 await page.waitForTimeout(2300);
 check('starter save shows the full catalog without unlocking rewards',await page.locator('.ugc-decor-item').count()===19);
 check('all twelve new models remain visible when unowned',await page.locator('.ugc-decor-item.unowned').count()===16);
 await page.waitForFunction(()=>[...document.querySelectorAll('.ugc-decor-item img')].every(i=>i.complete&&i.naturalWidth));
 await page.locator('[data-deco-id="pumpkin_lantern"]').click({force:true});
 check('unowned card explains acquisition instead of allowing placement',await page.evaluate(()=>window.__ugc.decor.hand===null&&document.querySelector('[data-deco-id="pumpkin_lantern"]').textContent.includes('未擁有 · 抽卡取得')));
 await page.getByRole('button',{name:'向右瀏覽造物',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.ugc-decor-palette').scrollLeft>100);
 check('catalog arrows expose offscreen decorations',await page.locator('.ugc-decor-palette').evaluate(e=>e.scrollLeft>100));
 await page.getByRole('button',{name:'已擁有（3）',exact:true}).click();
 check('owned filter keeps starter decorations available',await page.locator('.ugc-decor-item').count()===3);
 await page.locator('[data-deco-id="cube_white"]').click();
 await clickCell(5,9);
 check('starter cube still places through pointer input',await page.evaluate(()=>window.__ugc.decor.items.length===1));
 await page.getByRole('button',{name:'全部造物（19）',exact:true}).click();
 check('switching catalog filters retains the in-progress layout',await page.evaluate(()=>window.__ugc.decor.items.length===1&&window.__ugc.decor.hand.id==='cube_white'));
 await page.keyboard.press('Escape');
 await page.locator('.ugc-decor-palette').evaluate(e=>e.scrollLeft=0);
 await page.locator('.ui-toast').last().waitFor({state:'detached',timeout:6000});
 await page.screenshot({path:`${output}/starter-catalog.png`});
 check('viewing the catalog does not grant or consume inventory',await page.evaluate(before=>JSON.stringify(window.__ugc.client.profile.decos)===JSON.stringify(before),starterInventory));
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.waitForFunction(()=>!window.__ugc.decor.active);
 await page.reload();
 await page.waitForFunction(()=>window.__ugc?.client.profile,null,{timeout:120000});
 await page.locator('#loading').waitFor({state:'detached',timeout:120000});
 if(await page.locator('.debug-panel').isVisible())await page.keyboard.press('Backquote');
 await page.evaluate(()=>window.__ugc.decor.enter());
 await page.waitForFunction(()=>window.__ugc.decor.active);
 check('existing three-cube save also shows all new decorations after reload',await page.locator('.ugc-decor-item').count()===19);
 check('cancel and reload preserve the original save',await page.evaluate(before=>window.__ugc.decor.items.length===0&&JSON.stringify(window.__ugc.client.profile.decos)===JSON.stringify(before),starterInventory));
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.waitForFunction(()=>!window.__ugc.decor.active);
 // Only replace the RNG inside the real server draw handler, never its cost/inventory/protocol logic.
 const rewards=await page.evaluate(async()=>{
  const {GACHA_POOL,GACHA_RARITY_WEIGHT}=await import('/src/game/ugc/GachaDefine.ts');
  const {GARDEN_DECO_DEFINES}=await import('/src/game/ugc/DecoDefine.ts');
  const fresh=GACHA_POOL.filter(i=>i.kind==='scene'&&Number(i.id)>=20||i.kind==='deco'&&GARDEN_DECO_DEFINES.some(d=>d.id===i.id));
  const server=window.__debug.server,original=server.handlers.get('U2G_GACHA_DRAW_REQ');
  window.restoreGardenDraw=()=>server.handlers.set('U2G_GACHA_DRAW_REQ',original);
  server.handlers.set('U2G_GACHA_DRAW_REQ',data=>{
   const values=window.gardenExpected.flatMap(item=>{
    const keys=Object.keys(GACHA_RARITY_WEIGHT),before=keys.slice(0,keys.indexOf(item.rarity)).reduce((n,r)=>n+GACHA_RARITY_WEIGHT[r],0);
    const bucket=GACHA_POOL.filter(i=>i.rarity===item.rarity),index=bucket.findIndex(i=>i.kind===item.kind&&i.id===item.id);
    return [(before+.5)/100,(index+.5)/bucket.length];
   });
   const next=server.rng.next;server.rng.next=()=>values.shift();try{original(data);}finally{server.rng.next=next;}
  });
  window.__debug.tickets(30);return fresh;
 });
 await page.waitForFunction(()=>window.__ugc.client.profile.tickets===40);
 await page.locator('.ui-toast').last().waitFor({state:'detached',timeout:6000});
 const beforeDraws=await page.evaluate(()=>window.__ugc.client.profile.stats.draws);
 const batches=[rewards.slice(0,10),...rewards.slice(10).map(i=>[i])];
 await page.evaluate(()=>window.__ugc.panels.gacha.panel.open());
 for(const batch of batches){
  await page.evaluate(batch=>{window.gardenExpected=batch;void window.__ugc.panels.gacha.draw(batch.length);},batch);
  await page.waitForFunction(()=>window.__ugc.panels.gacha.phase==='charging');
  await page.locator('.summon-skip').click();
  check(`real draw credits ${batch.map(i=>i.id).join(', ')}`,await page.evaluate(batch=>JSON.stringify(window.__ugc.panels.gacha.results.map(({kind,id,rarity})=>({kind,id,rarity})))===JSON.stringify(batch),batch));
  await page.waitForFunction(()=>[...document.querySelectorAll('.summon-result-grid img')].every(i=>i.complete&&i.naturalWidth));
  if(batch.length===10||batch[0].id==='celestial_fountain'){
   await page.waitForTimeout(900);await page.screenshot({path:`${output}/${batch.length===10?'new-ten-draw':'new-single-draw'}.png`});
  }
 }
 check('sixteen new rewards cost sixteen tickets and update draw statistics',await page.evaluate(n=>window.__ugc.client.profile.tickets===24&&window.__ugc.client.profile.stats.draws===n+16,beforeDraws));
 await page.evaluate(()=>{window.restoreGardenDraw();window.__ugc.panels.gacha.panel.close();});
 check('new scene can be saved to home',await page.evaluate(async()=>(await window.__ugc.client.saveHome([{sceneType:23,fishTypes:[1]}])).ok));
 await page.evaluate(()=>window.__ugc.decor.enter());
 await page.waitForFunction(()=>window.__ugc.decor.active);
 await page.locator('[data-deco-id="pumpkin_lantern"]').click();
 await page.evaluate(()=>window.__debug.unlockAll());
 await page.waitForFunction(()=>document.querySelector('[data-deco-id="celestial_fountain"]').textContent.includes('剩 5 / 5'));
 check('inventory updates refresh the open palette and retain the selected item',await page.evaluate(()=>window.__ugc.decor.hand.id==='pumpkin_lantern'&&document.querySelector('[data-deco-id="bar_yellow"]').getAttribute('aria-disabled')==='false'));
 await page.waitForTimeout(2300);
 await page.getByRole('button',{name:'清空',exact:true}).click();
 const definitions=await page.evaluate(async()=>{
  const {GARDEN_DECO_DEFINES}=await import('/src/game/ugc/DecoDefine.ts');return GARDEN_DECO_DEFINES;
 });
 check('all twelve illustrated items appear in the palette',await page.locator('.ugc-decor-item[data-deco-id]').count()===19);
 await page.waitForFunction(()=>[...document.querySelectorAll('.ugc-decor-item img')].every(i=>i.complete&&i.naturalWidth));
 async function clickCell(x,y){
  const p=await page.evaluate(({x,y})=>{
   const stage=window.__debug.ctx.stage,rect=stage.canvas.getBoundingClientRect();
   const p=stage.camera.position.clone().set(-120+(x+.5)*10,10+(y+.5)*10,0).project(stage.camera);
   return {x:rect.left+(p.x+1)*.5*rect.width,y:rect.top+(1-p.y)*.5*rect.height};
  },{x,y});
  await page.mouse.click(p.x,p.y);
 }
 let firstUuid;
 for(let i=0;i<definitions.length;i++){
  const def=definitions[i],rot=i===8||i===9?1:0;
  await page.locator(`[data-deco-id="${def.id}"]`).click();
  if(rot)await page.keyboard.press('r');
  const x=2+(i%4)*5,y=5+Math.floor(i/4)*3,w=rot?def.d:def.w,d=rot?def.w:def.d;
  await clickCell(x+Math.floor((w-1)/2),y+Math.floor((d-1)/2));
  check(`${def.id} placed from real pointer input`,await page.evaluate(n=>window.__ugc.decor.items.length===n,i+1));
  const uuid=await page.evaluate(()=>window.__debug.ctx.layers.deco.getObjectByName('deco_pumpkin_lantern').uuid);
  if(i===0)firstUuid=uuid;else assert.equal(uuid,firstUuid,'unchanged models retain their GPU buffers while adding another item');
 }
 await page.keyboard.press('Escape');
 await page.locator('[data-deco-id="pumpkin_lantern"]').click();
 await clickCell(2,5);
 check('occupied cell rejects a second decoration',await page.evaluate(()=>window.__ugc.decor.items.length===12));
 await page.keyboard.press('Escape');
 await page.locator('[data-deco-id="rose_pergola"]').click();
 await clickCell(23,7);
 check('three-cell object cannot cross grid boundary',await page.evaluate(()=>window.__ugc.decor.items.length===12));
 await page.keyboard.press('Escape');
 await page.locator('.ugc-decor-palette').evaluate(e=>e.scrollLeft=0);
 await page.screenshot({path:`${output}/editor.png`});
 const saved=await page.evaluate(()=>window.__ugc.decor.items);
 await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.waitForFunction(()=>!window.__ugc.decor.active);
 check('server stored all twelve placements',await page.evaluate(s=>JSON.stringify(window.__ugc.client.profile.home.deco)===JSON.stringify(s),saved));
 await page.waitForTimeout(700);
 await page.screenshot({path:`${output}/home.png`});
 await page.reload();
 await page.waitForFunction(()=>window.__ugc?.client.profile,null,{timeout:120000});
 await page.locator('#loading').waitFor({state:'detached',timeout:120000});
 check('placements survive reload',await page.evaluate(s=>JSON.stringify(window.__ugc.client.profile.home.deco)===JSON.stringify(s),saved));
 await page.evaluate(()=>window.__ugc.decor.enter());await page.waitForFunction(()=>window.__ugc.decor.active);
 const count=await page.evaluate(()=>window.__debug.ctx.layers.deco.getObjectByName('ugc_deco').children.length);
 check('reopened editor rebuilds twelve 3D decorations',count===12);
 await page.getByRole('button',{name:'清空',exact:true}).click();
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.waitForFunction(()=>!window.__ugc.decor.active);
 check('cancel preserves saved decoration layout',await page.evaluate(s=>JSON.stringify(window.__ugc.client.profile.home.deco)===JSON.stringify(s),saved));
 check('game has no WebGL error',await page.evaluate(()=>window.__debug.ctx.stage.renderer.getContext().getError()===0));
 // Asset contact sheet: inspect each original illustration without altering project artwork.
 const manifest=JSON.parse(await readFile('docs/HOMESTEAD-ART-PROMPTS.json','utf8'));
 const art=await browser.newPage({viewport:{width:1600,height:670}});
 await art.goto(base);
 await art.setContent(`<style>body{margin:0;padding:16px;background:#111923;color:#e8dcc3;font:13px sans-serif;display:grid;align-content:start;grid-template-columns:repeat(8,1fr);gap:12px}figure{margin:0}img{width:100%;aspect-ratio:2/3;object-fit:cover}figcaption{height:36px;padding:8px 0}</style>${manifest.assets.map(e=>`<figure><img src="${base}/res/gacha/illustrations/${e.name}.webp"><figcaption>${e.name}</figcaption></figure>`).join('')}`);
 await art.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 await art.screenshot({path:`${output}/card-art.png`,fullPage:true});await art.close();
 const models=await browser.newPage({viewport:{width:1600,height:1200}});
 models.on('pageerror',e=>errors.push(e.message));models.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await models.goto(`${base}/tools/garden-review.html`);await models.waitForFunction(()=>window.reviewReady);
 await models.waitForTimeout(500);await models.screenshot({path:`${output}/models.png`});await models.close();
 check('no missing art, runtime or shader errors',errors.length===0);
 console.log(JSON.stringify({checks,errors,screenshots:output},null,2));
}finally{await browser.close();}
