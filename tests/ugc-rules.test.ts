/**
 * UGC 規則（SPEC-UGC §4–§9）：魚卡、培養、抽卡、家園輪替表、裝飾物擺放、掉券
 */
import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/math/random';
import { FishType } from '../src/game/define/FishDefine';
import { SceneType } from '../src/game/define/SceneDefine';
import { BOSS_FISH_TYPES, CARD_FISH_TYPES, FISH_RARITY, cardOf, expandCards, isBossCard } from '../src/game/ugc/CardDefine';
import { applyLevelUp, checkLevelUp, commissionRate, levelMultiplier, levelUpCost } from '../src/game/ugc/CultivateRule';
import { DECO_GRID, canPlaceDeco, validateDecoLayout } from '../src/game/ugc/DecoDefine';
import { GACHA_POOL, GACHA_RARITY_WEIGHT, applyGachaItem, gachaPoolOf, rollGacha } from '../src/game/ugc/GachaDefine';
import { countBoss, homePopularity, incomePerSecond, slotFishIssue, validateSlots, visitorCount } from '../src/game/ugc/HomeRule';
import { ticketBetFactor, ticketDrop } from '../src/game/ugc/TicketRule';
import { MAX_BOSS_PER_SLOT, MAX_LEVEL, MAX_SLOTS, STARTER_FISH } from '../src/game/ugc/UgcDefine';
import type { HomeSlot, Rarity } from '../src/game/ugc/UgcTypes';
import { createInitialProfile, sanitizeProfile } from '../src/server-fake/ugc/ProfileStore';
import { NPC_HOMES } from '../src/server-fake/ugc/npcHomes';

const all = () => true;
const { Forest, Desert, Boss_Sky_Dusk: Sky } = SceneType;

describe('魚卡', () => {
  it('初始 11 種是 N；Boss 是 SSR；蒼龍翅膀不是獨立的卡，跟著翔空蒼龍', () => {
    expect(STARTER_FISH).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const t of STARTER_FISH) expect(FISH_RARITY[t]).toBe('N');
    for (const t of BOSS_FISH_TYPES) expect(FISH_RARITY[t]).toBe('SSR');
    expect(BOSS_FISH_TYPES).toEqual([23, 24, 25, 26, 27]);
    expect(CARD_FISH_TYPES).not.toContain(FishType.AzureDragonWing);
    expect(cardOf(FishType.AzureDragonWing)).toBe(FishType.AzureDragon);
    expect(isBossCard(FishType.AzureDragonWing)).toBe(true);
    expect([...expandCards([FishType.AzureDragon, FishType.Cub])].sort((a, b) => a - b)).toEqual([1, 27, 28]);
  });
});

describe('家園輪替表', () => {
  const slot = (sceneType: number, fishTypes: number[]): HomeSlot => ({ sceneType, fishTypes });

  it('每格最多 3 種 Boss', () => {
    expect(MAX_BOSS_PER_SLOT).toBe(3);
    expect(validateSlots([slot(Forest, [1, 23, 24, 25])], all, all).ok).toBe(true);
    expect(countBoss([1, 2, 23, 24, 25, 12])).toBe(3);
    // 目前地面 Boss 3 種、天空 Boss 2 種，正常選不會超過；直接驗證「已選 3 種 Boss 就不能再加」這條規則
    expect(slotFishIssue(25, Forest, [1, 23, 24, 26], all)).toBe('Boss 已滿 3 隻');
    expect(slotFishIssue(25, Forest, [1, 23, 24], all)).toBeNull();
    expect(slotFishIssue(12, Forest, [23, 24, 25], all)).toBeNull();
  });

  it('風神翼龍 / 翔空蒼龍只能放在天空場景；地面 Boss 不能放在天空場景', () => {
    expect(validateSlots([slot(Sky, [26, 27, 2])], all, all).ok).toBe(true);
    const r1 = validateSlots([slot(Forest, [26])], all, all);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toContain('只能放在天空場景');
    const r2 = validateSlots([slot(Desert, [1, 27])], all, all);
    expect(r2.reason).toContain('只能放在天空場景');
    const r3 = validateSlots([slot(Sky, [24])], all, all);
    expect(r3.reason).toContain('只能放在地面場景');
  });

  it('只能用擁有的魚卡與場景；至少 1 格、每格至少 1 種龍；可重複同一個場景', () => {
    const ownedFish = (t: number) => t <= 11;
    const ownedScene = (s: number) => s === Forest;
    expect(validateSlots([slot(Forest, [1]), slot(Forest, [2]), slot(Forest, [1, 2])], ownedFish, ownedScene).ok).toBe(true);
    expect(validateSlots([slot(Forest, [12])], ownedFish, ownedScene).reason).toContain('尚未擁有');
    expect(validateSlots([slot(Desert, [1])], ownedFish, ownedScene).reason).toContain('尚未擁有');
    expect(validateSlots([], all, all).ok).toBe(false);
    expect(validateSlots([slot(Forest, [])], all, all).ok).toBe(false);
    expect(validateSlots([slot(Forest, [1, 1])], all, all).ok).toBe(false);
    expect(validateSlots(Array.from({ length: MAX_SLOTS + 1 }, () => slot(Forest, [1])), all, all).ok).toBe(false);
  });

  it('NPC 家園都符合規則', () => {
    expect(NPC_HOMES.length).toBe(8);
    for (const h of NPC_HOMES) {
      expect(validateSlots(h.slots, all, all), h.name).toEqual({ ok: true });
      const owned: Record<string, number> = {};
      for (const d of h.deco) owned[d.id] = (owned[d.id] ?? 0) + 1;
      expect(validateDecoLayout(h.deco, owned), h.name).toEqual({ ok: true });
      expect(h.deco.length, h.name).toBeGreaterThan(0);
    }
    expect(NPC_HOMES.map((h) => h.roomId)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('人氣：等級越高、內容越多越高；訪客數夾在 0.2 ~ 3', () => {
    const slots = [slot(Forest, [...STARTER_FISH])];
    const base = homePopularity(slots, 0, () => 1);
    expect(base).toBe(11 + 5);
    expect(homePopularity(slots, 0, () => 10)).toBeGreaterThan(base);
    expect(homePopularity(slots, 100, () => 1)).toBe(base + 30);
    expect(visitorCount(0)).toBe(0.2);
    expect(visitorCount(1e6)).toBe(3);
    expect(incomePerSecond(slots, 0, () => 1)).toBeCloseTo((16 / 40) * 2 * 300 * 0.05, 6);
  });
});

describe('培養', () => {
  it('倍率 / 抽成率隨等級上升', () => {
    expect(levelMultiplier(1)).toBe(1);
    expect(levelMultiplier(10)).toBeCloseTo(2.8);
    expect(commissionRate(1)).toBeCloseTo(0.05);
    expect(commissionRate(10)).toBeCloseTo(0.095);
  });

  it('升級成本：碎片 + 金幣；滿級不能再升', () => {
    expect(Array.from({ length: 9 }, (_, i) => levelUpCost('N', i + 1)!.copies)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(levelUpCost('SSR', 1)).toEqual({ copies: 1, gold: 400_000 });
    expect(levelUpCost('SSR', 9)).toEqual({ copies: 2, gold: 3_600_000 });
    expect(levelUpCost('N', MAX_LEVEL)).toBeNull();
    for (const r of ['N', 'R', 'SR', 'SSR'] as Rarity[]) for (let l = 1; l < MAX_LEVEL; l++) expect(levelUpCost(r, l)!.copies).toBeGreaterThanOrEqual(1);
  });

  it('碎片 / 金幣不足不能升；成功會扣碎片與金幣', () => {
    const p = createInitialProfile(0);
    expect(checkLevelUp(p, 1).reason).toContain('碎片不足');
    expect(checkLevelUp(p, 24).reason).toContain('尚未擁有');
    p.fish[1].copies = 3;
    p.money = 10;
    expect(checkLevelUp(p, 1).reason).toContain('金幣不足');
    p.money = 100_000;
    expect(applyLevelUp(p, 1)).toEqual({ ok: true });
    expect(p.fish[1]).toEqual({ level: 2, copies: 2 });
    expect(p.money).toBe(80_000);
    p.fish[1].level = MAX_LEVEL;
    expect(checkLevelUp(p, 1).reason).toContain('最高等級');
  });
});

describe('抽卡', () => {
  it('卡池：所有魚卡、初始場景以外的場景、所有裝飾物；每個稀有度都有東西', () => {
    expect(GACHA_POOL.filter((i) => i.kind === 'fish').map((i) => i.id)).toEqual([...CARD_FISH_TYPES]);
    expect(GACHA_POOL.some((i) => i.kind === 'scene' && i.id === Forest)).toBe(false);
    expect(GACHA_POOL.filter((i) => i.kind === 'scene')).toHaveLength(5);
    for (const r of ['N', 'R', 'SR', 'SSR'] as Rarity[]) expect(gachaPoolOf(r).length, r).toBeGreaterThan(0);
    expect(Object.values(GACHA_RARITY_WEIGHT).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('稀有度分布接近設定的機率', () => {
    const rng = new Random(7);
    const n = 40000;
    const count: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0 };
    for (const it of rollGacha(n, { next: () => rng.next() }).slice(0, n - 1)) count[it.rarity]++;
    expect(count.N / n).toBeCloseTo(0.62, 1);
    expect(count.R / n).toBeCloseTo(0.27, 1);
    expect(count.SR / n).toBeCloseTo(0.09, 1);
    expect(count.SSR / n).toBeGreaterThan(0.012);
    expect(count.SSR / n).toBeLessThan(0.028);
  });

  it('十連保底至少一個 R 以上；單抽沒有保底', () => {
    // 亂數永遠落在 N → 十連最後一抽被保底成 R 以上
    const low = { next: () => 0 };
    const ten = rollGacha(10, low);
    expect(ten.slice(0, 9).every((i) => i.rarity === 'N')).toBe(true);
    expect(ten[9].rarity).not.toBe('N');
    expect(rollGacha(1, low)[0].rarity).toBe('N');
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Random(seed);
      expect(rollGacha(10, rng).some((i) => i.rarity !== 'N'), `seed ${seed}`).toBe(true);
    }
  });

  it('入帳：新魚卡解鎖、重複變碎片；場景重複換金幣；裝飾物累加', () => {
    const p = createInitialProfile(0);
    expect(applyGachaItem(p, { kind: 'fish', id: 24, rarity: 'SSR' })).toMatchObject({ isNew: true });
    expect(p.fish[24]).toEqual({ level: 1, copies: 0 });
    expect(applyGachaItem(p, { kind: 'fish', id: 24, rarity: 'SSR' })).toMatchObject({ isNew: false, copies: 1 });
    expect(applyGachaItem(p, { kind: 'fish', id: 1, rarity: 'N' })).toMatchObject({ isNew: false, copies: 1 });
    const money = p.money;
    expect(applyGachaItem(p, { kind: 'scene', id: Desert, rarity: 'R' })).toMatchObject({ isNew: true });
    expect(p.scenes).toContain(Desert);
    expect(applyGachaItem(p, { kind: 'scene', id: Desert, rarity: 'R' })).toMatchObject({ isNew: false, gold: 100_000 });
    expect(p.money).toBe(money + 100_000);
    expect(applyGachaItem(p, { kind: 'deco', id: 'plate_gold', rarity: 'SSR' })).toMatchObject({ isNew: true, count: 1 });
    expect(applyGachaItem(p, { kind: 'deco', id: 'cube_white', rarity: 'N' })).toMatchObject({ isNew: false, count: 5 });
  });
});

describe('裝飾物擺放', () => {
  const owned = { cube_white: 2, bar_yellow: 1, block_green: 1 };

  it('格線 24 × 14；不能超出範圍、不能重疊；旋轉後寬深互換', () => {
    expect([DECO_GRID.cols, DECO_GRID.rows]).toEqual([24, 14]);
    expect(canPlaceDeco([], { id: 'cube_white', x: 23, y: 13, rot: 0 })).toBe(true);
    expect(canPlaceDeco([], { id: 'cube_white', x: 24, y: 0, rot: 0 })).toBe(false);
    expect(canPlaceDeco([], { id: 'cube_white', x: -1, y: 0, rot: 0 })).toBe(false);
    expect(canPlaceDeco([], { id: 'cube_white', x: 0.5, y: 0, rot: 0 })).toBe(false);
    // 長方塊 2×1：貼右邊放不下，旋轉成 1×2 就可以
    expect(canPlaceDeco([], { id: 'bar_yellow', x: 23, y: 0, rot: 0 })).toBe(false);
    expect(canPlaceDeco([], { id: 'bar_yellow', x: 23, y: 0, rot: 1 })).toBe(true);
    const placed = [{ id: 'block_green', x: 5, y: 5, rot: 0 as const }];
    expect(canPlaceDeco(placed, { id: 'cube_white', x: 6, y: 6, rot: 0 })).toBe(false);
    expect(canPlaceDeco(placed, { id: 'cube_white', x: 7, y: 6, rot: 0 })).toBe(true);
    expect(canPlaceDeco([], { id: 'nope', x: 0, y: 0, rot: 0 })).toBe(false);
  });

  it('整份配置：不超過擁有數', () => {
    const ok = [
      { id: 'cube_white', x: 0, y: 0, rot: 0 as const },
      { id: 'cube_white', x: 1, y: 0, rot: 0 as const },
      { id: 'bar_yellow', x: 3, y: 0, rot: 1 as const },
    ];
    expect(validateDecoLayout(ok, owned)).toEqual({ ok: true });
    const tooMany = [...ok, { id: 'cube_white', x: 2, y: 0, rot: 0 as const }];
    expect(validateDecoLayout(tooMany, owned).reason).toContain('數量不足');
    expect(validateDecoLayout([ok[0], ok[0]], owned).reason).toContain('重疊');
    expect(validateDecoLayout([{ id: 'plate_gold', x: 0, y: 0, rot: 0 }], owned).reason).toContain('數量不足');
  });
});

describe('掉券', () => {
  it('押注係數夾在 0.2 ~ 2；等級加成只在別人的家園', () => {
    expect(ticketBetFactor(10)).toBe(0.2);
    expect(ticketBetFactor(500)).toBe(1);
    expect(ticketBetFactor(5000)).toBe(2);
    expect(ticketDrop(1, false, 500, 10, false).chance).toBeCloseTo(0.015);
    expect(ticketDrop(1, false, 500, 10, true).chance).toBeCloseTo(0.015 * 1.9);
  });

  it('Boss 大獎必掉 3 張、小獎（不死）10% 1 張', () => {
    expect(ticketDrop(FishType.TRex, false, 10, 1, false)).toEqual({ chance: 0.2, count: 3 });
    expect(ticketDrop(FishType.TRex, false, 500, 1, false)).toEqual({ chance: 1, count: 3 });
    expect(ticketDrop(FishType.TRex, true, 500, 1, false)).toEqual({ chance: 0.1, count: 1 });
    expect(ticketDrop(FishType.AzureDragonWing, false, 500, 1, false).count).toBe(1);
  });
});

describe('存檔整理', () => {
  it('初始資產：11 種龍、森林、10 張券、幾個方塊', () => {
    const p = createInitialProfile(123);
    expect(Object.keys(p.fish).map(Number)).toEqual([...STARTER_FISH]);
    expect(p.scenes).toEqual([Forest]);
    expect(p.tickets).toBe(10);
    expect(p.home.slots).toEqual([{ sceneType: Forest, fishTypes: [...STARTER_FISH] }]);
    expect(validateDecoLayout(p.home.deco, p.decos).ok).toBe(true);
  });

  it('壞掉 / 版本不符的存檔 → null；不合法的家園設定退回預設、其他資產保留', () => {
    expect(sanitizeProfile(null, 0)).toBeNull();
    expect(sanitizeProfile({ version: 2 }, 0)).toBeNull();
    const raw = JSON.parse(JSON.stringify(createInitialProfile(0)));
    raw.tickets = 77;
    raw.fish[24] = { level: 99, copies: 4 };
    raw.home.slots = [{ sceneType: Forest, fishTypes: [26] }]; // 風神翼龍不能放森林，而且沒有這張卡
    raw.home.deco = [{ id: 'cube_white', x: 999, y: 0, rot: 0 }];
    const p = sanitizeProfile(raw, 5000)!;
    expect(p.tickets).toBe(77);
    expect(p.fish[24]).toEqual({ level: MAX_LEVEL, copies: 4 });
    expect(p.home.slots).toEqual([{ sceneType: Forest, fishTypes: [...STARTER_FISH] }]);
    expect(p.home.deco).toEqual([]);
  });
});
