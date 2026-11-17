/**
 * 培養：等級效果與升級成本（SPEC-UGC §7）
 */
import { FISH_RARITY } from './CardDefine';
import { MAX_LEVEL } from './UgcDefine';
import { OK, fail, type PlayerProfile, type Rarity, type RuleResult } from './UgcTypes';

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
