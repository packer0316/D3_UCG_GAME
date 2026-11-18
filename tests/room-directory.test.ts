import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roomMetrics } from '../src/features/ugc/ui/RoomMetrics';
import { homePopularity, homePopularityBreakdown, visitorCount } from '../src/game/ugc/HomeRule';
import { NPC_PLAYER_IDS, PLAYER_AVATAR_ATLAS } from '../src/game/ugc/PlayerAvatars';
import { STARTER_FISH } from '../src/game/ugc/UgcDefine';
import type { RoomDetail } from '../src/game/ugc/UgcTypes';
import { NPC_HOMES } from '../src/server-fake/ugc/npcHomes';

function home(overrides: Partial<RoomDetail> = {}): RoomDetail {
  const room: RoomDetail = {
    roomId: 2, kind: 'home', name: '我的家園', ownerId: 1, ownerName: 'Player', isMine: true,
    slots: [{ sceneType: 0, fishTypes: [...STARTER_FISH] }], levels: {}, deco: [],
    popularity: 0, visitors: 0, slotSeconds: 150, createdAt: 0, ...overrides,
  };
  room.popularity = homePopularity(room.slots, room.deco.length, type => room.levels[type] ?? 1);
  room.visitors = Math.round(visitorCount(room.popularity) * 10) / 10;
  return room;
}

describe('玩家頭貼與身分', () => {
  it('32 位屋主使用唯一 ID、唯一圖格，房號與帳號保持穩定', () => {
    expect(new Set(NPC_PLAYER_IDS).size).toBe(32);
    expect(NPC_HOMES.map(npc => npc.name)).toEqual(NPC_PLAYER_IDS);
    expect(NPC_HOMES.map(npc => npc.host.avatarIndex)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect(NPC_HOMES.map(npc => npc.roomId)).toEqual(Array.from({ length: 32 }, (_, i) => i + 3));
    expect(NPC_HOMES.map(npc => npc.accountId)).toEqual(Array.from({ length: 32 }, (_, i) => i + 100));
  });

  it('專案包含可讀取的 PNG 合圖，8 × 4 格保持正方形比例', () => {
    const bytes = readFileSync(`public/${PLAYER_AVATAR_ATLAS.file}`);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    expect(width / PLAYER_AVATAR_ATLAS.columns).toBe(height / PLAYER_AVATAR_ATLAS.rows);
    expect(width / PLAYER_AVATAR_ATLAS.columns).toBeGreaterThanOrEqual(200);
    expect(PLAYER_AVATAR_ATLAS.columns * PLAYER_AVATAR_ATLAS.rows).toBe(NPC_PLAYER_IDS.length);
  });
});

describe('房間數值說明', () => {
  it('初始家園 = 11 分龍種 + 5 分場景 + 0 分裝飾；訪客公式有完整單位', () => {
    const room = home();
    expect(homePopularityBreakdown(room.slots, 0, () => 1)).toMatchObject({ dragonScore: 11, sceneScore: 5, decorationScore: 0, total: 16 });
    const [pop, fish, level, visitors] = roomMetrics(room);
    expect([pop.value, fish.value, level.value, visitors.value]).toEqual(['16 分', '11 種', 'Lv.1', '0.4 人']);
    expect(visitors.explanation.lines[0]).toBe('16 分 ÷（40 分／人）= 0.4 人。');
    expect(pop.explanation.lines).toContain('場景：1 種 × 5 分／種 = 5 分。');
    expect(pop.explanation.lines).toContain('裝飾：0 件 × 1 分／件，上限 30 分 → 0 分。');
    expect(pop.explanation.note).toContain('無單位');
  });

  it('跨場景重複龍種只算一次、裝飾有上限，使用相同的伺服器人氣規則', () => {
    const slots = [{ sceneType: 0, fishTypes: [1, 12, 23] }, { sceneType: 1, fishTypes: [12] }];
    expect(homePopularityBreakdown(slots, 35, () => 100)).toEqual({ fishCount: 3, sceneCount: 2, dragonScore: 48, sceneScore: 10, decorationScore: 30, total: 88 });
    expect(homePopularity(slots, 35, () => 100)).toBe(88);
  });

  it('最高等級不包含收藏中尚未放出的龍，人氣保留一位小數', () => {
    const room = home({ slots: [{ sceneType: 0, fishTypes: [1, 2] }, { sceneType: 0, fishTypes: [1] }], levels: { 1: 15, 2: 1, 27: 100 } });
    const [pop, fish, level] = roomMetrics(room);
    expect(pop.value).toBe(`${room.popularity} 分`);
    expect(fish.value).toBe('2 種');
    expect(level.value).toBe('Lv.15');
    expect(fish.explanation.lines).toContain('2 段輪替，共配置 3 筆龍種。');
  });

  it('訪客超過上限或低於下限，提示實際採用的值', () => {
    const high = home({ slots: [{ sceneType: 0, fishTypes: [23, 24, 25, 15, 16, 17] }], levels: { 23: 100, 24: 100, 25: 100, 15: 100, 16: 100, 17: 100 } });
    expect(roomMetrics(high)[3].value).toBe('3 人');
    expect(roomMetrics(high)[3].explanation.lines.join('')).toContain('超過上限，採用 3 人');
    const low = home({ slots: [{ sceneType: 0, fishTypes: [1] }] });
    expect(roomMetrics(low)[3].value).toBe('0.2 人');
    expect(roomMetrics(low)[3].explanation.lines.join('')).toContain('低於下限，採用 0.2 人');
  });

  it('公有地顯示場景、秒數與入場規則，輪替公式使用秒／段', () => {
    const metrics = roomMetrics(home({ kind: 'public' }));
    expect(metrics.map(metric => metric.value)).toEqual(['1 種', '11 種', '150 秒', '自由進入']);
    expect(metrics[2].explanation.lines[0]).toBe('一輪 1 段 × 150 秒／段 = 150 秒。');
  });
});
