import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ActionManager } from '../src/core/tween/ActionManager';
import { CsdLibrary } from '../src/engine/csd/CsdPlayer';
import type { AssetManager } from '../src/engine/assets/AssetManager';
import { WinCircleType } from '../src/game/define/FishDefine';
import { WIN_CIRCLE_CSB, WIN_CIRCLE_OTHER } from '../src/game/define/RewardDefine';
import { WinCircle } from '../src/game/show/WinCircle';
import type { OverlayDeps } from '../src/game/show/OverlayDeps';

/** 只讀 public/res 的 json（csb 轉出來的），圖 / 字型不載入：測播放流程，不測畫面 */
const assets = {
  json: async (p: string) => JSON.parse(readFileSync(`public/res/${p}`, 'utf8')),
  atlas: async () => undefined,
  font: async () => undefined,
  imageAtlas: async () => undefined,
  peekAtlas: () => undefined,
  peekImageAtlas: () => undefined,
  peekFont: () => undefined,
  // 依名稱找圖：回傳假 frame（測試環境沒有 Sprite 內容，只看程式有沒有走「換圖 + 顯示」）
  findFrame: (name: string) => ({ atlas: {}, frame: { name } }),
} as unknown as AssetManager;

type Inst = import('../src/engine/csd/CsdPlayer').CsdInstance;
const instOf = (c: WinCircle) => (c as unknown as { inst: Inst }).inst;

const FPS = 60;

async function setup(type: (typeof WinCircleType)[keyof typeof WinCircleType]) {
  const lib = new CsdLibrary(assets);
  await lib.load(WIN_CIRCLE_CSB[type as 1 | 2 | 3]);
  const actions = new ActionManager();
  const layer = new THREE.Group();
  const deps = { assets, actions, layer } as unknown as OverlayDeps;
  const step = (c: WinCircle, frames: number) => {
    for (let i = 0; i < frames; i++) {
      c.update(1 / FPS);
      actions.update(1 / FPS);
    }
  };
  return { lib, deps, layer, step };
}

describe('獎圈（原版 csb → CsdPlayer）', () => {
  for (const type of [WinCircleType.Small, WinCircleType.Middle, WinCircleType.Big] as const) {
    it(`type ${type}：start → 停在最後一格 → end → 移除；ExplosionNode 播一次後隱藏`, async () => {
      const { deps, layer, step, lib } = await setup(type);
      const c = new WinCircle(deps, lib, { type, money: 12345, fishImage: 'D3_24.png', isSelf: true });
      layer.add(c.root);
      const inst = instOf(c);
      expect(inst).not.toBeNull();
      const explosion = inst.find('ExplosionNode')!;
      expect(explosion.sub).not.toBeNull();
      expect(explosion.visible).toBe(true);

      step(c, 50); // start 0–45
      expect(inst.isPlaying).toBe(false);
      step(c, 20); // 爆光子動畫 0–60 播完
      expect(explosion.visible).toBe(false);

      let done = false;
      c.end(() => (done = true));
      step(c, 10);
      expect(done).toBe(false);
      step(c, 15); // end 115–135
      expect(done).toBe(true);
      expect(c.done).toBe(true);
      expect(c.root.parent).toBeNull();
    });
  }

  it('Big：有暴獎時顯示 MegaAward，沒有則隱藏；別人的獎圈 opacity 150', async () => {
    const { deps, lib } = await setup(WinCircleType.Big);
    const withMega = new WinCircle(deps, lib, { type: WinCircleType.Big, money: 1, fishImage: 'D3_24.png', mega: 'x10', isSelf: false });
    const without = new WinCircle(deps, lib, { type: WinCircleType.Big, money: 1, fishImage: 'D3_24.png', isSelf: true });
    expect(instOf(withMega).find('MegaAward')!.visible).toBe(true);
    expect(instOf(without).find('MegaAward')!.visible).toBe(false);
    expect(instOf(withMega).opacity).toBeCloseTo(WIN_CIRCLE_OTHER.opacity);
    expect(instOf(without).opacity).toBe(1);
  });
});
