import { describe,expect,it } from 'vitest';
import { Box3,Mesh,Vector3 } from 'three';
import { DECO_GRID,GARDEN_DECO_DEFINES,decoFootprint,canPlaceDeco,validateDecoLayout } from '@game/ugc/DecoDefine';
import { createDecoObject,disposeDecoObject } from '@features/ugc/decor/DecoFactory';
import { GACHA_POOL,GACHA_RARITY_WEIGHT,SCENE_DUPLICATE_GOLD,applyGachaItem,rollGacha } from '@game/ugc/GachaDefine';
import { SCENE_LIST } from '@game/define/SceneDefine';
import { SCENE_RARITY } from '@game/ugc/CardDefine';
import { createInitialProfile,sanitizeProfile } from '@server-fake/ugc/ProfileStore';
import { validateSlots } from '@game/ugc/HomeRule';
import type { DecoPlacement } from '@game/ugc/UgcTypes';

describe('garden collection',()=>{
  it('adds exactly 6 one-cell, 3 two-cell, 2 three-cell and 1 four-cell objects',()=>{
    expect(GARDEN_DECO_DEFINES).toHaveLength(12);
    expect([1,2,3,4].map(c=>GARDEN_DECO_DEFINES.filter(d=>d.w*d.d===c).length)).toEqual([6,3,2,1]);
    expect(new Set(GARDEN_DECO_DEFINES.map(d=>d.id)).size).toBe(12);
  });
  for(const def of GARDEN_DECO_DEFINES)it(`${def.id}: complete 3D model fits its declared plot in both orientations`,()=>{
    for(const rot of [0,1] as const){
      const model=createDecoObject(def,rot);
      const size=new Box3().setFromObject(model).getSize(new Vector3());
      const f=decoFootprint(def,rot);
      expect(size.x).toBeLessThanOrEqual(f.w*DECO_GRID.cell);
      expect(size.y).toBeLessThanOrEqual(f.d*DECO_GRID.cell);
      expect(size.z).toBeLessThanOrEqual(def.h*DECO_GRID.cell);
      expect(size.z).toBeGreaterThan(3);
      let meshes=0,triangles=0;
      model.traverse(o=>{
        if(!(o as Mesh).isMesh)return;
        const mesh=o as Mesh;meshes++;
        const p=mesh.geometry.getAttribute('position');
        triangles+=(mesh.geometry.index?.count??p.count)/3;
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      });
      expect(meshes).toBeGreaterThanOrEqual(3);
      expect(meshes).toBeLessThanOrEqual(10);
      expect(triangles).toBeGreaterThan(500);
      expect(triangles).toBeLessThan(60000);
      disposeDecoObject(model);
    }
  });
  it('rotated three-cell decorations respect boundaries and overlap rejection',()=>{
    const fit:DecoPlacement={id:'banyan_tree',x:23,y:11,rot:1};
    expect(canPlaceDeco([],fit)).toBe(true);
    expect(canPlaceDeco([],{...fit,y:12})).toBe(false);
    expect(canPlaceDeco([],{...fit,rot:0})).toBe(false);
    expect(canPlaceDeco([fit],{id:'snowman',x:23,y:13,rot:0})).toBe(false);
  });
  it('all new rewards can be drawn, credited, placed and restored from a save',()=>{
    const p=createInitialProfile(0);
    const newItems=GACHA_POOL.filter(i=>i.kind==='scene'&&Number(i.id)>=20||i.kind==='deco'&&GARDEN_DECO_DEFINES.some(d=>d.id===i.id));
    expect(newItems).toHaveLength(16);
    for(const item of newItems){
      // Drive the actual weighted random selection into this item's bucket.
      const rarityKeys=Object.keys(GACHA_RARITY_WEIGHT) as (keyof typeof GACHA_RARITY_WEIGHT)[];
      const before=rarityKeys.slice(0,rarityKeys.indexOf(item.rarity)).reduce((n,r)=>n+GACHA_RARITY_WEIGHT[r],0);
      const bucket=GACHA_POOL.filter(i=>i.rarity===item.rarity);
      const random=[(before+.5)/100,(bucket.indexOf(item)+.5)/bucket.length];
      expect(rollGacha(1,{next:()=>random.shift()!})).toEqual([item]);
      expect(applyGachaItem(p,item).isNew).toBe(true);
      const again=applyGachaItem(p,item);
      expect(again.isNew).toBe(false);
      if(item.kind==='scene')expect(again.gold).toBe(SCENE_DUPLICATE_GOLD[item.rarity]);
      else expect(again.count).toBe(2);
    }
    p.home.deco=GARDEN_DECO_DEFINES.map((d,i)=>({id:d.id,x:(i%4)*5,y:Math.floor(i/4)*4,rot:0}));
    p.home.slots=[20,21,22,23].map(sceneType=>({sceneType,fishTypes:[1]}));
    expect(validateDecoLayout(p.home.deco,p.decos).ok).toBe(true);
    expect(validateSlots(p.home.slots,t=>!!p.fish[t],s=>p.scenes.includes(s)).ok).toBe(true);
    const restored=sanitizeProfile(JSON.parse(JSON.stringify(p)),1000)!;
    expect(restored.home.deco).toEqual(p.home.deco);
    expect(restored.home.slots).toEqual(p.home.slots);
    expect(restored.decos).toEqual(p.decos);
    expect(restored.scenes).toEqual(p.scenes);
    expect(GACHA_RARITY_WEIGHT).toEqual({N:62,R:27,SR:9,SSR:2});
    for(const scene of SCENE_LIST)expect(SCENE_RARITY[scene]).toBeDefined();
  });
});
