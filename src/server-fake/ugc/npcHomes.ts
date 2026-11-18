/**
 * NPC 屋主與家園（SPEC-UGC §8.4）：只有一個真人玩家，其他玩家的家園用固定內容代替。
 * 進度由淺到深，讓玩家看得到「培養、收集之後家園會長什麼樣子」。
 */
import { Random } from '@core/math/random';
import { SceneType, isFishAllowedInScene } from '@game/define/SceneDefine';
import { DECO_DEFINES, DECO_GRID, canPlaceDeco } from '@game/ugc/DecoDefine';
import { FIRST_NPC_ROOM_ID } from '@game/ugc/UgcDefine';
import { NPC_PLAYER_IDS } from '@game/ugc/PlayerAvatars';
import type { DecoPlacement, HomeSlot, RoomHostProfile } from '@game/ugc/UgcTypes';

export interface NpcHome {
  roomId: number;
  accountId: number;
  name: string;
  host: RoomHostProfile;
  slots: HomeSlot[];
  /** 魚卡 → 等級（沒列的 = 1） */
  levels: Record<number, number>;
  deco: DecoPlacement[];
  /** 幾天前開張（相對於目前時間；SPEC-UGC §2.4、§8.4） */
  daysAgo: number;
}

interface NpcSpec {
  name: string;
  host?: RoomHostProfile;
  daysAgo: number;
  slots: HomeSlot[];
  /** 等級：固定值，或依魚種決定 */
  level: number | ((fishType: number) => number);
  /** 裝飾物數量 */
  decoCount: number;
}

const { Forest, Desert, Snow, Boss_Sky_Dusk: Sky, ZB_Prison: Prison, ZB_Cemetery: Cemetery,
  Space_Moon: Moon, Rose_Castle: Castle, Tide_Palace: Tide, Maple_Shrine: Maple } = SceneType;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const STARTER = range(1, 11);

/** 保留原本 3–10 號房，新增不同進度與主題的屋主，房號固定。 */
function themed(name: string, title: string, bio: string, scenes: number[], fish: number[], level: number, daysAgo: number, portrait: number): NpcSpec {
  return {
    name, host: { title, bio, portrait }, daysAgo,
    slots: scenes.map(sceneType => ({ sceneType, fishTypes: fish.filter(t => isFishAllowedInScene(t, sceneType)) })),
    level: t => Math.max(1, Math.min(100, level + (t % 3 - 1) * 5)),
    decoCount: Math.min(28, 5 + Math.floor(level / 4)),
  };
}

const ORIGINAL_HOSTS: RoomHostProfile[] = [
  { portrait: 1, title: '初來乍到', bio: '第一座小森林，慢慢養龍、慢慢長大。歡迎來坐坐！' },
  { portrait: 2, title: '新手引路人', bio: '從森林走到沙漠，帶上你的好奇心，一起發現下一隻龍。' },
  { portrait: 3, title: '蛋龍研究員', bio: '誰說小小的蛋不厲害？這裡每一顆都是我的滿級寶貝。' },
  { portrait: 14, title: '沙海旅人', bio: '黃沙底下藏著驚喜。大型龍愛好者，歡迎來挑戰。' },
  { portrait: 17, title: '極地追獵者', bio: '循著雪地裡的腳印，來一場安靜又刺激的狩獵。' },
  { portrait: 27, title: '逐風騎士', bio: '在黃昏的雲海裡，等一隻蒼龍掠過天際。' },
  { portrait: 24, title: '暗夜守衛', bio: '監獄與墓地輪流開放，膽子夠大的獵人請進。' },
  { portrait: 26, title: '傳說馴龍師', bio: '從第一顆龍蛋，到六座領地。我的龍之國度，歡迎你的到來。' },
];

const SPECS: NpcSpec[] = [
  { name: '阿明', daysAgo: 0.3, slots: [{ sceneType: Forest, fishTypes: STARTER }], level: 1, decoCount: 4 },
  {
    name: '新手村長',
    daysAgo: 2.5,
    slots: [
      { sceneType: Forest, fishTypes: STARTER },
      { sceneType: Desert, fishTypes: STARTER },
    ],
    level: (t) => 5 + (t % 3) * 5,
    decoCount: 8,
  },
  {
    name: '蛋蛋收藏家',
    daysAgo: 20,
    slots: [
      { sceneType: Forest, fishTypes: [1] },
      { sceneType: Forest, fishTypes: [2] },
      { sceneType: Forest, fishTypes: [1, 2, 3] },
    ],
    level: 100,
    decoCount: 12,
  },
  {
    name: '沙漠之狐',
    daysAgo: 1.5,
    slots: [
      { sceneType: Desert, fishTypes: [...STARTER, 12, 13, 14] },
      { sceneType: Forest, fishTypes: [4, 5, 8, 9, 10, 11, 12, 13] },
    ],
    level: (t) => (t >= 12 ? 20 + (t % 3) * 10 : 10),
    decoCount: 10,
  },
  {
    name: '雪國獵人',
    daysAgo: 12,
    slots: [
      { sceneType: Snow, fishTypes: [1, 2, 3, 4, 5, 15, 16, 17, 22] },
      { sceneType: Snow, fishTypes: [8, 9, 10, 11, 12, 22] },
    ],
    level: (t) => (t >= 15 ? 40 : 25),
    decoCount: 14,
  },
  {
    name: '天空騎士',
    daysAgo: 30,
    slots: [
      { sceneType: Sky, fishTypes: [2, 11, 22, 26, 27] },
      { sceneType: Forest, fishTypes: STARTER },
    ],
    level: (t) => (t === 26 ? 40 : t === 27 ? 30 : 15),
    decoCount: 6,
  },
  {
    name: '典獄長',
    daysAgo: 45,
    slots: [
      { sceneType: Prison, fishTypes: [4, 8, 9, 12, 13, 14, 23, 24, 25] },
      { sceneType: Cemetery, fishTypes: [1, 2, 3, 15, 16, 17, 23, 24, 25] },
    ],
    level: (t) => (t >= 23 ? 50 : 30),
    decoCount: 18,
  },
  {
    name: '龍王',
    daysAgo: 90,
    slots: [
      { sceneType: Forest, fishTypes: [...range(1, 17), 22, 23, 24, 25] },
      { sceneType: Desert, fishTypes: [...range(4, 17), 24, 25] },
      { sceneType: Snow, fishTypes: [...range(8, 17), 22, 23] },
      { sceneType: Sky, fishTypes: [2, 11, 22, 26, 27] },
      { sceneType: Prison, fishTypes: [...range(9, 17), 23, 24, 25] },
      { sceneType: Cemetery, fishTypes: [1, 2, 3, 15, 16, 17, 22, 23, 24, 25] },
    ],
    level: (t) => 60 + (t % 5) * 10,
    decoCount: 30,
  },
  themed('月見兔', '月面漫遊者', '把月光收進口袋，在星空下和龍一起散步。', [Moon, Snow], [1, 2, 4, 9, 11, 15, 22], 20, 0.5, 2),
  themed('薔薇女爵', '古堡收藏家', '玫瑰盛開的古堡，收藏著我最喜愛的龍與故事。', [Castle, Forest], [4, 7, 9, 12, 15, 22, 23], 65, 38, 15),
  themed('潮汐旅人', '深海尋寶者', '潮起時出發，潮落時歸來。一起探索水色宮殿。', [Tide, Desert], [1, 4, 6, 12, 13, 14, 25], 35, 1.2, 13),
  themed('楓葉信差', '秋日漫步者', '神社前的楓葉又紅了，留一盞燈等你來。', [Maple, Forest], [1, 2, 6, 8, 10, 15, 17], 25, 2.1, 17),
  themed('青苔', '森林守護者', '讓植物慢慢長，讓小龍慢慢玩。這是一座不用趕路的森林。', [Forest, Maple], [1, 2, 3, 6, 7, 10, 23], 45, 16, 23),
  themed('赤砂', '荒原獵手', '沙丘後面總有更大的對手，下一場獵龍一起來。', [Desert, Prison], [4, 5, 8, 12, 13, 14, 24], 75, 52, 24),
  themed('白夜', '雪境觀測員', '雪地不只有白色，仔細看，每隻龍都有自己的光。', [Snow, Moon], [2, 5, 9, 11, 15, 16, 22], 40, 8, 16),
  themed('雲朵麵包', '雲海旅行家', '今天的天空像剛烤好的麵包，帶著小龍一起放空。', [Sky, Forest], [2, 11, 22, 26, 27], 15, 0.8, 11),
  themed('星塵', '星際收藏家', '月球是新的起點。每一次相遇，都值得被收藏。', [Moon, Castle, Tide], [4, 8, 12, 14, 16, 22, 25], 55, 24, 22),
  themed('南風', '悠閒園丁', '森林和海風都準備好了，只差你來逛逛。', [Forest, Tide], [1, 2, 3, 6, 7, 9], 10, 0.1, 6),
  themed('琥珀', '遠古研究員', '在沙漠與古堡之間，尋找遠古巨龍留下的線索。', [Desert, Castle], [5, 10, 12, 13, 14, 24], 60, 33, 14),
  themed('小栗子', '口袋馴龍師', '小小家園剛開門！歡迎來看看我的第一批小夥伴。', [Maple], [1, 2, 3, 6, 8], 5, 0.2, 1),
  themed('墨羽', '夜行觀察者', '夜裡的龍比較有精神。喜歡安靜的你，這邊請。', [Cemetery, Castle], [4, 8, 11, 15, 17, 23], 50, 19, 11),
  themed('海鹽', '潮間帶居民', '讓海風帶走煩惱，把今天留給獵龍與小小的驚喜。', [Tide], [2, 4, 6, 7, 12, 13], 30, 2.8, 7),
  themed('霜刃', '冰原挑戰者', '專注培養每一隻龍，歡迎來雪地試試身手。', [Snow, Prison], [8, 9, 12, 15, 16, 17, 22, 24], 85, 64, 9),
  themed('流螢', '微光採集者', '森林裡的每一點亮光，都藏著一個小故事。', [Forest, Maple, Moon], [1, 3, 6, 10, 11, 17], 30, 6, 10),
  themed('棉花糖', '幼龍保姆', '這裡只有軟萌的小龍。慢慢玩，不急著長大。', [Castle, Forest], [1, 2, 3], 35, 1.7, 3),
  themed('蒼穹', '高空領航員', '追著風神翼龍的影子，飛向更遠的天空。', [Sky, Moon], [2, 11, 22, 26, 27], 90, 72, 26),
  themed('紅蓮', '巨龍挑戰者', '最喜歡與巨龍交手的瞬間。下一位挑戰者會是你嗎？', [Prison, Desert, Cemetery], [8, 12, 14, 17, 23, 24, 25], 80, 48, 25),
  themed('森之鹿', '林間築夢者', '在樹蔭下蓋一個家，讓旅途有個可以停留的地方。', [Forest], [1, 2, 4, 5, 6, 10, 12], 20, 4, 5),
  themed('銀河汽水', '月球新住民', '第一次搬上月球，連小龍都興奮得睡不著！', [Moon], [1, 2, 4, 8, 11, 16], 10, 0.6, 4),
  themed('山茶', '庭園設計師', '古堡的花、神社的楓，都是我慢慢收集的風景。', [Castle, Maple, Tide], [2, 6, 7, 10, 13, 15, 22], 50, 27, 15),
  themed('暮光船長', '落日探險家', '從海上到雲端，把每一次日落都當作新的冒險。', [Tide, Sky, Desert], [2, 11, 12, 14, 22, 26], 70, 41, 12),
  themed('幸運草', '幸運新鄰居', '今天剛搬來，希望這座小家園也能帶給你一點好運。', [Maple, Forest], [1, 2, 3, 7, 9, 10], 5, 0.05, 7),
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
    name: NPC_PLAYER_IDS[i],
    host: { ...(spec.host ?? ORIGINAL_HOSTS[i]), avatarIndex: i },
    slots: spec.slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] })),
    levels,
    deco: buildDeco(1000 + i, spec.decoCount, Math.min(4, Math.floor(i / 2))),
    daysAgo: spec.daysAgo,
  };
});
