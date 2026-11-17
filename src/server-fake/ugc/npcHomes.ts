/**
 * NPC 屋主與家園（SPEC-UGC §8.4）：只有一個真人玩家，其他玩家的家園用固定內容代替。
 * 進度由淺到深，讓玩家看得到「培養、收集之後家園會長什麼樣子」。
 */
import { Random } from '@core/math/random';
import { SceneType } from '@game/define/SceneDefine';
import { DECO_DEFINES, DECO_GRID, canPlaceDeco } from '@game/ugc/DecoDefine';
import { FIRST_NPC_ROOM_ID } from '@game/ugc/UgcDefine';
import type { DecoPlacement, HomeSlot } from '@game/ugc/UgcTypes';

export interface NpcHome {
  roomId: number;
  accountId: number;
  name: string;
  slots: HomeSlot[];
  /** 魚卡 → 等級（沒列的 = 1） */
  levels: Record<number, number>;
  deco: DecoPlacement[];
}

interface NpcSpec {
  name: string;
  slots: HomeSlot[];
  /** 等級：固定值，或依魚種決定 */
  level: number | ((fishType: number) => number);
  /** 裝飾物數量 */
  decoCount: number;
}

const { Forest, Desert, Snow, Boss_Sky_Dusk: Sky, ZB_Prison: Prison, ZB_Cemetery: Cemetery } = SceneType;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const STARTER = range(1, 11);

const SPECS: NpcSpec[] = [
  { name: '阿明', slots: [{ sceneType: Forest, fishTypes: STARTER }], level: 1, decoCount: 4 },
  {
    name: '新手村長',
    slots: [
      { sceneType: Forest, fishTypes: STARTER },
      { sceneType: Desert, fishTypes: STARTER },
    ],
    level: (t) => 2 + (t % 3),
    decoCount: 8,
  },
  {
    name: '蛋蛋收藏家',
    slots: [
      { sceneType: Forest, fishTypes: [1] },
      { sceneType: Forest, fishTypes: [2] },
      { sceneType: Forest, fishTypes: [1, 2, 3] },
    ],
    level: 10,
    decoCount: 12,
  },
  {
    name: '沙漠之狐',
    slots: [
      { sceneType: Desert, fishTypes: [...STARTER, 12, 13, 14] },
      { sceneType: Forest, fishTypes: [4, 5, 8, 9, 10, 11, 12, 13] },
    ],
    level: (t) => (t >= 12 ? 3 + (t % 3) : 2),
    decoCount: 10,
  },
  {
    name: '雪國獵人',
    slots: [
      { sceneType: Snow, fishTypes: [1, 2, 3, 4, 5, 15, 16, 17, 22] },
      { sceneType: Snow, fishTypes: [8, 9, 10, 11, 12, 22] },
    ],
    level: (t) => (t >= 15 ? 4 : 3),
    decoCount: 14,
  },
  {
    name: '天空騎士',
    slots: [
      { sceneType: Sky, fishTypes: [2, 11, 22, 26, 27] },
      { sceneType: Forest, fishTypes: STARTER },
    ],
    level: (t) => (t === 26 ? 4 : t === 27 ? 3 : 2),
    decoCount: 6,
  },
  {
    name: '典獄長',
    slots: [
      { sceneType: Prison, fishTypes: [4, 8, 9, 12, 13, 14, 23, 24, 25] },
      { sceneType: Cemetery, fishTypes: [1, 2, 3, 15, 16, 17, 23, 24, 25] },
    ],
    level: (t) => (t >= 23 ? 5 : 3),
    decoCount: 18,
  },
  {
    name: '龍王',
    slots: [
      { sceneType: Forest, fishTypes: [...range(1, 17), 22, 23, 24, 25] },
      { sceneType: Desert, fishTypes: [...range(4, 17), 24, 25] },
      { sceneType: Snow, fishTypes: [...range(8, 17), 22, 23] },
      { sceneType: Sky, fishTypes: [2, 11, 22, 26, 27] },
      { sceneType: Prison, fishTypes: [...range(9, 17), 23, 24, 25] },
      { sceneType: Cemetery, fishTypes: [1, 2, 3, 15, 16, 17, 22, 23, 24, 25] },
    ],
    level: (t) => 6 + (t % 5),
    decoCount: 30,
  },
];

/** 以固定種子隨機擺幾個方塊（越後面的 NPC 稀有的物品越多） */
function buildDeco(seed: number, count: number, tier: number): DecoPlacement[] {
  const rng = new Random(seed);
  const pool = DECO_DEFINES.filter((_, i) => i <= 2 + tier);
  const items: DecoPlacement[] = [];
  for (let tries = 0; items.length < count && tries < count * 20; tries++) {
    const def = rng.pick(pool);
    const item: DecoPlacement = {
      id: def.id,
      x: rng.int(0, DECO_GRID.cols - 1),
      y: rng.int(0, DECO_GRID.rows - 1),
      rot: rng.next() < 0.5 ? 0 : 1,
    };
    // 中間留給魚走：只擺在左右兩側與最遠那幾排
    const side = item.x < 5 || item.x >= DECO_GRID.cols - 6 || item.y >= DECO_GRID.rows - 3;
    if (side && canPlaceDeco(items, item)) items.push(item);
  }
  return items;
}

export const NPC_HOMES: readonly NpcHome[] = SPECS.map((spec, i) => {
  const cards = new Set(spec.slots.flatMap((s) => s.fishTypes));
  const levels: Record<number, number> = {};
  for (const t of cards) levels[t] = typeof spec.level === 'number' ? spec.level : spec.level(t);
  return {
    roomId: FIRST_NPC_ROOM_ID + i,
    accountId: 100 + i,
    name: spec.name,
    slots: spec.slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] })),
    levels,
    deco: buildDeco(1000 + i, spec.decoCount, Math.min(4, Math.floor(i / 2))),
  };
});
