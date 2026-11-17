/**
 * 魚（龍）設定 — 翻譯自原版 Define/FishDefine.lua、FishBleachDefine.lua、FishHitShow.lua
 *
 * 第一階段：FishType 1–14 + 24（帝王暴龍，示範 BOSSSHOW 降級）；第三階段：15–17、22–28（SPEC §14）。
 * 新增魚：在 FISH_DEFINES 加一筆，並把模型加入 tools/asset-manifest.mjs；
 * 有魚身 EFK 的魚在 manifest 的 fishEfk 加上 lua-efk 項目，並設定 efk 欄位。
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
  Therizinosaurus: 15, // 鐮刀龍
  Pachycephalosaurus: 16, // 腫頭龍
  Pyroraptor: 17, // 火盜龍
  DragonSlainKnight: 22, // 獵龍騎士
  TreeGoblin: 23, // 樹精哥布林
  TRex: 24, // 帝王暴龍
  Scorpion: 25, // 遠古巨蠍
  Quetzalcoatlus: 26, // 風神翼龍
  AzureDragon: 27, // 翔空蒼龍
  AzureDragonWing: 28, // 翔空蒼龍(翅膀)
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
  /** c3b 路徑；virtual = true 時忽略 */
  model: string;
  /** 沒有模型（原版 empty.c3t 單位方塊、不顯示），例如蒼龍翅膀 */
  virtual?: boolean;
  texture?: string;
  spriteScale: number;
  /** 預設 (90, 0, 180) */
  spriteRot?: Vec3;
  spriteOffset?: Vec3;
  colliderScale?: { x: number; y: number };
  hitBox?: { scale: Vec3; offset?: Vec3 };
  /** hitBox 掛在此骨骼上（原版 hitBoxAttachBone）；沒設定則掛在魚節點 */
  hitBoxBone?: string;
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
  /** 沒設定 = 受擊不晃動（原版 HitShakeNormalType = nil） */
  hitShake?: HitShakeTypeId;
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
  /** 魚身 EFK 設定（public/res/Data/FishEfk/*.json，由原版 <魚>EfkSetting.lua 轉出；SPEC §14.2） */
  efk?: string;
  /** 額外要預載的貼圖（執行中換貼圖用，例如蒼龍翅膀發光貼圖） */
  extraTextures?: string[];
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
/** 特色魚 15–17：1 = 小獎、2 = 大獎（原版 HitMore 大招） */
const specialWinCircle = { 1: { type: WinCircleType.Non }, 2: { type: WinCircleType.Big } };
/** Boss（樹精 / 巨蠍 / 風神 / 蒼龍）：0 = Overlay 大獎、1 = 小獎、2 = 中獎、3 = 大獎 */
const bossWinCircle = {
  0: { type: WinCircleType.Big },
  1: { type: WinCircleType.Non },
  2: { type: WinCircleType.Middle },
  3: { type: WinCircleType.Big },
};
const DT3 = 'Models/Dinosaur_dt3/';
const EFK = (name: string) => `Data/FishEfk/${name}EfkSetting.json`;
/** 動畫區間（Speed 0.5）簡寫 */
const half = (start: number, end: number): AnimRange => ({ start, end, speed: 0.5 });

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
    efk: EFK('FishTRex'),
  },

  // ---------------- 第三階段（SPEC §14） ----------------
  {
    type: FishType.Therizinosaurus,
    name: '鐮刀龍',
    model: {
      model: DT3 + '2_Special/Sp_SickleClaw.c3b',
      spriteScale: 0.0198,
      colliderScale: { x: 0.55, y: 0.35 },
      hitBox: { scale: v(250, 300, 200), offset: v(0, 0, 100) },
      runAnimation: ['Run'],
      animations: {
        Run: { start: 0, end: 60 },
        JUMP: { start: 90, end: 113 },
        Attack: { start: 114, end: 240 },
        AttackSelf: { start: 114, end: 240 },
      },
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_15.png', winCircle: specialWinCircle },
  },
  {
    type: FishType.Pachycephalosaurus,
    name: '腫頭龍',
    model: {
      model: DT3 + '2_Special/Sp_ThickHead.c3b',
      spriteScale: 0.198,
      colliderScale: { x: 0.6, y: 0.3 },
      hitBox: { scale: v(15, 30, 15), offset: v(0, 0, 10) },
      runAnimation: ['Run'],
      animations: {
        Run: { start: 0, end: 30 },
        Rush: { start: 40, end: 57 },
        RushShow: { start: 40, end: 57 },
        Roar: { start: 66, end: 148 },
        RushEnd: { start: 58, end: 138 },
      },
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_16.png', winCircle: specialWinCircle },
  },
  {
    type: FishType.Pyroraptor,
    name: '火盜龍',
    model: {
      model: DT3 + '2_Special/Sp_FireFeather.c3b',
      spriteScale: 0.198,
      colliderScale: { x: 0.4, y: 0.3 },
      hitBox: { scale: v(30, 25, 25), offset: v(0, 0, 12.5) },
      runAnimation: ['Run'],
      animations: {
        Run: { start: 0, end: 60 },
        Attack: { start: 90, end: 215 },
        AttackEnd: { start: 100, end: 130 },
        Jump: { start: 90, end: 195 },
        AttackEnd2: { start: 100, end: 130 },
      },
    },
    common: { hitShake: HitShakeType.Small },
    reward: { image: 'D3_17.png', winCircle: specialWinCircle },
  },
  {
    type: FishType.DragonSlainKnight,
    name: '獵龍騎士',
    fishClass: 'knight',
    model: {
      // 龍身貼圖（DragonTexture）與 c3b 內建相同：Sp_DragonHunter_dragon.jpg
      model: DT3 + '3_SpBoss/Sp_DragonHunter.c3b',
      spriteScale: 0.352,
      colliderScale: { x: 0.4, y: 0.65 },
      hitBox: { scale: v(20, 15, 15), offset: v(0, 0, 20) },
      isFlying: true,
      runAnimation: ['Run'],
      animations: {
        Run: { start: 0, end: 50 },
        Hurt: { start: 90, end: 105 },
        Attack: { start: 110, end: 200 },
      },
    },
    common: {},
    reward: { image: 'D3_22.png', winCircle: { 1: { type: WinCircleType.Non } } },
  },
  {
    type: FishType.TreeGoblin,
    name: '樹精哥布林',
    fishClass: 'treeGoblin',
    model: {
      model: DT3 + '1_Boss/dt3_boss_004/dt3_boss_004.c3b',
      spriteScale: 0.22,
      colliderScale: { x: 0.4, y: 0.4 },
      hitBox: { scale: v(50, 30, 50), offset: v(0, 0, 25) },
      runAnimation: ['Run', 'Run2'],
      animations: {
        Reset: half(111, 111),
        Run: half(36, 65),
        Run2: half(788, 848),
        InGame: half(111, 210),
        Hurt: half(863, 893),
        Win_2: half(286, 331),
        dead: half(338, 465),
        Roar: half(173, 192),
        idle: half(471, 518),
        pullout_coin: half(533, 570),
        pullout_gem: half(578, 623),
        bigwin_end: half(637, 711),
        SPRoar: half(170, 200),
        pullout_bigGem: half(900, 945),
      },
    },
    common: {
      hitShake: HitShakeType.Big,
      waitAction: {
        Act_InGame: { checkTime: 6.47, ani: 'InGame', nextAni: 'Run' },
        Act_Reset: { checkTime: 0.05, ani: 'Reset' },
      },
    },
    reward: { image: 'D3_23.png', winCircle: bossWinCircle },
    killShow: { bossShowType: null },
    efk: EFK('FishTreeGoblin'),
  },
  {
    type: FishType.Scorpion,
    name: '遠古巨蠍',
    fishClass: 'scorpion',
    model: {
      model: DT3 + '1_Boss/dt3_boss_003/dt3_boss_003.c3b',
      spriteScale: 0.2816,
      colliderScale: { x: 0.3, y: 0.3 },
      hitBox: { scale: v(50, 60, 20), offset: v(0, 0, 10) },
      runAnimation: ['Run'],
      animations: {
        Reset: half(288, 289),
        InGame: half(0, 60),
        Declare: half(60, 60),
        Run: half(60, 128),
        Hurt: half(129, 136),
        Dig: half(253, 290),
        Appear: half(140, 178),
        BigWin_Recharge: half(178, 253),
        BigWin_Idle: half(292, 321),
        BigWin_Awake: half(321, 351),
        BigWin_RainBomb: half(351, 471),
        BigWin_TailBomb: half(475, 565),
        BigWin_Dig: half(253, 290),
        SPRoar: half(200, 230),
      },
    },
    common: {
      hitShake: HitShakeType.Big,
      waitAction: {
        Act_Reset: { checkTime: 0.05, ani: 'Reset' },
        Act_InGame: { checkTime: 4, ani: 'InGame', nextAni: 'Declare' },
      },
    },
    reward: { image: 'D3_25.png', winCircle: bossWinCircle },
    killShow: { bossShowType: null },
    efk: EFK('FishScorpion'),
  },
  {
    type: FishType.Quetzalcoatlus,
    name: '風神翼龍',
    fishClass: 'quetzalcoatlus',
    model: {
      model: DT3 + '1_Boss/dt3_boss_002/dt3_boss_002.c3b',
      spriteScale: 0.44,
      spriteRot: v(75, 0, 180),
      colliderScale: { x: 0.2, y: 1 },
      hitBox: { scale: v(35, 10, 50), offset: v(0, 0, 0) },
      runAnimation: ['Idle_1', 'Idle_1', 'Idle_1', 'Idle_2'],
      animations: {
        Run: half(330, 390),
        Reset: half(562, 563),
        InGame: half(616, 660),
        Declare: half(660, 660),
        Idle_1: half(330, 390),
        Idle_2: half(570, 607),
        Idle_3: half(397, 442),
        Hurt: half(449, 457),
        Out_Normal: half(467, 497),
        Out_BigWin: half(507, 560),
        BigWin_Fly: half(25, 45),
        BigWin_FlyRight: half(154, 193),
        BigWin_FlyLeft: half(233, 272),
        BigWin_Out: half(288, 319),
      },
    },
    common: {
      hitShake: HitShakeType.Small,
      waitAction: {
        Act_Reset: { checkTime: 0.05, ani: 'Reset' },
        Act_InGame: { checkTime: 2.93, ani: 'InGame', nextAni: 'Declare' },
        Act_Leave: { checkTime: 1, ani: 'Out_Normal' },
      },
    },
    reward: { image: 'D3_26.png', winCircle: bossWinCircle },
    killShow: { bossShowType: null },
    efk: EFK('FishQuetzalcoatlus'),
  },
  {
    type: FishType.AzureDragon,
    name: '翔空蒼龍',
    fishClass: 'azureDragon',
    model: {
      model: DT3 + '1_Boss/dt3_boss_AzureDragon/dt3_boss_001.c3b',
      spriteScale: 0.44,
      hitBoxBone: 'Bip001 Neck',
      colliderScale: { x: 0.1, y: 0.1 },
      hitBox: { scale: v(35, 10, 20), offset: v(0, 0, 0) },
      runAnimation: ['Idle_1', 'Idle_2', 'Idle_3', 'Idle_1', 'Idle_1'],
      animations: {
        BossComingPre: { start: 654, end: 655 },
        BossComing: { start: 655, end: 710 },
        InGameShow: half(2, 2),
        Declare: half(87, 87),
        Run: half(90, 130),
        Reset: half(2, 2),
        InGame: half(2, 87),
        Idle_1: half(90, 130),
        Idle_2: half(135, 175),
        Idle_3: half(180, 220),
        Out: half(225, 255),
        Back: half(260, 305),
        Hurt: half(310, 325),
        Hurt1: half(310, 325),
        Hurt2: half(310, 325),
        Hurt3: half(310, 325),
        Hurt4: half(310, 325),
        Hurt5: half(310, 325),
        Hurt6: half(310, 325),
        Atk_Tornado: half(330, 375),
        Stage_Change: half(380, 440),
        BigWin_Idle: half(445, 460),
        BigWin_Idle_2: half(616, 650),
        BigWin_Recharge: half(465, 510),
        BigWin_Open: half(515, 545),
        BigWin_Open_1: half(515, 545),
        BigWin_Open_2: half(585, 615),
        BigWin_Out: { start: 550, end: 572, speed: 0.25 },
        Slam: half(40, 87),
        SPRoar: half(410, 440),
        SPKill: half(2, 17),
      },
    },
    common: {
      hitShake: HitShakeType.Small,
      waitAction: {
        Act_Reset: { checkTime: 0.05, ani: 'Reset' },
        Act_InGameShow: { checkTime: 3.5, ani: 'InGameShow' },
        Act_InGame: { checkTime: 5.66, ani: 'InGame', nextAni: 'Declare' },
        Act_Back: { checkTime: 3, ani: 'Back' },
        Act_Leave: { checkTime: 2, ani: 'Out' },
      },
    },
    reward: { image: 'D3_27.png', winCircle: bossWinCircle },
    killShow: { bossShowType: null },
    efk: EFK('FishAzureDragon'),
    extraTextures: [DT3 + '1_Boss/dt3_boss_AzureDragon/shader/dt3_boss_001_wing_d_emissive.jpg'],
  },
  {
    type: FishType.AzureDragonWing,
    name: '蒼龍翅膀',
    fishClass: 'azureDragonWing',
    model: {
      model: 'Models/empty.c3t',
      virtual: true,
      spriteScale: 8.8,
      colliderScale: { x: 0.5, y: 0.6 },
      hitBox: { scale: v(0.5, 0.6, 0.4), offset: v(0, 0, 0.2) },
      runAnimation: [],
      animations: {},
    },
    common: {},
    reward: { image: 'D3_28.png', winCircle: { 1: { type: WinCircleType.Middle } } },
  },
];

const byType = new Map(FISH_DEFINES.map((d) => [d.type, d]));

export function getFishDefine(type: FishTypeId): FishDefine | undefined {
  return byType.get(type);
}

export function isFishSupported(type: FishTypeId): boolean {
  return byType.has(type);
}
