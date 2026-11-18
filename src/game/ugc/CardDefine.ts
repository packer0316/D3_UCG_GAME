/**
 * 魚卡 / 場景卡：稀有度、Boss、蒼龍翅膀歸屬（SPEC-UGC §5）
 */
import { FishType } from '../define/FishDefine';
import { SceneType } from '../define/SceneDefine';
import type { Rarity } from './UgcTypes';

export const RARITIES: readonly Rarity[] = ['N', 'R', 'SR', 'SSR'];
export const RARITY_NAME: Record<Rarity, string> = { N: '普通', R: '稀有', SR: '史詩', SSR: '傳說' };
/** 人氣分數（HomeRule） */
export const RARITY_SCORE: Record<Rarity, number> = { N: 1, R: 3, SR: 6, SSR: 12 };
export const rarityRank = (r: Rarity): number => RARITIES.indexOf(r);

/** 魚卡（fishType）→ 稀有度。蒼龍翅膀（28）不是獨立的卡，跟著翔空蒼龍 */
export const FISH_RARITY: Readonly<Record<number, Rarity>> = {
  [FishType.Cub]: 'N',
  [FishType.Egg_S]: 'N',
  [FishType.Egg_M]: 'N',
  [FishType.Velociraptor]: 'N',
  [FishType.Corythosaurus]: 'N',
  [FishType.Triceratops_M]: 'N',
  [FishType.Triceratops_F]: 'N',
  [FishType.Smilodon]: 'N',
  [FishType.Smilodon_G]: 'N',
  [FishType.Stegosaurus_G]: 'N',
  [FishType.Pterosau]: 'N',
  [FishType.Scolosaurus]: 'R',
  [FishType.Stegosaurus]: 'R',
  [FishType.Spinosaurus]: 'R',
  [FishType.Therizinosaurus]: 'SR',
  [FishType.Pachycephalosaurus]: 'SR',
  [FishType.Pyroraptor]: 'SR',
  [FishType.DragonSlainKnight]: 'SR',
  [FishType.TreeGoblin]: 'SSR',
  [FishType.TRex]: 'SSR',
  [FishType.Scorpion]: 'SSR',
  [FishType.Quetzalcoatlus]: 'SSR',
  [FishType.AzureDragon]: 'SSR',
};

/** 原倍率：原專案說明頁（DragonTycoon3 DinosaurExport/ratioTable）標示的倍率 */
export interface OriginalOdds {
  odds: number;
  /** 說明頁寫「最高 N 倍」（含暴獎 / 龍王表演） */
  max?: true;
}

/** 魚卡 → 原倍率（SPEC-UGC §7）。獵龍騎士的說明頁只有佔領彩金，沒有倍率 → 不列 */
export const CARD_ORIGINAL_ODDS: Readonly<Record<number, OriginalOdds>> = {
  [FishType.Cub]: { odds: 2 },
  [FishType.Egg_S]: { odds: 3 },
  [FishType.Egg_M]: { odds: 4 },
  [FishType.Velociraptor]: { odds: 5 },
  [FishType.Corythosaurus]: { odds: 6 },
  [FishType.Triceratops_M]: { odds: 8 },
  [FishType.Triceratops_F]: { odds: 9 },
  [FishType.Smilodon]: { odds: 10 },
  [FishType.Smilodon_G]: { odds: 50 },
  [FishType.Stegosaurus_G]: { odds: 60 },
  [FishType.Pterosau]: { odds: 100 },
  [FishType.Scolosaurus]: { odds: 1000, max: true },
  [FishType.Stegosaurus]: { odds: 2000, max: true },
  [FishType.Spinosaurus]: { odds: 3000, max: true },
  [FishType.Therizinosaurus]: { odds: 800, max: true },
  [FishType.Pachycephalosaurus]: { odds: 800, max: true },
  [FishType.Pyroraptor]: { odds: 800, max: true },
  [FishType.TreeGoblin]: { odds: 15000, max: true },
  [FishType.TRex]: { odds: 30000, max: true },
  [FishType.Scorpion]: { odds: 20000, max: true },
  [FishType.Quetzalcoatlus]: { odds: 20000, max: true },
  [FishType.AzureDragon]: { odds: 40000, max: true },
};

/** 所有魚卡（依 fishType 排序） */
export const CARD_FISH_TYPES: readonly number[] = Object.keys(FISH_RARITY)
  .map(Number)
  .sort((a, b) => a - b);

/** Boss（放龍上限用）：翔空蒼龍含翅膀，算 1 隻 */
export const BOSS_FISH_TYPES: readonly number[] = [
  FishType.TreeGoblin,
  FishType.TRex,
  FishType.Scorpion,
  FishType.Quetzalcoatlus,
  FishType.AzureDragon,
];

/** 魚卡附帶的魚種：放出翔空蒼龍 = 同時放出蒼龍翅膀 */
export const CARD_INCLUDES: Readonly<Record<number, readonly number[]>> = {
  [FishType.AzureDragon]: [FishType.AzureDragonWing],
};

const CARD_OF = new Map<number, number>();
for (const [card, extra] of Object.entries(CARD_INCLUDES)) for (const t of extra) CARD_OF.set(t, Number(card));

/** 魚種 → 所屬魚卡（蒼龍翅膀 → 翔空蒼龍；其他就是自己） */
export function cardOf(fishType: number): number {
  return CARD_OF.get(fishType) ?? fishType;
}

export function isBossCard(fishType: number): boolean {
  return BOSS_FISH_TYPES.includes(cardOf(fishType));
}

/** 魚卡清單 → 實際會出現的魚種（含附帶的） */
export function expandCards(cards: Iterable<number>): Set<number> {
  const out = new Set<number>();
  for (const c of cards) {
    out.add(c);
    CARD_INCLUDES[c]?.forEach((t) => out.add(t));
  }
  return out;
}

/** 場景卡 → 稀有度（森林是初始場景，不在卡池裡） */
export const SCENE_RARITY: Readonly<Record<number, Rarity>> = {
  [SceneType.Forest]: 'N',
  [SceneType.Desert]: 'R',
  [SceneType.Snow]: 'R',
  [SceneType.Boss_Sky_Dusk]: 'SR',
  [SceneType.ZB_Prison]: 'SR',
  [SceneType.ZB_Cemetery]: 'SR',
  [SceneType.Space_Moon]: 'SR',
  [SceneType.Rose_Castle]: 'SSR',
  [SceneType.Tide_Palace]: 'SSR',
  [SceneType.Maple_Shrine]: 'SR',
};
