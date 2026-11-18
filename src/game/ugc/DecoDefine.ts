/**
 * 裝飾物定義、格線、擺放規則（SPEC-UGC §9）。
 * client 的預覽與假 server 的驗證共用這一份。
 *
 * 之後要加正式的裝飾物：在 DECO_DEFINES 加一筆並填 model；
 * 抽卡池、物品列、驗證都讀這張表，3D 外觀由 features/ugc/decor/DecoFactory.ts 依 model 建立。
 */
import { OK, fail, type DecoPlacement, type Rarity, type RuleResult } from './UgcTypes';

export interface DecoDefine {
  id: string;
  name: string;
  /** 佔地（格）：寬（x 方向）× 深（y 方向） */
  w: number;
  d: number;
  /** 高度（格） */
  h: number;
  /** 佔位方塊的顏色（0xRRGGBB） */
  color: number;
  rarity: Rarity;
  /** 模型識別碼；artisan 使用專屬程序化模型。 */
  model?: string;
  description?: string;
}

/** 舊物品保留原 ID，既有家園配置與持有數不會失效。 */
export const DECO_DEFINES: readonly DecoDefine[] = [
  { id: 'cube_white', name: '小方塊（白）', w: 1, d: 1, h: 1, color: 0xe8edf2, rarity: 'N' },
  { id: 'cube_red', name: '小方塊（紅）', w: 1, d: 1, h: 1, color: 0xd9534f, rarity: 'N' },
  { id: 'cube_blue', name: '小方塊（藍）', w: 1, d: 1, h: 1, color: 0x3d8bd9, rarity: 'N' },
  { id: 'bar_yellow', name: '長方塊（黃）', w: 2, d: 1, h: 1, color: 0xe6b422, rarity: 'R' },
  { id: 'block_green', name: '大方塊（綠）', w: 2, d: 2, h: 2, color: 0x4caf6a, rarity: 'R' },
  { id: 'tower_purple', name: '高方塊（紫）', w: 1, d: 1, h: 3, color: 0x8e5bd6, rarity: 'SR' },
  { id: 'plate_gold', name: '金色平台', w: 3, d: 3, h: 0.5, color: 0xf2c84b, rarity: 'SSR' },
  // 花園珍藏：6 件一格、3 件兩格、2 件三格、1 件四格。
  { id: 'pumpkin_lantern', name: '南瓜燈籠怪', w: 1, d: 1, h: 1.15, color: 0xe98827, rarity: 'R', model: 'artisan', description: '藤蔓小怪守著一盞搖曳的萬聖節燈火。' },
  { id: 'victorian_lamp', name: '維多利亞路燈', w: 1, d: 1, h: 2.6, color: 0xe4b965, rarity: 'R', model: 'artisan', description: '鍛鐵花飾、黃銅雕邊與溫暖的六角燈室。' },
  { id: 'taiwan_flag', name: '台灣國旗', w: 1, d: 1, h: 2.6, color: 0xde4248, rarity: 'N', model: 'artisan', description: '金屬旗桿上，青天白日滿地紅隨風飄揚。' },
  { id: 'snowman', name: '暖心雪人', w: 1, d: 1, h: 1.6, color: 0xdcefff, rarity: 'N', model: 'artisan', description: '雪晶閃耀，紅圍巾與高帽陪你度過冬夜。' },
  { id: 'mushroom_lantern', name: '微光蘑菇屋', w: 1, d: 1, h: 1.15, color: 0xef725c, rarity: 'R', model: 'artisan', description: '苔蘚間的小小窗戶，透出森林精靈的燈光。' },
  { id: 'lotus_bowl', name: '青瓷蓮花缽', w: 1, d: 1, h: .7, color: 0x85c9b1, rarity: 'N', model: 'artisan', description: '冰裂青瓷與金邊，托住一朵盛放的粉蓮。' },
  { id: 'rose_bench', name: '薔薇鍛鐵長椅', w: 2, d: 1, h: 1.2, color: 0xba8260, rarity: 'R', model: 'artisan', description: '油亮木條、卷草扶手與兩簇深紅薔薇。' },
  { id: 'wishing_well', name: '星願古井', w: 2, d: 1, h: 1.9, color: 0xb5b5a0, rarity: 'SR', model: 'artisan', description: '石砌井壁、紅瓦屋頂與懸在波光上的銅桶。' },
  { id: 'celestial_orrery', name: '黃銅星象儀', w: 2, d: 1, h: 1.8, color: 0xd9b55b, rarity: 'SR', model: 'artisan', description: '三重星環緩緩轉動，藍寶石映出宇宙微光。' },
  { id: 'banyan_tree', name: '千絲榕樹', w: 3, d: 1, h: 2.7, color: 0x64a66a, rarity: 'SR', model: 'artisan', description: '盤根、垂落氣根與濃密翠葉，留下一片樹蔭。' },
  { id: 'rose_pergola', name: '月白薔薇花架', w: 3, d: 1, h: 2.25, color: 0xd9c7b4, rarity: 'SR', model: 'artisan', description: '白石雕柱與金色花格，覆滿深紅薔薇。' },
  { id: 'celestial_fountain', name: '星輝水晶噴泉', w: 2, d: 2, h: 1.9, color: 0x75cdd5, rarity: 'SSR', model: 'artisan', description: '雙層雕花白石池與水晶寶珠，六道泉水灑落星光。' },
];

export const GARDEN_DECO_DEFINES = DECO_DEFINES.filter(d => d.model === 'artisan');

const BY_ID = new Map(DECO_DEFINES.map((d) => [d.id, d]));

export function getDecoDefine(id: string): DecoDefine | undefined {
  return BY_ID.get(id);
}

/**
 * 格線：世界座標（Z 朝上，地面 z = 0）x −120 ~ 120、y 10 ~ 150，一格 10 → 24 × 14 格。
 * 範圍取在子彈牆內（原版 WALL_POLYGON），兩種遊戲相機都看得到。
 */
export const DECO_GRID = {
  originX: -120,
  originY: 10,
  cell: 10,
  cols: 24,
  rows: 14,
} as const;

/** 最多擺幾個 */
export const MAX_DECO_ITEMS = 60;

/** 旋轉後的佔地 */
export function decoFootprint(def: DecoDefine, rot: 0 | 1): { w: number; d: number } {
  return rot === 1 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

/** 格線座標 → 佔地的世界座標範圍 */
export function decoWorldRect(p: DecoPlacement, def: DecoDefine): { x: number; y: number; w: number; d: number } {
  const f = decoFootprint(def, p.rot);
  const g = DECO_GRID;
  return { x: g.originX + p.x * g.cell, y: g.originY + p.y * g.cell, w: f.w * g.cell, d: f.d * g.cell };
}

/** 世界座標 → 格線座標（可能在範圍外） */
export function worldToCell(wx: number, wy: number): { x: number; y: number } {
  const g = DECO_GRID;
  return { x: Math.floor((wx - g.originX) / g.cell), y: Math.floor((wy - g.originY) / g.cell) };
}

function inBounds(p: DecoPlacement, def: DecoDefine): boolean {
  const f = decoFootprint(def, p.rot);
  return (
    Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x + f.w <= DECO_GRID.cols && p.y + f.d <= DECO_GRID.rows
  );
}

function overlaps(a: DecoPlacement, da: DecoDefine, b: DecoPlacement, db: DecoDefine): boolean {
  const fa = decoFootprint(da, a.rot);
  const fb = decoFootprint(db, b.rot);
  return a.x < b.x + fb.w && b.x < a.x + fa.w && a.y < b.y + fb.d && b.y < a.y + fa.d;
}

/** 這一件能不能放進現有配置（範圍 + 不重疊）；不檢查擁有數 */
export function canPlaceDeco(items: readonly DecoPlacement[], item: DecoPlacement): boolean {
  const def = getDecoDefine(item.id);
  if (!def || (item.rot !== 0 && item.rot !== 1) || !inBounds(item, def)) return false;
  for (const other of items) {
    const od = getDecoDefine(other.id);
    if (od && overlaps(item, def, other, od)) return false;
  }
  return true;
}

/** 已擺放的數量（decoId → 數量） */
export function countPlaced(items: readonly DecoPlacement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.id] = (out[it.id] ?? 0) + 1;
  return out;
}

/** 整份配置驗證：物品存在、範圍、不重疊、不超過擁有數、不超過上限 */
export function validateDecoLayout(items: readonly DecoPlacement[], owned: Readonly<Record<string, number>>): RuleResult {
  if (!Array.isArray(items)) return fail('配置格式錯誤');
  if (items.length > MAX_DECO_ITEMS) return fail(`最多擺 ${MAX_DECO_ITEMS} 個`);
  const placed: DecoPlacement[] = [];
  for (const it of items) {
    const def = getDecoDefine(it?.id);
    if (!def) return fail('有不存在的裝飾物');
    if (!canPlaceDeco(placed, it)) return fail(`「${def.name}」超出範圍或與其他物品重疊`);
    placed.push(it);
  }
  for (const [id, n] of Object.entries(countPlaced(items))) {
    if (n > (owned[id] ?? 0)) return fail(`「${getDecoDefine(id)!.name}」數量不足`);
  }
  return OK;
}
