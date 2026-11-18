/**
 * UGC 規則（SPEC-UGC §4–§9）：魚卡、培養、抽卡、家園輪替表、裝飾物擺放、掉券
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Random } from '../src/core/math/random';
import type { FishDataFile } from '../src/game/path/PathTypes';
import { FishType } from '../src/game/define/FishDefine';
import { SceneType } from '../src/game/define/SceneDefine';
import { BOSS_FISH_TYPES, CARD_FISH_TYPES, CARD_ORIGINAL_ODDS, FISH_RARITY, cardOf, expandCards, isBossCard } from '../src/game/ugc/CardDefine';
import {
  applyLevelUp,
  applyLevelUpAll,
  checkLevelUp,
  commissionRate,
  fishMultiplier,
  hasFixedOdds,
  levelMultiplier,
  levelUpCost,
  nextBreakthrough,
  planLevelUpAll,
  popularityLevelFactor,
  ticketLevelFactor,
} from '../src/game/ugc/CultivateRule';
import { DECO_GRID, canPlaceDeco, validateDecoLayout } from '../src/game/ugc/DecoDefine';
import { GACHA_POOL, GACHA_RARITY_WEIGHT, applyGachaItem, gachaPoolOf, rollGacha } from '../src/game/ugc/GachaDefine';
import { countBoss, homeAgeDays, homePopularity, incomePerSecond, rankHomes, slotFishIssue, validateSlots, visitorCount } from '../src/game/ugc/HomeRule';
import { TICKET_DROP_CHANCE, ticketDrop } from '../src/game/ugc/TicketRule';
import { MAX_BOSS_PER_SLOT, MAX_LEVEL, MAX_SLOTS, STARTER_FISH } from '../src/game/ugc/UgcDefine';
import type { HomeSlot, Rarity, RoomDetail } from '../src/game/ugc/UgcTypes';
import { createInitialProfile, sanitizeProfile } from '../src/server-fake/ugc/ProfileStore';
import { NPC_HOMES } from '../src/server-fake/ugc/npcHomes';

const all = () => true;
const fishData = JSON.parse(readFileSync('public/res/Data/FishData.json', 'utf8')) as FishDataFile;
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
    expect(validateSlots(Array.from({ length: 8 }, () => slot(Forest, [1])), all, all).ok).toBe(true);
    expect(validateSlots(Array.from({ length: 9 }, () => slot(Forest, [1])), all, all).reason).toContain('最多 8');
    expect(validateSlots(Array.from({ length: MAX_SLOTS + 1 }, () => slot(Forest, [1])), all, all).ok).toBe(false);
  });

  it('NPC 家園都符合規則', () => {
    expect(NPC_HOMES.length).toBe(32);
    expect(new Set(NPC_HOMES.map(h => h.name)).size).toBe(NPC_HOMES.length);
    expect(new Set(NPC_HOMES.map(h => h.accountId)).size).toBe(NPC_HOMES.length);
    for (const h of NPC_HOMES) {
      expect(validateSlots(h.slots, all, all), h.name).toEqual({ ok: true });
      const owned: Record<string, number> = {};
      for (const d of h.deco) owned[d.id] = (owned[d.id] ?? 0) + 1;
      expect(validateDecoLayout(h.deco, owned), h.name).toEqual({ ok: true });
      expect(h.deco.length, h.name).toBeGreaterThan(0);
      expect(h.host.title.length, h.name).toBeGreaterThan(0);
      expect(h.host.bio.length, h.name).toBeGreaterThan(0);
      expect(CARD_FISH_TYPES, h.name).toContain(h.host.portrait);
      for (const level of Object.values(h.levels)) expect(level >= 1 && level <= MAX_LEVEL, h.name).toBe(true);
    }
    expect(NPC_HOMES.map((h) => h.roomId)).toEqual(Array.from({ length: 32 }, (_, i) => i + 3));
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
  it('原倍率：說明頁數字；1 ~ 11 與 FishData 賠率相同；只有獵龍騎士沒有', () => {
    for (const t of CARD_FISH_TYPES) expect(CARD_ORIGINAL_ODDS[t] !== undefined, `fish ${t}`).toBe(t !== FishType.DragonSlainKnight);
    for (const t of STARTER_FISH) expect(CARD_ORIGINAL_ODDS[t].odds, `fish ${t}`).toBe(fishData.Fishes.find((d) => d.Data === t)!.Odds);
    expect(CARD_ORIGINAL_ODDS[FishType.AzureDragon]).toEqual({ odds: 40000, max: true });
  });

  it('倍率：原倍率 0.4 → 1.4 倍、前期慢；原倍率 < 10 固定 ×1；蒼龍翅膀跟著蒼龍', () => {
    expect(levelMultiplier(1)).toBeCloseTo(0.4);
    expect(levelMultiplier(MAX_LEVEL)).toBeCloseTo(1.4);
    expect(levelMultiplier(50)).toBeCloseTo(0.748, 3);
    // 前期慢：前一半等級升不到一半的幅度
    expect(levelMultiplier(50) - 0.4).toBeLessThan(0.5);
    for (let l = 1; l < MAX_LEVEL; l++) expect(levelMultiplier(l + 1)).toBeGreaterThan(levelMultiplier(l));
    // 2 ~ 9 倍不動；10 倍（劍齒虎）開始套用
    for (const t of [1, 2, 3, 4, 5, 6, 7]) {
      expect(hasFixedOdds(t)).toBe(true);
      expect(fishMultiplier(t, MAX_LEVEL)).toBe(1);
    }
    expect(hasFixedOdds(FishType.Smilodon)).toBe(false);
    expect(fishMultiplier(FishType.Smilodon_G, 1)).toBeCloseTo(0.4);
    expect(fishMultiplier(FishType.DragonSlainKnight, MAX_LEVEL)).toBeCloseTo(1.4);
    expect(fishMultiplier(FishType.AzureDragonWing, 50)).toBe(levelMultiplier(50));
  });

  it('抽成 5% → 30%、掉券 ×1 → ×2、人氣 ×1 → ×3，都隨等級上升', () => {
    expect(commissionRate(1)).toBeCloseTo(0.05);
    expect(commissionRate(MAX_LEVEL)).toBeCloseTo(0.3);
    expect(commissionRate(50)).toBeCloseTo(0.1371, 4);
    expect(ticketLevelFactor(1)).toBe(1);
    expect(ticketLevelFactor(MAX_LEVEL)).toBeCloseTo(2);
    expect(popularityLevelFactor(1)).toBe(1);
    expect(popularityLevelFactor(MAX_LEVEL)).toBeCloseTo(3);
    for (let l = 1; l < MAX_LEVEL; l++) expect(commissionRate(l + 1)).toBeGreaterThan(commissionRate(l));
  });

  it('升級成本：每 10 級突破要碎片，其他只要金幣；滿級不能再升', () => {
    expect(MAX_LEVEL).toBe(100);
    const breaks = (r: Rarity) => Array.from({ length: 9 }, (_, i) => levelUpCost(r, (i + 1) * 10)!.copies);
    expect(breaks('N')).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(breaks('SSR')).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(levelUpCost('N', 1)).toEqual({ copies: 0, gold: 2_000 });
    expect(levelUpCost('SSR', 99)).toEqual({ copies: 0, gold: 3_960_000 });
    expect(levelUpCost('N', MAX_LEVEL)).toBeNull();
    // 滿級總花費（SPEC-UGC §7 表）
    const total = (r: Rarity) => {
      let copies = 0;
      let gold = 0;
      for (let l = 1; l < MAX_LEVEL; l++) {
        const c = levelUpCost(r, l)!;
        if (l % 10 !== 0) expect(c.copies).toBe(0);
        copies += c.copies;
        gold += c.gold;
      }
      return { copies, gold };
    };
    expect(total('N')).toEqual({ copies: 25, gold: 9_900_000 });
    expect(total('R')).toEqual({ copies: 21, gold: 29_700_000 });
    expect(total('SR')).toEqual({ copies: 18, gold: 79_200_000 });
    expect(total('SSR')).toEqual({ copies: 13, gold: 198_000_000 });
    expect(nextBreakthrough('N', 1)).toEqual({ level: 10, copies: 1 });
    expect(nextBreakthrough('N', 10)).toEqual({ level: 10, copies: 1 });
    expect(nextBreakthrough('N', 41)).toEqual({ level: 50, copies: 3 });
    expect(nextBreakthrough('N', 91)).toBeNull();
  });

  it('突破碎片 / 金幣不足不能升；成功會扣碎片與金幣', () => {
    const p = createInitialProfile(0);
    expect(checkLevelUp(p, 1)).toEqual({ ok: true });
    expect(checkLevelUp(p, 24).reason).toContain('尚未擁有');
    p.money = 10;
    expect(checkLevelUp(p, 1).reason).toContain('金幣不足');
    p.money = 100_000;
    expect(applyLevelUp(p, 1)).toEqual({ ok: true });
    expect(p.fish[1]).toEqual({ level: 2, copies: 0 });
    expect(p.money).toBe(98_000);
    // Lv.10 → 11 是突破
    p.fish[1].level = 10;
    expect(checkLevelUp(p, 1).reason).toContain('碎片不足');
    p.fish[1].copies = 3;
    expect(applyLevelUp(p, 1)).toEqual({ ok: true });
    expect(p.fish[1]).toEqual({ level: 11, copies: 2 });
    expect(p.money).toBe(78_000);
    p.fish[1].level = MAX_LEVEL;
    expect(checkLevelUp(p, 1).reason).toContain('最高等級');
  });

  it('一鍵升級：每張卡升到突破碎片不夠、只算不改；套用後扣碎片與金幣（§7.1）', () => {
    const { Cub, TRex } = FishType;
    const p = createInitialProfile(0);
    p.money = 1_000_000_000;
    p.fish = { [Cub]: { level: 9, copies: 2 }, [TRex]: { level: 9, copies: 1 } };
    // 幼幼龍（N）：突破 10、20 各 1 片 → 停在 Lv.30（下次要 2 片）；帝王暴龍（SSR）：突破 10 用 1 片 → 停在 Lv.20
    const expected = {
      upgrades: [
        { fishType: Cub, from: 9, to: 30, copies: 2, gold: 2_000 * (435 - 36) },
        { fishType: TRex, from: 9, to: 20, copies: 1, gold: 40_000 * (190 - 36) },
      ],
      levels: 32,
      copies: 3,
      gold: 798_000 + 6_160_000,
    };
    expect(planLevelUpAll(p)).toEqual(expected);
    expect(p.fish[Cub]).toEqual({ level: 9, copies: 2 });
    expect(applyLevelUpAll(p)).toEqual(expected);
    expect(p.fish[Cub]).toEqual({ level: 30, copies: 0 });
    expect(p.fish[TRex]).toEqual({ level: 20, copies: 0 });
    expect(p.money).toBe(1_000_000_000 - 6_958_000);
    // 沒有能升的 → 不改資料
    expect(applyLevelUpAll(p)).toMatchObject({ upgrades: [], levels: 0, gold: 0 });
    expect(p.money).toBe(1_000_000_000 - 6_958_000);
  });

  it('一鍵升級：金幣有限時便宜的先（同價 → 等級低的先），預算不超過餘額', () => {
    const { Cub, Scolosaurus, TRex } = FishType;
    const p = createInitialProfile(0);
    p.fish = { [Cub]: { level: 1, copies: 0 }, [TRex]: { level: 1, copies: 0 } };
    p.money = 100_000_000;
    // 預算 10,000：2k → 4k 比帝王暴龍的 40k 便宜，下一級 6k 超過剩下的 4k
    expect(planLevelUpAll(p, 10_000)).toMatchObject({ upgrades: [{ fishType: Cub, from: 1, to: 3 }], levels: 2, gold: 6_000 });
    // 餘額比預算少 → 以餘額為準
    p.money = 5_000;
    expect(planLevelUpAll(p, 1e12)).toMatchObject({ upgrades: [{ fishType: Cub, to: 2 }], gold: 2_000 });
    expect(planLevelUpAll(p, Number.NaN).levels).toBe(0);
    expect(planLevelUpAll(p, -1).levels).toBe(0);
    // 同價：N Lv.3（6k）vs R Lv.1（6k）→ 等級低的先
    p.fish = { [Cub]: { level: 3, copies: 0 }, [Scolosaurus]: { level: 1, copies: 0 } };
    p.money = 6_000;
    expect(planLevelUpAll(p).upgrades).toEqual([{ fishType: Scolosaurus, from: 1, to: 2, copies: 0, gold: 6_000 }]);
  });
});

describe('抽卡', () => {
  it('卡池：所有魚卡、初始場景以外的場景、所有裝飾物；每個稀有度都有東西', () => {
    expect(GACHA_POOL.filter((i) => i.kind === 'fish').map((i) => i.id)).toEqual([...CARD_FISH_TYPES]);
    expect(GACHA_POOL.some((i) => i.kind === 'scene' && i.id === Forest)).toBe(false);
    expect(GACHA_POOL.filter((i) => i.kind === 'scene')).toHaveLength(9);
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
  it('打死怪物 10% 掉 1 張；等級加成只在別人的家園', () => {
    expect(TICKET_DROP_CHANCE).toBe(0.1);
    expect(ticketDrop(false, MAX_LEVEL, false)).toEqual({ chance: 0.1, count: 1 });
    expect(ticketDrop(false, MAX_LEVEL, true).chance).toBeCloseTo(0.1 * 2);
    expect(ticketDrop(false, 50, true).chance).toBeCloseTo(0.1 * ticketLevelFactor(50));
    expect(ticketDrop(false, 1, true).chance).toBeCloseTo(0.1);
  });

  it('給獎但魚沒死（Boss 小獎等）不掉', () => {
    expect(ticketDrop(true, 1, false)).toEqual({ chance: 0, count: 0 });
    expect(ticketDrop(true, MAX_LEVEL, true)).toEqual({ chance: 0, count: 0 });
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
    raw.fish[24] = { level: 999, copies: 4 };
    raw.home.slots = [{ sceneType: Forest, fishTypes: [26] }]; // 風神翼龍不能放森林，而且沒有這張卡
    raw.home.deco = [{ id: 'cube_white', x: 999, y: 0, rot: 0 }];
    const p = sanitizeProfile(raw, 5000)!;
    expect(p.tickets).toBe(77);
    expect(p.fish[24]).toEqual({ level: MAX_LEVEL, copies: 4 });
    expect(p.home.slots).toEqual([{ sceneType: Forest, fishTypes: [...STARTER_FISH] }]);
    expect(p.home.deco).toEqual([]);
    // 舊存檔沒有開張時間 → 當作現在建立；未來時間夾回現在（§2.4）
    expect(p.createdAt).toBe(0);
    const legacy = { ...raw };
    delete legacy.createdAt;
    expect(sanitizeProfile(legacy, 5000)!.createdAt).toBe(5000);
    expect(sanitizeProfile({ ...raw, createdAt: 1234 }, 5000)!.createdAt).toBe(1234);
    expect(sanitizeProfile({ ...raw, createdAt: 99_999 }, 5000)!.createdAt).toBe(5000);
  });

  it('家園排行：公有地不排；人氣高 → 開張新 → 房號小；新星 = 3 天內（§2.4）', () => {
    const day = 86_400_000;
    const now = 100 * day;
    const room = (roomId: number, popularity: number, daysAgo: number, kind: 'home' | 'public' = 'home') =>
      ({ roomId, kind, popularity, createdAt: now - daysAgo * day }) as RoomDetail;
    const rooms = [room(1, 0, 0, 'public'), room(2, 30, 1), room(3, 50, 10), room(4, 30, 0.5), room(5, 30, 0.5), room(6, 10, 3)];
    expect(rankHomes(rooms, now)).toEqual({ hot: [3, 4, 5, 2, 6], rising: [4, 5, 2] });
    expect(homeAgeDays(now - 0.4 * day, now)).toBe(0);
    expect(homeAgeDays(now - 2.9 * day, now)).toBe(2);
  });
});
