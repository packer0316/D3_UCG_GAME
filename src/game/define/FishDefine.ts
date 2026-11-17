/**
 * 魚（龍）設定 — 翻譯自原版 Define/FishDefine.lua、FishBleachDefine.lua、FishHitShow.lua
 *
 * 第一階段：FishType 1–14 + 24（帝王暴龍，示範 BOSSSHOW 降級）。
 * 新增魚：在 FISH_DEFINES 加一筆，並把模型加入 tools/asset-manifest.mjs。
 */
import type { Vec3 } from '@core/math/cocos';

export const FishType = {
  Cub: 1, // 幼幼龍
  Egg_S: 2, // 蛋蛋龍
  Egg_M: 3, // 蛋殼龍
  Velociraptor: 4, // 迅猛龍
  Corythosaurus: 5, // 冠龍
  Triceratops_M: 6, // 三角龍♂
  Triceratops_F: 7, // 三角龍♀
  Smilodon: 8, // 劍齒虎
  Smilodon_G: 9, // 黃金劍齒虎
  Stegosaurus_G: 10, // 黃金劍龍
  Pterosau: 11, // 翼龍
  Scolosaurus: 12, // 刺甲龍
  Stegosaurus: 13, // 太古劍龍
  Spinosaurus: 14, // 棘龍
  TRex: 24, // 帝王暴龍
} as const;
export type FishTypeId = number;

export interface AnimRange {
  start: number;
  end: number;
  speed?: number;
}

export interface PluginNodeSetting {
  model: string;
  /** "None" / 不存在 → 掛在魚節點上 */
  attachBone: string;
  offset: Vec3;
  rotation: Vec3;
  scale: number;
  animationSpeed?: number;
  animation?: AnimRange;
}

export interface FishModelSetting {
  model: string;
  texture?: string;
  spriteScale: number;
  /** 預設 (90, 0, 180) */
  spriteRot?: Vec3;
  spriteOffset?: Vec3;
  colliderScale?: { x: number; y: number };
  hitBox?: { scale: Vec3; offset?: Vec3 };
  isFlying?: boolean;
  runAnimation: string[];
  animations: Record<string, AnimRange>;
  pluginNodes?: PluginNodeSetting[];
  /** 只顯示這些 mesh（原版 PreserveMeshes） */
  preserveMeshes?: string[];
}

export const HitShakeType = { Small: 1, Middle: 2, Big: 3 } as const;
export type HitShakeTypeId = (typeof HitShakeType)[keyof typeof HitShakeType];

/** FishHitShow.lua HitShakeDefine */
export const HIT_SHAKE_DEFINE: Record<HitShakeTypeId, { offset: number; duration: number; times: number; delay: number }> = {
  [HitShakeType.Small]: { offset: 0.2, duration: 0.1, times: 2, delay: 0.3 },
  [HitShakeType.Middle]: { offset: 0.1, duration: 0.1, times: 1, delay: 0.3 },
  [HitShakeType.Big]: { offset: 0.02, duration: 0.1, times: 1, delay: 0.3 },
};

export interface WaitActionSetting {
  checkTime: number;
  ani?: string;
  nextAni?: string;
}

export interface FishCommonSetting {
  hitShake: HitShakeTypeId;
  waitAction?: Record<string, WaitActionSetting>;
}

export const WinCircleType = { Non: 0, Small: 1, Middle: 2, Big: 3 } as const;
export type WinCircleTypeId = (typeof WinCircleType)[keyof typeof WinCircleType];
export type MegaPrize = 'x5' | 'x10' | 'x100';

export interface FishRewardSetting {
  /** 獎圈頭像（Reward_common_D3_1.plist） */
  image: string;
  /** showType → 獎圈 */
  winCircle?: Record<number, { type: WinCircleTypeId; mega?: MegaPrize }>;
}

export interface FishKillShowSetting {
  /** null = 由 Overlay 封包決定（本階段不處理）；數字 = KILL_FLOATODDS 的 showType 等於此值時為 BossShow */
  bossShowType: number | null;
}

export interface FishDefine {
  type: FishTypeId;
  name: string;
  /** 對應 FishClassRegistry；預設 'normal' */
  fishClass?: string;
  model: FishModelSetting;
  common: FishCommonSetting;
  reward: FishRewardSetting;
  killShow?: FishKillShowSetting;
  /** 受擊反白參數（FishBleachDefine） */
  bleach?: { pow: number; scalar: number };
}

const R = 'Models/Dinosaur/';
const bossMark = (offset: Vec3, scale: number): PluginNodeSetting => ({
  model: 'Models/Object/Boss_Mark_01.c3b',
  attachBone: 'None',
  offset,
  rotation: { x: 90, y: 0, z: 0 },
  scale,
  animationSpeed: 1,
  animation: { start: 0, end: 120 },
});
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const run = (end: number) => ({ Run: { start: 0, end } });
const bigWinCircle = {
  1: { type: WinCircleType.Non },
  2: { type: WinCircleType.Big, mega: 'x5' as const },
  3: { type: WinCircleType.Big, mega: 'x10' as const },
  4: { type: WinCircleType.Big, mega: 'x100' as const },
};

export const FISH_DEFINES: FishDefine[] = [
  {
    type: FishType.Cub,
    name: '幼幼龍',
    model: { model: R + 'Egg_01.c3b', texture: R + 'Egg_01.jpg', spriteScale: 1.76, colliderScale: { x: 0.8, y: 0.8 }, runAnimation: ['Run'], animations: run(30) },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_01.png' },
  },
  {
    type: FishType.Egg_S,
    name: '蛋蛋龍',
    model: { model: R + 'Egg_02.c3b', texture: R + 'Egg_02.jpg', spriteScale: 1.76, colliderScale: { x: 0.8, y: 0.8 }, runAnimation: ['Run'], animations: run(18) },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_02.png' },
  },
  {
    type: FishType.Egg_M,
    name: '蛋殼龍',
    model: { model: R + 'Egg_Dragon_01.c3b', texture: R + 'Egg_Dragon_01.jpg', spriteScale: 1.496, colliderScale: { x: 0.8, y: 0.8 }, runAnimation: ['Run'], animations: run(20) },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_03.png' },
  },
  {
    type: FishType.Velociraptor,
    name: '迅猛龍',
    model: {
      model: R + 'D_Dragon_01.c3b',
      texture: R + 'D_Dragon_01.jpg',
      spriteScale: 5.28,
      colliderScale: { x: 0.6, y: 0.6 },
      hitBox: { scale: v(0.4, 0.8, 0.5), offset: v(0, 0, 0.25) },
      runAnimation: ['Run'],
      animations: run(24),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_04.png' },
  },
  {
    type: FishType.Corythosaurus,
    name: '冠龍',
    model: {
      model: R + 'A_Dragon_01.c3b',
      texture: R + 'A_Dragon_01.jpg',
      spriteScale: 0.792,
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(3, 8, 5), offset: v(0, 0, 2.5) },
      runAnimation: ['Run'],
      animations: run(48),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_05.png' },
  },
  {
    type: FishType.Triceratops_M,
    name: '三角龍♂',
    model: {
      model: R + 'T_Dragon_01.c3b',
      texture: R + 'T_Dragon_01.jpg',
      spriteScale: 0.88,
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(5, 8, 5), offset: v(0, 0, 2.5) },
      runAnimation: ['Run'],
      animations: run(20),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_06.png' },
  },
  {
    type: FishType.Triceratops_F,
    name: '三角龍♀',
    model: {
      model: R + 'T_Dragon_01.c3b',
      texture: R + 'T_Dragon_02.jpg',
      spriteScale: 0.792,
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(5, 8, 5), offset: v(0, 0, 2.5) },
      runAnimation: ['Run'],
      animations: run(20),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_07.png' },
  },
  {
    type: FishType.Smilodon,
    name: '劍齒虎',
    model: {
      model: R + 'A_Tiger_01.c3b',
      texture: R + 'A_Tiger_01.jpg',
      spriteScale: 0.5544,
      spriteRot: v(180, 0, 180),
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(5, 10, 5), offset: v(0, 0, 2.5) },
      runAnimation: ['Run'],
      animations: run(20),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_08.png' },
  },
  {
    type: FishType.Smilodon_G,
    name: '黃金劍齒虎',
    model: {
      model: R + 'A_Tiger_06.c3b',
      texture: R + 'A_Tiger_06.jpg',
      spriteScale: 0.792,
      spriteRot: v(180, 0, 180),
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(5, 10, 5), offset: v(0, 0, 2.5) },
      runAnimation: ['Run'],
      animations: run(20),
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_09.png', winCircle: { 1: { type: WinCircleType.Middle } } },
  },
  {
    type: FishType.Stegosaurus_G,
    name: '黃金劍龍',
    model: {
      model: R + 'S_Dragon_02.c3b',
      texture: R + 'S_Dragon_02.jpg',
      spriteScale: 8.8,
      colliderScale: { x: 0.8, y: 0.6 },
      hitBox: { scale: v(0.5, 0.9, 0.4), offset: v(0, 0, 0.2) },
      runAnimation: ['Run'],
      animations: run(50),
    },
    common: { hitShake: HitShakeType.Middle },
    reward: { image: 'D3_10.png', winCircle: { 1: { type: WinCircleType.Middle } } },
  },
  {
    type: FishType.Pterosau,
    name: '翼龍',
    model: {
      model: R + 'Pterosaur/Pterosaur.c3b',
      texture: R + 'Pterosaur/Pterosaur_01.jpg',
      spriteScale: 0.88,
      spriteRot: v(90, 0, 0),
      spriteOffset: v(0, 0, 10),
      colliderScale: { x: 0.8, y: 0.8 },
      hitBox: { scale: v(4, 8, 3), offset: v(0, 0, 12) },
      isFlying: true,
      runAnimation: ['Run'],
      animations: { Run: { start: 0, end: 30 }, Dead: { start: 45, end: 85 } },
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_11.png', winCircle: { 1: { type: WinCircleType.Middle } } },
  },
  {
    type: FishType.Scolosaurus,
    name: '刺甲龍',
    model: {
      model: R + 'A_Dragon_02.c3b',
      texture: R + 'A_Dragon_02.jpg',
      spriteScale: 1.254,
      colliderScale: { x: 0.8, y: 0.6 },
      hitBox: { scale: v(4, 6, 3), offset: v(0, 0, 1.5) },
      runAnimation: ['Run'],
      animations: run(50),
      pluginNodes: [bossMark(v(0, 0.2, 0), 0.38)],
    },
    common: { hitShake: HitShakeType.Middle },
    reward: { image: 'D3_12.png', winCircle: bigWinCircle },
  },
  {
    type: FishType.Stegosaurus,
    name: '太古劍龍',
    model: {
      model: R + 'S_Dragon_01.c3b',
      texture: R + 'S_Dragon_01.jpg',
      spriteScale: 9.196,
      colliderScale: { x: 0.8, y: 0.6 },
      hitBox: { scale: v(0.65, 1, 0.5), offset: v(0, 0, 0.25) },
      runAnimation: ['Run'],
      animations: run(50),
      pluginNodes: [bossMark(v(0, 0, 0), 0.062)],
    },
    common: { hitShake: HitShakeType.Middle },
    reward: { image: 'D3_13.png', winCircle: bigWinCircle },
  },
  {
    type: FishType.Spinosaurus,
    name: '棘龍',
    model: {
      model: R + 'G_Dragon_01.c3b',
      texture: R + 'G_Dragon_01.jpg',
      spriteScale: 1.496,
      colliderScale: { x: 0.8, y: 0.6 },
      hitBox: { scale: v(4, 6, 4), offset: v(0, 0, 2) },
      runAnimation: ['Run'],
      animations: run(60),
      pluginNodes: [bossMark(v(0, 0.2, 0), 0.38)],
    },
    common: { hitShake: HitShakeType.Middle },
    reward: { image: 'D3_14.png', winCircle: bigWinCircle },
  },
  {
    type: FishType.TRex,
    name: '帝王暴龍',
    fishClass: 'trex',
    model: {
      model: 'Models/Dinosaur_dt3/1_Boss/dt3_boss_005/dt3_boss_005.c3b',
      spriteScale: 0.2376,
      colliderScale: { x: 0.1, y: 0.06 },
      hitBox: { scale: v(30, 70, 50), offset: v(0, 0, 25) },
      runAnimation: ['Walk_1', 'Walk_2'],
      animations: {
        Run: { start: 2609, end: 2753 },
        Reset: { start: 5, end: 6 },
        InGame: { start: 2369, end: 2505 },
        Walk_1: { start: 2290, end: 2362 },
        Walk_2: { start: 2609, end: 2753 },
        Hurt: { start: 2785, end: 2800 },
        Out: { start: 3018, end: 3141 },
        InGameShow: { start: 2369, end: 2369 },
        Declare: { start: 2290, end: 2290 },
      },
      preserveMeshes: ['dt3_boss_005'],
    },
    common: {
      hitShake: HitShakeType.Big,
      waitAction: {
        Act_Reset: { checkTime: 0.05, ani: 'Reset' },
        Act_InGameShow: { checkTime: 1.5, ani: 'InGameShow' },
        Act_InGame: { checkTime: 4.53, ani: 'InGame', nextAni: 'Declare' },
      },
    },
    reward: {
      image: 'D3_24.png',
      winCircle: { 1: { type: WinCircleType.Non }, 2: { type: WinCircleType.Middle }, 3: { type: WinCircleType.Big } },
    },
    killShow: { bossShowType: 3 },
    bleach: { pow: 5.5, scalar: 1.6 },
  },
];

const byType = new Map(FISH_DEFINES.map((d) => [d.type, d]));

export function getFishDefine(type: FishTypeId): FishDefine | undefined {
  return byType.get(type);
}

export function isFishSupported(type: FishTypeId): boolean {
  return byType.has(type);
}
