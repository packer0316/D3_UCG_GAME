/**
 * 獎勵表演設定 — 翻譯自原版 WinCircleDefine.lua、FishBonus.lua、DropItemMgr.lua、SourceDefine.lua
 */
import { WinCircleType, type MegaPrize, type WinCircleTypeId } from './FishDefine';

export const REWARD_PLISTS = [
  'DinosaurExport/plist/Reward_common.plist',
  'DinosaurExport/plist/Reward_common_D3_1.plist',
  'DinosaurExport/plist/Coin.plist',
  'DinosaurExport/plist/Effect.plist',
  'DinosaurExport/plist/FX.plist',
];

export const FONT_JUMP_SELF = 'DinosaurExport/fonts/number_20.fnt';
export const FONT_JUMP_OTHER = 'DinosaurExport/fonts/number_20_w.fnt';
export const FONT_WIN_CIRCLE = 'DinosaurExport/fonts/d3_num_jp01.fnt';

// ---------------- 獎圈 ----------------
export const WIN_CIRCLE_SELF = { scale: 0.8, opacity: 1 };
export const WIN_CIRCLE_OTHER = { scale: 0.6, opacity: 150 / 255 };
/** 每個座位最多同時幾個獎圈 */
export const WIN_CIRCLE_MAX_PER_SEAT = 6;
/** 最後一個獎圈出現後幾秒全部結束 */
export const WIN_CIRCLE_CD_TIME = 1.5;
/** 槽位偏移（self） */
export const WIN_CIRCLE_SLOT_OFFSETS = [
  { x: 0, y: 0 },
  { x: -120, y: -30 },
  { x: 120, y: -30 },
  { x: 0, y: 90 },
  { x: -120, y: 60 },
  { x: 120, y: 60 },
];
/** 獎圈在座位錨點上方的位置（SeatInfo WinCircleAP，設計座標） */
export const WIN_CIRCLE_ANCHOR_OFFSET_Y = 190;

/** 獎圈 csb（WinCircleDefine.lua WinCircleRes；tools 轉成 <path>.json，CsdPlayer 播放） */
export const WIN_CIRCLE_CSB: Record<Exclude<WinCircleTypeId, 0>, string> = {
  [WinCircleType.Small]: 'DinosaurExport/reward/Reward_Min_0.csb',
  [WinCircleType.Middle]: 'DinosaurExport/reward/Reward_Middle_0.csb',
  [WinCircleType.Big]: 'DinosaurExport/reward/Reward_Big_0.csb',
};
/** 獎圈繪製順序（金幣 5、跳字 7 之間） */
export const WIN_CIRCLE_RENDER_ORDER = 6;

export const MEGA_PRIZE_IMAGE: Record<MegaPrize, string> = {
  x5: '5TimesReward_word.png',
  x10: '10TimesReward_word.png',
  x100: '100TimesReward_word.png',
};

export const WIN_CIRCLE_SOUND: Record<Exclude<WinCircleTypeId, 0>, string> = {
  [WinCircleType.Small]: 'sound/C_1',
  [WinCircleType.Middle]: 'sound/C_2',
  [WinCircleType.Big]: 'sound/C_3',
};

/** Big 獎圈時相機震動 */
export const WIN_CIRCLE_SHOCK_WORLD = { times: 3, delta: 0.8 };

// ---------------- 噴錢 ----------------
/** FishBonus CoinShowMap：floatedOdds 門檻 → 模式（0 = Drop、n = Explosion n 圈） */
export const COIN_SHOW_THRESHOLDS: { odds: number; rings: number }[] = [
  { odds: 10000, rings: 4 },
  { odds: 90, rings: 2 },
  { odds: 10, rings: 1 },
];
export const COIN_FRAMES_SELF = Array.from({ length: 10 }, (_, i) => `dt3_ef_coin_${String(i + 1).padStart(2, '0')}.png`);
export const COIN_FRAMES_OTHER = Array.from({ length: 10 }, (_, i) => `dt3_ef_coin_silver_${String(i + 1).padStart(2, '0')}.png`);
export const COIN_FRAME_TIME = 0.07;
export const COIN_RING_COUNTS = [4, 8, 16, 32];
export const COIN_RING_RADIUS = (ring: number) => 30 + (ring - 1) * 45;
export const COIN_DROP_SPEED = 1500;
export const COIN_EXPLOSION_SPEED = 2143;

// ---------------- 跳字 ----------------
export const JUMP_NUMBER = { scale: 0.8, offsetY: -10, rise: 30 };
