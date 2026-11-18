/**
 * 培養：等級效果與升級成本（SPEC-UGC §7）
 *
 * 指定：倍率從原倍率的 4 成起、Lv.100 = 1.4 倍；原倍率低於 10 倍的不動；抽成 Lv.100 = 30%；兩者慢慢升。
 * 其餘（曲線指數、成本、掉券 / 人氣係數）是推算的預設值，可以調。
 */
import { CARD_FISH_TYPES, CARD_ORIGINAL_ODDS, FISH_RARITY, cardOf } from './CardDefine';
import { MAX_LEVEL } from './UgcDefine';
import { OK, fail, type CardUpgrade, type LevelUpAllPlan, type PlayerProfile, type Rarity, type RuleResult } from './UgcTypes';

const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));

/** 成長曲線的指數：> 1 = 前期慢、後期快 */
export const LEVEL_CURVE_POWER = 1.5;
/** 原倍率低於這個值的龍，倍率不隨等級改變 */
export const FIXED_ODDS_BELOW = 10;
/** 倍率：Lv.1 / Lv.MAX（相對原倍率） */
export const MULT_MIN = 0.4;
export const MULT_MAX = 1.4;
/** 屋主抽成率：Lv.1 / Lv.MAX */
export const COMMISSION_MIN = 0.05;
export const COMMISSION_MAX = 0.3;

/** 成長進度 g(L)：Lv.1 = 0、Lv.MAX = 1 */
export function levelGrowth(level: number): number {
  return ((clampLevel(level) - 1) / (MAX_LEVEL - 1)) ** LEVEL_CURVE_POWER;
}

/** 等級倍率（原倍率 ≥ 10 的龍）：中獎金額 = 押注 × 賠率 × 倍率；被打死的機率與倍率成反比 */
export function levelMultiplier(level: number): number {
  return MULT_MIN + (MULT_MAX - MULT_MIN) * levelGrowth(level);
}

/** 原倍率低於 10 倍 → 倍率固定（蒼龍翅膀看翔空蒼龍；說明頁沒有倍率的獵龍騎士照常套用） */
export function hasFixedOdds(fishType: number): boolean {
  const o = CARD_ORIGINAL_ODDS[cardOf(fishType)];
  return !!o && o.odds < FIXED_ODDS_BELOW;
}

/** 這隻龍在家園的倍率（公有地一律 1，由呼叫端決定） */
export function fishMultiplier(fishType: number, level: number): number {
  return hasFixedOdds(fishType) ? 1 : levelMultiplier(level);
}

/** 屋主抽成率（訪客開砲成本的比例） */
export function commissionRate(level: number): number {
  return COMMISSION_MIN + (COMMISSION_MAX - COMMISSION_MIN) * levelGrowth(level);
}

/** 訪客掉券係數（只在別人的家園有效）：×1 → ×2 */
export function ticketLevelFactor(level: number): number {
  return 1 + 1.0 * levelGrowth(level);
}

/** 人氣的等級係數：×1 → ×3 */
export function popularityLevelFactor(level: number): number {
  return 1 + 2.0 * levelGrowth(level);
}

/** 每幾級突破一次（Lv.10→11、20→21 … 要碎片） */
export const BREAKTHROUGH_EVERY = 10;
const COPY_FACTOR: Record<Rarity, number> = { N: 0.5, R: 0.34, SR: 0.3, SSR: 0.2 };
const GOLD_BASE: Record<Rarity, number> = { N: 2_000, R: 6_000, SR: 16_000, SSR: 40_000 };

export interface LevelUpCost {
  /** 突破才要碎片，其他等級 0 */
  copies: number;
  gold: number;
}

/** Lv.level → level + 1 是不是突破 */
export function isBreakthrough(level: number): boolean {
  return level % BREAKTHROUGH_EVERY === 0;
}

/** Lv.level → level + 1 的成本；已滿級回傳 null */
export function levelUpCost(rarity: Rarity, level: number): LevelUpCost | null {
  if (level >= MAX_LEVEL) return null;
  const l = clampLevel(level);
  const copies = isBreakthrough(l) ? Math.ceil((l / BREAKTHROUGH_EVERY) * COPY_FACTOR[rarity] - 1e-9) : 0;
  return { copies, gold: GOLD_BASE[rarity] * l };
}

/** 從 level 起的下一次突破：{ 在哪一級、要幾片 }；之後沒有突破 → null */
export function nextBreakthrough(rarity: Rarity, level: number): { level: number; copies: number } | null {
  const at = Math.max(BREAKTHROUGH_EVERY, Math.ceil(clampLevel(level) / BREAKTHROUGH_EVERY) * BREAKTHROUGH_EVERY);
  const cost = levelUpCost(rarity, at);
  return cost ? { level: at, copies: cost.copies } : null;
}

/** 能不能升級（不改資料） */
export function checkLevelUp(profile: PlayerProfile, fishType: number): RuleResult {
  const card = profile.fish[fishType];
  const rarity = FISH_RARITY[fishType];
  if (!card || !rarity) return fail('尚未擁有這張魚卡');
  const cost = levelUpCost(rarity, card.level);
  if (!cost) return fail('已達最高等級');
  if (card.copies < cost.copies) return fail(`突破碎片不足（需要 ${cost.copies}）`);
  if (profile.money < cost.gold) return fail('金幣不足');
  return OK;
}

/** 升級（成功才改資料） */
export function applyLevelUp(profile: PlayerProfile, fishType: number): RuleResult {
  const r = checkLevelUp(profile, fishType);
  if (!r.ok) return r;
  const card = profile.fish[fishType];
  const cost = levelUpCost(FISH_RARITY[fishType], card.level)!;
  card.copies -= cost.copies;
  card.level += 1;
  profile.money -= cost.gold;
  return OK;
}

/**
 * 一鍵升級的計畫（SPEC-UGC §7.1；只算不改）：
 * 每次挑下一級金幣最便宜的一步（同價 → 等級低的先 → 魚卡順序），直到碎片或金幣不夠。
 * budget = 最多花多少金幣（server 用確認框的總花費當上限；不會超過餘額）。
 */
export function planLevelUpAll(profile: PlayerProfile, budget: number = profile.money): LevelUpAllPlan {
  let money = Number.isFinite(budget) ? Math.max(0, Math.min(budget, profile.money)) : 0;
  const cards = CARD_FISH_TYPES.flatMap((fishType) => {
    const card = profile.fish[fishType];
    const rarity = FISH_RARITY[fishType];
    if (!card || !rarity) return [];
    const up: CardUpgrade = { fishType, from: card.level, to: card.level, copies: 0, gold: 0 };
    return [{ rarity, copies: card.copies, up }];
  });

  const plan: LevelUpAllPlan = { upgrades: [], levels: 0, copies: 0, gold: 0 };
  for (;;) {
    let best: (typeof cards)[number] | null = null;
    let bestCost: LevelUpCost | null = null;
    for (const c of cards) {
      const cost = levelUpCost(c.rarity, c.up.to);
      if (!cost || c.copies < cost.copies || money < cost.gold) continue;
      if (!bestCost || cost.gold < bestCost.gold || (cost.gold === bestCost.gold && c.up.to < best!.up.to)) {
        best = c;
        bestCost = cost;
      }
    }
    if (!best || !bestCost) break;
    best.copies -= bestCost.copies;
    money -= bestCost.gold;
    best.up.to += 1;
    best.up.copies += bestCost.copies;
    best.up.gold += bestCost.gold;
    plan.levels += 1;
    plan.copies += bestCost.copies;
    plan.gold += bestCost.gold;
  }
  plan.upgrades = cards.filter((c) => c.up.to > c.up.from).map((c) => c.up);
  return plan;
}

/** 一鍵升級（照 planLevelUpAll 的結果改資料；一級都升不了 → levels = 0、不改資料） */
export function applyLevelUpAll(profile: PlayerProfile, budget?: number): LevelUpAllPlan {
  const plan = planLevelUpAll(profile, budget);
  for (const u of plan.upgrades) {
    const card = profile.fish[u.fishType];
    card.level = u.to;
    card.copies -= u.copies;
  }
  profile.money -= plan.gold;
  return plan;
}
