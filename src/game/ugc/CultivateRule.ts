/**
 * 培養：等級效果與升級成本（SPEC-UGC §7）
 */
import { CARD_FISH_TYPES, FISH_RARITY } from './CardDefine';
import { MAX_LEVEL } from './UgcDefine';
import { OK, fail, type CardUpgrade, type LevelUpAllPlan, type PlayerProfile, type Rarity, type RuleResult } from './UgcTypes';

const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));

/** 倍率：中獎金額 = 押注 × 賠率 × 倍率；被打死的機率與倍率成反比 */
export function levelMultiplier(level: number): number {
  return 1 + 0.2 * (clampLevel(level) - 1);
}

/** 屋主抽成率（訪客開砲成本的比例） */
export function commissionRate(level: number): number {
  return 0.05 + 0.005 * (clampLevel(level) - 1);
}

/** 訪客掉券係數（只在別人的家園有效） */
export function ticketLevelFactor(level: number): number {
  return 1 + 0.1 * (clampLevel(level) - 1);
}

/** 人氣的等級係數 */
export function popularityLevelFactor(level: number): number {
  return 1 + 0.2 * (clampLevel(level) - 1);
}

const COPY_FACTOR: Record<Rarity, number> = { N: 0.5, R: 0.34, SR: 0.3, SSR: 0.2 };
const GOLD_BASE: Record<Rarity, number> = { N: 20_000, R: 60_000, SR: 160_000, SSR: 400_000 };

export interface LevelUpCost {
  copies: number;
  gold: number;
}

/** Lv.level → level + 1 的成本；已滿級回傳 null */
export function levelUpCost(rarity: Rarity, level: number): LevelUpCost | null {
  if (level >= MAX_LEVEL) return null;
  const l = clampLevel(level);
  return { copies: Math.ceil(l * COPY_FACTOR[rarity] - 1e-9), gold: GOLD_BASE[rarity] * l };
}

/** 能不能升級（不改資料） */
export function checkLevelUp(profile: PlayerProfile, fishType: number): RuleResult {
  const card = profile.fish[fishType];
  const rarity = FISH_RARITY[fishType];
  if (!card || !rarity) return fail('尚未擁有這張魚卡');
  const cost = levelUpCost(rarity, card.level);
  if (!cost) return fail('已達最高等級');
  if (card.copies < cost.copies) return fail(`碎片不足（需要 ${cost.copies}）`);
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
