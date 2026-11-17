/**
 * 抽卡：卡池、機率、抽卡與入帳（純函式；SPEC-UGC §6）
 */
import { CARD_FISH_TYPES, FISH_RARITY, RARITIES, SCENE_RARITY, rarityRank } from './CardDefine';
import { DECO_DEFINES } from './DecoDefine';
import { STARTER_SCENES } from './UgcDefine';
import type { GachaItemKind, GachaResult, PlayerProfile, Rarity } from './UgcTypes';

export interface GachaItem {
  kind: GachaItemKind;
  id: number | string;
  rarity: Rarity;
}

/** 稀有度機率（權重，總和 100） */
export const GACHA_RARITY_WEIGHT: Record<Rarity, number> = { N: 62, R: 27, SR: 9, SSR: 2 };

/** 可抽的次數 → 需要的券 */
export const GACHA_COST: Readonly<Record<number, number>> = { 1: 1, 10: 10 };
/** 十連保底：至少一個這個稀有度以上 */
export const GACHA_TEN_GUARANTEE: Rarity = 'R';

/** 場景重複 → 換成金幣 */
export const SCENE_DUPLICATE_GOLD: Record<Rarity, number> = { N: 30_000, R: 100_000, SR: 300_000, SSR: 1_000_000 };

/** 卡池：所有魚卡 + 初始場景以外的場景 + 所有裝飾物 */
export const GACHA_POOL: readonly GachaItem[] = [
  ...CARD_FISH_TYPES.map((t): GachaItem => ({ kind: 'fish', id: t, rarity: FISH_RARITY[t] })),
  ...Object.keys(SCENE_RARITY)
    .map(Number)
    .filter((s) => !STARTER_SCENES.includes(s))
    .map((s): GachaItem => ({ kind: 'scene', id: s, rarity: SCENE_RARITY[s] })),
  ...DECO_DEFINES.map((d): GachaItem => ({ kind: 'deco', id: d.id, rarity: d.rarity })),
];

const POOL_BY_RARITY: Record<Rarity, GachaItem[]> = { N: [], R: [], SR: [], SSR: [] };
for (const it of GACHA_POOL) POOL_BY_RARITY[it.rarity].push(it);

export function gachaPoolOf(rarity: Rarity): readonly GachaItem[] {
  return POOL_BY_RARITY[rarity];
}

interface Rng {
  next(): number;
}

/** 抽一個稀有度；minRarity = 保底（低於它的稀有度不會出） */
function rollRarity(rng: Rng, minRarity: Rarity = 'N'): Rarity {
  const list = RARITIES.filter((r) => rarityRank(r) >= rarityRank(minRarity) && POOL_BY_RARITY[r].length > 0);
  const total = list.reduce((s, r) => s + GACHA_RARITY_WEIGHT[r], 0);
  let x = rng.next() * total;
  for (const r of list) {
    x -= GACHA_RARITY_WEIGHT[r];
    if (x < 0) return r;
  }
  return list[list.length - 1];
}

function rollOne(rng: Rng, minRarity?: Rarity): GachaItem {
  const pool = POOL_BY_RARITY[rollRarity(rng, minRarity)];
  return pool[Math.floor(rng.next() * pool.length)];
}

/** 抽 times 次；十連時若前 9 抽都沒到保底稀有度，第 10 抽保底 */
export function rollGacha(times: number, rng: Rng): GachaItem[] {
  const out: GachaItem[] = [];
  const guarantee = rarityRank(GACHA_TEN_GUARANTEE);
  for (let i = 0; i < times; i++) {
    const needGuarantee = times >= 10 && i === times - 1 && !out.some((it) => rarityRank(it.rarity) >= guarantee);
    out.push(rollOne(rng, needGuarantee ? GACHA_TEN_GUARANTEE : undefined));
  }
  return out;
}

/** 把抽到的東西入帳（改 profile），回傳給 client 顯示的結果 */
export function applyGachaItem(profile: PlayerProfile, item: GachaItem): GachaResult {
  const base = { kind: item.kind, id: item.id, rarity: item.rarity };
  if (item.kind === 'fish') {
    const t = item.id as number;
    const card = profile.fish[t];
    if (!card) {
      profile.fish[t] = { level: 1, copies: 0 };
      return { ...base, isNew: true };
    }
    card.copies += 1;
    return { ...base, isNew: false, copies: card.copies };
  }
  if (item.kind === 'scene') {
    const s = item.id as number;
    if (!profile.scenes.includes(s)) {
      profile.scenes.push(s);
      return { ...base, isNew: true };
    }
    const gold = SCENE_DUPLICATE_GOLD[item.rarity];
    profile.money += gold;
    return { ...base, isNew: false, gold };
  }
  const id = item.id as string;
  const had = profile.decos[id] ?? 0;
  profile.decos[id] = had + 1;
  return { ...base, isNew: had === 0, count: had + 1 };
}
