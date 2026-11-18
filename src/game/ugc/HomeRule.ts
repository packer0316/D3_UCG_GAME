/**
 * 家園規則：輪替表驗證、放龍限制、人氣、訪客收益（SPEC-UGC §5.3、§8）
 */
import { SCENE_DEFINES, isFishAllowedInScene, isSkyScene } from '../define/SceneDefine';
import { BOSS_FISH_TYPES, FISH_RARITY, RARITY_SCORE, isBossCard } from './CardDefine';
import { commissionRate, popularityLevelFactor } from './CultivateRule';
import {
  DAY_MS,
  MAX_BOSS_PER_SLOT,
  MAX_SLOTS,
  NEW_HOME_DAYS,
  POPULARITY_DECO_CAP,
  POPULARITY_PER_SCENE,
  POPULARITY_PER_VISITOR,
  STARTER_FISH,
  STARTER_SCENES,
  VISITOR_AVG_BET,
  VISITOR_MAX,
  VISITOR_MIN,
  VISITOR_SHOTS_PER_SEC,
} from './UgcDefine';
import { OK, fail, type HomeRanking, type HomeSlot, type HomeState, type RoomDetail, type RuleResult } from './UgcTypes';

/** 新玩家的家園：森林 + 初始 11 種龍 */
export function createDefaultHome(now: number): HomeState {
  return {
    slots: [{ sceneType: STARTER_SCENES[0], fishTypes: [...STARTER_FISH] }],
    deco: [],
    pending: 0,
    totalEarned: 0,
    lastAccrueAt: now,
  };
}

/** 這格已選的 Boss 數 */
export function countBoss(fishTypes: readonly number[]): number {
  return fishTypes.filter((t) => BOSS_FISH_TYPES.includes(t)).length;
}

/**
 * 這隻龍能不能加進這個場景格；不行回傳原因（給介面反灰用），可以回傳 null。
 * selected = 這格目前已選的龍（不含這隻）
 */
export function slotFishIssue(fishType: number, sceneType: number, selected: readonly number[], owned: (fishType: number) => boolean): string | null {
  if (!FISH_RARITY[fishType]) return '不是魚卡';
  if (!owned(fishType)) return '尚未擁有';
  if (!isFishAllowedInScene(fishType, sceneType)) return isSkyScene(sceneType) ? '只能放在地面場景' : '只能放在天空場景';
  if (isBossCard(fishType) && countBoss(selected) >= MAX_BOSS_PER_SLOT) return `Boss 已滿 ${MAX_BOSS_PER_SLOT} 隻`;
  return null;
}

/** 輪替表驗證（server 存檔前、client 送出前） */
export function validateSlots(
  slots: readonly HomeSlot[],
  ownedFish: (fishType: number) => boolean,
  ownedScene: (sceneType: number) => boolean,
): RuleResult {
  if (!Array.isArray(slots) || slots.length < 1) return fail('至少要有 1 個場景');
  if (slots.length > MAX_SLOTS) return fail(`最多 ${MAX_SLOTS} 個場景`);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const label = `第 ${i + 1} 格`;
    const def = SCENE_DEFINES[s?.sceneType];
    if (!def) return fail(`${label}：場景不存在`);
    if (!ownedScene(s.sceneType)) return fail(`${label}：尚未擁有「${def.name}」`);
    if (!Array.isArray(s.fishTypes) || s.fishTypes.length < 1) return fail(`${label}（${def.name}）：至少要放 1 種龍`);
    if (new Set(s.fishTypes).size !== s.fishTypes.length) return fail(`${label}：龍重複了`);
    const picked: number[] = [];
    for (const t of s.fishTypes) {
      const issue = slotFishIssue(t, s.sceneType, picked, ownedFish);
      if (issue) return fail(`${label}（${def.name}）：${issue}`);
      picked.push(t);
    }
  }
  return OK;
}

/** 人氣：放出的每種龍（稀有度分數 × 等級係數）+ 場景種類 × 5 + 裝飾物數（最多 30） */
export function homePopularity(slots: readonly HomeSlot[], decoCount: number, levelOf: (fishType: number) => number): number {
  return homePopularityBreakdown(slots, decoCount, levelOf).total;
}

/** 與人氣計算共用的明細，提供房間列表的數值說明。 */
export function homePopularityBreakdown(slots: readonly HomeSlot[], decoCount: number, levelOf: (fishType: number) => number) {
  const fish = new Set<number>();
  const scenes = new Set<number>();
  for (const s of slots) {
    scenes.add(s.sceneType);
    s.fishTypes.forEach((t) => fish.add(t));
  }
  const sceneScore = scenes.size * POPULARITY_PER_SCENE;
  const decorationScore = Math.min(decoCount, POPULARITY_DECO_CAP);
  let dragonScore = 0;
  let score = sceneScore + decorationScore;
  for (const t of fish) {
    const contribution = (RARITY_SCORE[FISH_RARITY[t]] ?? 0) * popularityLevelFactor(levelOf(t));
    dragonScore += contribution;
    score += contribution;
  }
  return { fishCount: fish.size, sceneCount: scenes.size, dragonScore, sceneScore, decorationScore, total: Math.round(score * 10) / 10 };
}

/** 平均訪客數 */
export function visitorCount(popularity: number): number {
  return Math.min(VISITOR_MAX, Math.max(VISITOR_MIN, popularity / POPULARITY_PER_VISITOR));
}

/** 放出的龍的平均抽成率 */
export function averageCommissionRate(slots: readonly HomeSlot[], levelOf: (fishType: number) => number): number {
  let sum = 0;
  let n = 0;
  for (const s of slots)
    for (const t of s.fishTypes) {
      sum += commissionRate(levelOf(t));
      n++;
    }
  return n ? sum / n : commissionRate(1);
}

/** 模擬訪客每秒帶來的抽成 */
export function incomePerSecond(slots: readonly HomeSlot[], decoCount: number, levelOf: (fishType: number) => number): number {
  const visitors = visitorCount(homePopularity(slots, decoCount, levelOf));
  return visitors * VISITOR_SHOTS_PER_SEC * VISITOR_AVG_BET * averageCommissionRate(slots, levelOf);
}

/** 開張後過了幾天（不足一天 = 0） */
export function homeAgeDays(createdAt: number, now: number): number {
  return Math.max(0, Math.floor((now - createdAt) / DAY_MS));
}

/** 是不是新星家園：開張 NEW_HOME_DAYS 天內 */
export function isNewHome(createdAt: number, now: number): boolean {
  return now - createdAt < NEW_HOME_DAYS * DAY_MS;
}

/**
 * 房間列表排行（SPEC-UGC §2.4）：只排家園（公有地不參加）。
 * hot = 全部家園；rising = 開張 NEW_HOME_DAYS 天內的家園。排序：人氣高 → 開張時間新 → 房號小。
 */
export function rankHomes(rooms: readonly RoomDetail[], now: number): HomeRanking {
  const homes = rooms
    .filter((r) => r.kind === 'home')
    .sort((a, b) => b.popularity - a.popularity || b.createdAt - a.createdAt || a.roomId - b.roomId);
  return {
    hot: homes.map((r) => r.roomId),
    rising: homes.filter((r) => isNewHome(r.createdAt, now)).map((r) => r.roomId),
  };
}
