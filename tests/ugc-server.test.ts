/**
 * UGC 假 server（SPEC-UGC §2–§9）：房間 / 輪替 / 允許魚種 / 倍率 / 抽成 / 掉券 / 抽卡 / 培養 / 家園 / 存檔
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ClientToServer, NetMessage, ScriptIdData, ServerToClient } from '../src/net/protocol';
import type { Transport } from '../src/net/Transport';
import '../src/game/ugc/UgcProtocol';
import { UgcDebugTool } from '../src/game/ugc/UgcProtocol';
import { SCENE_LIST, SceneType, isFishAllowedInScene } from '../src/game/define/SceneDefine';
import type { FishDataFile, GroupDataMap } from '../src/game/path/PathTypes';
import { expandCards } from '../src/game/ugc/CardDefine';
import { commissionRate, levelMultiplier } from '../src/game/ugc/CultivateRule';
import { incomePerSecond } from '../src/game/ugc/HomeRule';
import { INITIAL_MONEY, MY_HOME_ROOM_ID, OFFLINE_CAP_MS, PROFILE_STORAGE_KEY, PUBLIC_ROOM_ID, SLOT_SECONDS, STARTER_FISH } from '../src/game/ugc/UgcDefine';
import type { PlayerProfile } from '../src/game/ugc/UgcTypes';
import { FakeServer } from '../src/server-fake/FakeServer';
import { MemoryStorage, createInitialProfile } from '../src/server-fake/ugc/ProfileStore';
import { NPC_HOMES } from '../src/server-fake/ugc/npcHomes';

const RES = 'public/res/';
const fishData = JSON.parse(readFileSync(RES + 'Data/FishData.json', 'utf8')) as FishDataFile;
const groups = JSON.parse(readFileSync(RES + 'Data/GroupData.json', 'utf8')) as GroupDataMap;
const { Forest, Desert } = SceneType;

interface Harness {
  server: FakeServer;
  storage: MemoryStorage;
  sent: NetMessage[];
  req<K extends keyof ClientToServer>(cmd: K, data: ClientToServer[K]): void;
  /** 取出並清空某種訊息 */
  take<K extends keyof ServerToClient>(cmd: K): ServerToClient[K][];
  last<K extends keyof ServerToClient>(cmd: K): ServerToClient[K] | undefined;
  advance(ms: number, step?: number): void;
  profile: PlayerProfile;
}

function boot(opts: { storage?: MemoryStorage; wall?: number; seed?: number; profile?: (p: PlayerProfile) => void } = {}): Harness {
  const storage = opts.storage ?? new MemoryStorage();
  let wall = opts.wall ?? 1_000_000_000;
  if (opts.profile) {
    const p = createInitialProfile(wall);
    opts.profile(p);
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p));
  }
  let now = 0;
  const sent: NetMessage[] = [];
  let toServer: (m: NetMessage) => void = () => undefined;
  const transport: Transport = {
    send: (m) => sent.push(structuredClone(m)),
    onMessage: (cb) => (toServer = cb),
    close: () => undefined,
  };
  const server = new FakeServer(transport, { groups, fishData }, { seed: opts.seed ?? 1, storage, wallClock: () => wall, clock: () => now, autoTick: false });
  const h: Harness = {
    server,
    storage,
    sent,
    req: (cmd, data) => toServer({ cmd, data }),
    take: (cmd) => {
      const out = sent.filter((m) => m.cmd === cmd).map((m) => m.data);
      for (let i = sent.length - 1; i >= 0; i--) if (sent[i].cmd === cmd) sent.splice(i, 1);
      return out as never;
    },
    last: (cmd) => [...sent].reverse().find((m) => m.cmd === cmd)?.data as never,
    advance: (ms, step = 50) => {
      for (let t = 0; t < ms; t += step) {
        now += step;
        wall += step;
        server.tickOnce();
      }
    },
    get profile() {
      return server.profile.profile;
    },
  };
  return h;
}

/** 登入並同步魚群 */
function login(h: Harness): void {
  h.req('U2G_LOGIN_REQ', {});
  h.req('U2G_SYNC_SCRIPT_REQ', {});
}

function enter(h: Harness, roomId: number): void {
  h.req('U2G_ENTER_ROOM_REQ', { roomId });
  h.req('U2G_SYNC_SCRIPT_REQ', {});
}

/** 場上目前活著的魚（server 視角） */
function liveFish(h: Harness): { id: ScriptIdData; fishType: number }[] {
  const out: { id: ScriptIdData; fishType: number }[] = [];
  for (const [groupIndex, g] of h.server.script.activeGroups) {
    g.entries.forEach((_, fishIndex) => {
      const id = { groupIndex, fishIndex };
      const f = h.server.script.getFish(id);
      if (f) out.push({ id, fishType: f.fishType });
    });
  }
  return out;
}

/** 場上所有（還沒被標成死亡的）魚種，含還沒出場的 */
function scheduledTypes(h: Harness): Set<number> {
  const types = new Set<number>();
  for (const g of h.server.script.activeGroups.values()) g.entries.forEach((e, i) => !g.dead.has(i) && types.add(e.fish + 1));
  return types;
}

let bulletId = 0;
/** 開一砲並命中指定的魚；回傳這次的擊殺通知 */
function shootAt(h: Harness, target: ScriptIdData, bet = 500) {
  const id = ++bulletId;
  h.req('U2G_SHOOT_REQ', { bulletId: id, bulletType: 0, bet, angle: 0, scriptIdDataVec: [] });
  h.req('U2G_HIT_REQ', { bulletId: id, scriptIdDataVec: [target] });
  return h.take('G2U_KILL_FLOATODDS_FISH_NOTIFY');
}

describe('房間', () => {
  it('登入：送資產、房間內容、房間資料；公有地包含完整場景輪替及允許魚種', () => {
    const h = boot();
    login(h);
    const cmds = h.sent.map((m) => m.cmd);
    expect(cmds.slice(0, 4)).toEqual(['G2U_PROFILE_NOTIFY', 'G2U_ROOM_INFO_NOTIFY', 'G2U_ROOM_DATA_NOTIFY', 'G2U_HOME_INCOME_NOTIFY']);
    const { room } = h.last('G2U_ROOM_INFO_NOTIFY')!;
    expect(room).toMatchObject({ roomId: PUBLIC_ROOM_ID, kind: 'public', isMine: false, name: '1號房 公有地' });
    expect(room.slots.map(s => s.sceneType)).toEqual(SCENE_LIST);
    for (const s of room.slots) for (const t of s.fishTypes) expect(isFishAllowedInScene(t, s.sceneType)).toBe(true);
    const data = h.last('G2U_ROOM_DATA_NOTIFY')!;
    expect(data.roomName).toBe('1號房 公有地');
    expect(data.sceneType).toBe(room.slots[room.slotIndex].sceneType);
    expect(data.seats[0]).toMatchObject({ money: INITIAL_MONEY, name: 'Player' });
    expect(h.last('G2U_SYNC_SCRIPT_ACK')!.list.length).toBeGreaterThan(0);
  });

  it('房間列表：1 公有地、2 我的家園、3–10 NPC 家園', () => {
    const h = boot();
    login(h);
    h.req('U2G_ROOM_LIST_REQ', {});
    const { rooms, currentRoomId } = h.last('G2U_ROOM_LIST_ACK')!;
    expect(currentRoomId).toBe(1);
    expect(rooms.map((r) => r.roomId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rooms[1]).toMatchObject({ kind: 'home', isMine: true, name: '2號房 我的家園' });
    expect(rooms[1].slots).toEqual([{ sceneType: Forest, fishTypes: [...STARTER_FISH] }]);
    expect(rooms[2]).toMatchObject({ kind: 'home', isMine: false, ownerName: '阿明', name: '3號房 阿明的家園' });
    // 進度越後面人氣越高
    expect(rooms[9].popularity).toBeGreaterThan(rooms[2].popularity);
  });

  it('換房：飛行中的子彈退款、清掉群組、送新房間資料；不存在的房間失敗', () => {
    const h = boot();
    login(h);
    h.req('U2G_SHOOT_REQ', { bulletId: 9001, bulletType: 0, bet: 500, angle: 0, scriptIdDataVec: [] });
    expect(h.profile.money).toBe(INITIAL_MONEY - 500);
    h.sent.length = 0;
    h.req('U2G_ENTER_ROOM_REQ', { roomId: 3 });
    expect(h.take('G2U_ENTER_ROOM_ACK')).toEqual([{ ok: true, roomId: 3 }]);
    expect(h.profile.money).toBe(INITIAL_MONEY);
    expect(h.last('G2U_ROOM_DATA_NOTIFY')).toMatchObject({ roomName: '3號房 阿明的家園', sceneType: Forest });
    expect(h.last('G2U_ROOM_DATA_NOTIFY')!.seats[0]!.money).toBe(INITIAL_MONEY);
    expect(h.server.script.activeGroups.size).toBe(0);
    h.req('U2G_SYNC_SCRIPT_REQ', {});
    expect(h.server.script.activeGroups.size).toBeGreaterThan(0);

    h.req('U2G_ENTER_ROOM_REQ', { roomId: 99 });
    expect(h.take('G2U_ENTER_ROOM_ACK')[0]).toMatchObject({ ok: false, roomId: 99 });
    expect(h.server.room.current.roomId).toBe(3);
  });
});

describe('允許魚種（家園只出屋主放的龍）', () => {
  it('我的家園（初始）：只會出 1–11 號', () => {
    const h = boot();
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    h.advance(120_000, 500);
    const types = scheduledTypes(h);
    expect(types.size).toBeGreaterThan(3);
    for (const t of types) expect(STARTER_FISH, `type ${t}`).toContain(t);
  });

  it('只放幼幼龍：混合群組裡其他魚出場即死亡（deadFishes），server 不接受命中', () => {
    const h = boot();
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    h.req('U2G_HOME_SAVE_REQ', { slots: [{ sceneType: Forest, fishTypes: [1] }] });
    expect(h.last('G2U_HOME_SAVE_ACK')).toEqual({ ok: true });
    h.sent.length = 0;
    h.req('U2G_SYNC_SCRIPT_REQ', {});
    h.advance(60_000, 500);
    expect([...scheduledTypes(h)]).toEqual([1]);
    // 群組 1–5 是 幼幼龍 + 蛋蛋龍 + 蛋殼龍 混合：同步資料帶 deadFishes
    const sync = [...h.take('G2U_SYNC_SCRIPT_ACK'), ...h.take('G2U_ADD_GROUP_SYNC_NOTIFY')].flatMap((s) => s.list);
    expect(sync.length).toBeGreaterThan(0);
    expect(sync.every((g) => g.deadFishes.length > 0)).toBe(true);
    for (const f of liveFish(h)) expect(f.fishType).toBe(1);
  });

  it('NPC 家園：每個場景格只出該格放的龍（含蒼龍翅膀）', () => {
    for (const npc of NPC_HOMES) {
      // 每間都從第一格的開頭進房（90 秒內不會換格）
      const h = boot({ wall: 0 });
      login(h);
      enter(h, npc.roomId);
      const slot = h.server.room.current.slots[h.server.room.slotIndex];
      const allowed = expandCards(slot.fishTypes);
      h.advance(90_000, 500);
      const types = scheduledTypes(h);
      expect(types.size, npc.name).toBeGreaterThan(0);
      for (const t of types) expect(allowed.has(t), `${npc.name} type ${t}`).toBe(true);
    }
  });

  it('家園的 Boss 出場頻率較高：放了 Boss 的場景格 60 秒內會出 Boss', () => {
    const h = boot({ wall: 0 });
    login(h);
    const warden = NPC_HOMES.find((n) => n.name === '典獄長')!;
    enter(h, warden.roomId);
    h.advance(60_000, 500);
    const kinds = [...h.server.script.activeGroups.values()].map((g) => g.kind);
    expect(kinds).toContain('boss');
  });
});

describe('場景輪替', () => {
  it('公有地：每 150 秒換一格，場景不同 → 轉場清場', () => {
    const h = boot({ wall: 0 });
    login(h);
    const room = h.server.room;
    expect(room.slotIndex).toBe(0);
    const first = room.sceneType;
    h.sent.length = 0;
    h.advance(SLOT_SECONDS * 1000 + 100, 100);
    expect(room.slotIndex).toBe(1);
    expect(h.take('G2U_CHANGE_SCENE_NOTIFY')).toEqual([{ type: room.current.slots[1].sceneType }]);
    expect(room.sceneType).not.toBe(first);
    expect(h.take('G2U_ROOM_SLOT_NOTIFY')[0]).toMatchObject({ slotIndex: 1 });
  });

  it('進房時依時鐘決定第幾格（短時間內重進同一間看到同一個場景）', () => {
    const wall = SLOT_SECONDS * 1000 * 2 + 30_000; // 第 3 格、已過 30 秒
    const h = boot({ wall });
    login(h);
    expect(h.server.room.slotIndex).toBe(2);
    expect(h.last('G2U_ROOM_INFO_NOTIFY')!.room.slotRemainMs).toBe(120_000);
    enter(h, 3);
    enter(h, PUBLIC_ROOM_ID);
    expect(h.server.room.slotIndex).toBe(2);
  });

  it('相鄰兩格同一個場景：不轉場，只換放出的魚；只有一格不輪替', () => {
    const h = boot({ wall: 0 });
    login(h);
    const eggs = NPC_HOMES.find((n) => n.name === '蛋蛋收藏家')!;
    enter(h, eggs.roomId);
    expect(h.server.room.slotIndex).toBe(0);
    h.sent.length = 0;
    h.advance(SLOT_SECONDS * 1000 + 100, 100);
    expect(h.server.room.slotIndex).toBe(1);
    expect(h.take('G2U_CHANGE_SCENE_NOTIFY')).toEqual([]);
    expect(h.take('G2U_ROOM_SLOT_NOTIFY')).toHaveLength(1);
    expect(h.server.room.isAllowed(2)).toBe(true);
    expect(h.server.room.isAllowed(1)).toBe(false);

    enter(h, 3); // 阿明：只有一格
    h.sent.length = 0;
    h.advance(SLOT_SECONDS * 1000 * 2, 500);
    expect(h.take('G2U_ROOM_SLOT_NOTIFY')).toEqual([]);
  });

  it('debug 換場景：輪替表有 → 跳到那一格；沒有 → 臨時換', () => {
    const h = boot({ wall: 0 });
    login(h);
    const room = h.server.room;
    expect(room.changeScene(SceneType.ZB_Prison)).toBe(true);
    expect(room.current.slots[room.slotIndex].sceneType).toBe(SceneType.ZB_Prison);
    expect(room.changeScene(SceneType.ZB_Prison)).toBe(false);
    enter(h, 3);
    expect(room.changeScene(Desert)).toBe(true);
    expect(room.sceneType).toBe(Desert);
    expect(room.slotIndex).toBe(0);
  });
});

describe('倍率 / 抽成 / 掉券', () => {
  it('家園：魚卡等級 → 賠率倍率（原倍率 ×0.4 ~ ×1.4；原倍率 < 10 固定）', () => {
    // 翼龍（100 倍）Lv.100、黃金劍龍（60 倍）Lv.1、幼幼龍（2 倍）Lv.100
    const h = boot({
      wall: 0,
      profile: (p) => {
        p.fish[11].level = 100;
        p.fish[1].level = 100;
      },
    });
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    h.server.rtp.cheatMode = true;
    const kill = (fishType: number) => {
      for (let i = 0; i < 300; i++) {
        const f = liveFish(h).find((x) => x.fishType === fishType);
        if (f) return shootAt(h, f.id, 500)[0];
        h.advance(1000, 500);
      }
      throw new Error(`fish ${fishType} never spawned`);
    };
    const ptero = kill(11);
    expect(ptero.floatedOdds).toBeCloseTo(100 * levelMultiplier(100));
    expect(ptero.money).toBe(500 * 140);
    const steg = kill(10);
    expect(steg.floatedOdds).toBeCloseTo(60 * 0.4);
    expect(steg.money).toBe(500 * 24);
    const cub = kill(1);
    expect(cub.floatedOdds).toBe(2);
    expect(cub.money).toBe(500 * 2);
  });

  it('蛋蛋收藏家 Lv.100：倍率固定（原倍率 < 10），抽成 30%', () => {
    const h = boot({ wall: 0 });
    login(h);
    enter(h, NPC_HOMES.find((n) => n.name === '蛋蛋收藏家')!.roomId);
    h.server.rtp.cheatMode = true;
    const cub = liveFish(h).find((f) => f.fishType === 1)!;
    expect(cub).toBeDefined();
    const [kill] = shootAt(h, cub.id, 500);
    expect(kill.floatedOdds).toBe(2);
    expect(kill.money).toBe(1000);
    expect(h.server.room.visitCommission).toBeCloseTo(500 * commissionRate(100));
    expect(commissionRate(100)).toBeCloseTo(0.3);
  });

  it('公有地倍率一律 ×1', () => {
    const h = boot({ wall: 0 });
    login(h);
    h.server.rtp.cheatMode = true;
    const f = liveFish(h).find((x) => x.fishType <= 8)!;
    const [kill] = shootAt(h, f.id, 100);
    const odds = fishData.Fishes.find((d) => d.Data === f.fishType)!.Odds;
    expect(kill.money).toBe(100 * odds);
  });

  it('別人的家園：命中的子彈抽成給屋主，RTP = 目標 − 抽成率；自己的家園 / 公有地沒有抽成', () => {
    const rtpIn = (roomId: number) => {
      const h = boot({ wall: 0, seed: 3 });
      login(h);
      enter(h, roomId);
      h.server.rtp.resetStats();
      const start = h.profile.money;
      let shots = 0;
      for (let round = 0; round < 400; round++) {
        const targets = liveFish(h).filter((f) => f.fishType <= 8);
        for (const f of targets) {
          shootAt(h, f.id, 100);
          shots++;
        }
        h.advance(1000, 500);
      }
      return { h, rtp: (h.profile.money - start + shots * 100) / (shots * 100), shots };
    };

    // 阿明：全 Lv.1 → 抽成 5%
    const npc = rtpIn(3);
    expect(npc.shots).toBeGreaterThan(2000);
    expect(npc.h.server.room.visitCommission).toBeCloseTo(npc.shots * 100 * commissionRate(1), 3);
    expect(npc.h.last('G2U_VISIT_COMMISSION_NOTIFY')!.total).toBeGreaterThan(0);
    expect(npc.rtp).toBeGreaterThan(1.05 - 0.06);
    expect(npc.rtp).toBeLessThan(1.05 + 0.06);

    const mine = rtpIn(MY_HOME_ROOM_ID);
    expect(mine.h.server.room.visitCommission).toBe(0);
    expect(mine.h.last('G2U_VISIT_COMMISSION_NOTIFY')).toBeUndefined();
    expect(mine.rtp).toBeGreaterThan(1.1 - 0.06);
    expect(mine.rtp).toBeLessThan(1.1 + 0.06);
  });

  it('掉券：打死怪物 10% 掉 1 張；公有地 / 別人的家園會掉，自己的家園不掉；通知排在擊殺通知之前', () => {
    const tickets = (roomId: number) => {
      const h = boot({ wall: 0, seed: 5 });
      login(h);
      enter(h, roomId);
      h.server.rtp.cheatMode = true; // 每發都中獎 → 每發都擲券
      const before = h.profile.tickets;
      let order = true;
      let kills = 0;
      for (let round = 0; round < 300; round++) {
        for (const f of liveFish(h).filter((x) => x.fishType <= 11)) {
          const id = ++bulletId;
          h.req('U2G_SHOOT_REQ', { bulletId: id, bulletType: 0, bet: 5000, angle: 0, scriptIdDataVec: [] });
          h.sent.length = 0;
          h.req('U2G_HIT_REQ', { bulletId: id, scriptIdDataVec: [f.id] });
          const cmds = h.sent.map((m) => m.cmd);
          const kill = h.sent.find((m) => m.cmd === 'G2U_KILL_FLOATODDS_FISH_NOTIFY')?.data as { unDead: boolean } | undefined;
          if (kill && !kill.unDead) kills++;
          const drop = cmds.indexOf('G2U_TICKET_DROP_NOTIFY');
          if (drop >= 0 && drop > cmds.indexOf('G2U_KILL_FLOATODDS_FISH_NOTIFY')) order = false;
          if (drop >= 0) expect(h.sent[drop].data).toMatchObject({ scriptIdData: f.id, count: 1, tickets: h.profile.tickets });
        }
        h.advance(1000, 500);
      }
      return { gained: h.profile.tickets - before, kills, order, stats: h.profile.stats.ticketsEarned };
    };
    const pub = tickets(PUBLIC_ROOM_ID);
    expect(pub.kills).toBeGreaterThan(300);
    // 公有地固定 10%（不看押注）
    expect(pub.gained / pub.kills).toBeGreaterThan(0.07);
    expect(pub.gained / pub.kills).toBeLessThan(0.13);
    expect(pub.order).toBe(true);
    expect(pub.stats).toBe(pub.gained);
    expect(tickets(3).gained).toBeGreaterThan(5);
    expect(tickets(MY_HOME_ROOM_ID).gained).toBe(0);
  });
});

describe('抽卡 / 培養', () => {
  it('十連：扣 10 張券、入帳、送結果與資產；券不夠失敗', () => {
    const h = boot();
    login(h);
    h.req('U2G_GACHA_DRAW_REQ', { times: 10 });
    const ack = h.last('G2U_GACHA_DRAW_ACK')!;
    expect(ack.ok).toBe(true);
    expect(ack.results).toHaveLength(10);
    expect(ack.results.some((r) => r.rarity !== 'N')).toBe(true);
    expect(h.profile.tickets).toBe(0);
    expect(h.profile.stats.draws).toBe(10);
    expect(h.last('G2U_PROFILE_NOTIFY')!.profile.tickets).toBe(0);
    for (const r of ack.results) {
      if (r.kind === 'fish') expect(h.profile.fish[r.id as number]).toBeDefined();
      if (r.kind === 'scene') expect(h.profile.scenes).toContain(r.id);
      if (r.kind === 'deco') expect(h.profile.decos[r.id as string]).toBe(r.count);
    }
    h.req('U2G_GACHA_DRAW_REQ', { times: 1 });
    expect(h.last('G2U_GACHA_DRAW_ACK')).toMatchObject({ ok: false, results: [] });
    h.req('U2G_GACHA_DRAW_REQ', { times: 3 });
    expect(h.last('G2U_GACHA_DRAW_ACK')!.ok).toBe(false);
  });

  it('升級：扣碎片與金幣、餘額同步；人在自己的家園時倍率立即生效；突破缺碎片失敗', () => {
    const h = boot({
      wall: 0,
      profile: (p) => {
        p.fish[9].copies = 5;
        p.fish[10].level = 10;
      },
    });
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    expect(h.server.room.fishMultiplier(9)).toBeCloseTo(0.4);
    h.sent.length = 0;
    h.req('U2G_CARD_LEVELUP_REQ', { fishType: 9 });
    expect(h.last('G2U_CARD_LEVELUP_ACK')).toEqual({ ok: true, fishType: 9, level: 2 });
    expect(h.profile.fish[9]).toEqual({ level: 2, copies: 5 });
    expect(h.profile.money).toBe(INITIAL_MONEY - 2_000);
    expect(h.last('G2U_SEAT_MONEY_NOTIFY')).toEqual({ seat: 0, seatMoney: INITIAL_MONEY - 2_000 });
    expect(h.last('G2U_ROOM_INFO_NOTIFY')!.room.levels[9]).toBe(2);
    expect(h.server.room.fishLevel(9)).toBe(2);
    expect(h.server.room.fishMultiplier(9)).toBeCloseTo(levelMultiplier(2));

    // 黃金劍龍 Lv.10 → 11 是突破，沒有碎片
    h.req('U2G_CARD_LEVELUP_REQ', { fishType: 10 });
    expect(h.last('G2U_CARD_LEVELUP_ACK')).toMatchObject({ ok: false, fishType: 10 });
    h.req('U2G_CARD_LEVELUP_REQ', { fishType: 24 });
    expect(h.last('G2U_CARD_LEVELUP_ACK')).toMatchObject({ ok: false, fishType: 24 });
    // 公有地一律 ×1
    enter(h, PUBLIC_ROOM_ID);
    expect(h.server.room.fishMultiplier(9)).toBe(1);
  });

  it('一鍵升級：以 maxGold 為預算一次升完、餘額同步、房間等級更新；沒有可升的回失敗（§7.1）', () => {
    // 只有幼幼龍能突破（碎片 3）：其他卡停在 Lv.10 沒碎片
    const h = boot({
      wall: 0,
      profile: (p) => {
        for (const t of STARTER_FISH) p.fish[t].level = 10;
        p.fish[1].copies = 3;
      },
    });
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    h.sent.length = 0;
    // 預算 100,000：突破 10→11（20k，1 片）+ 22k + 24k + 26k = 92k，下一級 28k 超過剩下的 8k
    h.req('U2G_CARD_LEVELUP_ALL_REQ', { maxGold: 100_000 });
    expect(h.take('G2U_CARD_LEVELUP_ALL_ACK')).toEqual([
      { ok: true, upgrades: [{ fishType: 1, from: 10, to: 14, copies: 1, gold: 92_000 }], levels: 4, copies: 1, gold: 92_000 },
    ]);
    expect(h.profile.fish[1]).toEqual({ level: 14, copies: 2 });
    expect(h.profile.money).toBe(INITIAL_MONEY - 92_000);
    expect(h.last('G2U_SEAT_MONEY_NOTIFY')).toEqual({ seat: 0, seatMoney: INITIAL_MONEY - 92_000 });
    expect(h.last('G2U_ROOM_INFO_NOTIFY')!.room.levels[1]).toBe(14);
    expect(h.last('G2U_PROFILE_NOTIFY')!.profile.fish[1]).toEqual({ level: 14, copies: 2 });

    // 預算夠：一路升到 Lv.30（突破 20 用 1 片；Lv.30 → 31 要 2 片，只剩 1 片）
    h.req('U2G_CARD_LEVELUP_ALL_REQ', { maxGold: INITIAL_MONEY });
    expect(h.take('G2U_CARD_LEVELUP_ALL_ACK')[0]).toMatchObject({ ok: true, levels: 16, copies: 1, gold: 2_000 * (435 - 91) });
    expect(h.profile.fish[1]).toEqual({ level: 30, copies: 1 });

    h.sent.length = 0;
    h.req('U2G_CARD_LEVELUP_ALL_REQ', { maxGold: INITIAL_MONEY });
    expect(h.last('G2U_CARD_LEVELUP_ALL_ACK')).toMatchObject({ ok: false, reason: '沒有可升級的魚卡', levels: 0 });
    expect(h.last('G2U_PROFILE_NOTIFY')).toBeUndefined();
    expect(h.profile.money).toBe(INITIAL_MONEY - 92_000 - 688_000);
  });
});

describe('家園設定 / 收益', () => {
  it('8 格輪替可儲存與重新登入；第 9 格拒絕且保留原配置', () => {
    const h = boot();
    login(h);
    const slots = Array.from({ length: 8 }, (_, i) => ({ sceneType: Forest, fishTypes: [i + 1] }));
    h.req('U2G_HOME_SAVE_REQ', { slots });
    expect(h.last('G2U_HOME_SAVE_ACK')).toEqual({ ok: true });
    expect(h.profile.home.slots).toEqual(slots);
    h.req('U2G_HOME_SAVE_REQ', { slots: [...slots, { sceneType: Forest, fishTypes: [9] }] });
    expect(h.last('G2U_HOME_SAVE_ACK')).toEqual({ ok: false, reason: '最多 8 個場景' });
    expect(h.profile.home.slots).toEqual(slots);
    h.server.profile.flush();
    const restored = boot({ storage: h.storage });
    login(restored);
    expect(restored.profile.home.slots).toEqual(slots);
    enter(restored, MY_HOME_ROOM_ID);
    expect(restored.last('G2U_ROOM_INFO_NOTIFY')!.room.slots).toEqual(slots);
  });

  it('存輪替表：驗證失敗不存；成功後人在家就從第一格重新開始', () => {
    const h = boot({ wall: 0, profile: (p) => p.scenes.push(Desert) });
    login(h);
    h.req('U2G_HOME_SAVE_REQ', { slots: [{ sceneType: Forest, fishTypes: [24] }] });
    expect(h.last('G2U_HOME_SAVE_ACK')).toMatchObject({ ok: false });
    expect(h.profile.home.slots).toHaveLength(1);

    enter(h, MY_HOME_ROOM_ID);
    h.sent.length = 0;
    const slots = [
      { sceneType: Desert, fishTypes: [4, 5] },
      { sceneType: Forest, fishTypes: [1] },
    ];
    h.req('U2G_HOME_SAVE_REQ', { slots });
    expect(h.last('G2U_HOME_SAVE_ACK')).toEqual({ ok: true });
    expect(h.profile.home.slots).toEqual(slots);
    expect(h.last('G2U_ROOM_DATA_NOTIFY')).toMatchObject({ sceneType: Desert, roomName: '2號房 我的家園' });
    expect(h.last('G2U_ROOM_INFO_NOTIFY')!.room).toMatchObject({ slotIndex: 0, slots });
  });

  it('模擬訪客：線上依每秒收益累積，領取後進金幣', () => {
    const h = boot({ wall: 0 });
    login(h);
    const perSec = incomePerSecond(h.profile.home.slots, 0, () => 1);
    expect(perSec).toBeCloseTo(12, 6);
    h.advance(100_000, 500);
    expect(h.profile.home.pending).toBeCloseTo(perSec * 100, 3);
    const income = h.last('G2U_HOME_INCOME_NOTIFY')!;
    expect(income).toMatchObject({ visitors: 0.4, popularity: 16, perSecond: 12 });
    h.req('U2G_HOME_CLAIM_REQ', {});
    expect(h.last('G2U_HOME_CLAIM_ACK')).toEqual({ amount: 1200, seatMoney: INITIAL_MONEY + 1200 });
    expect(h.profile.money).toBe(INITIAL_MONEY + 1200);
    expect(h.profile.home.pending).toBeLessThan(0.001);
    expect(h.profile.home.totalEarned).toBeCloseTo(1200, 3);
  });

  it('離線收益：依離開的時間補算，最多 8 小時；登入後只通知一次', () => {
    const storage = new MemoryStorage();
    const t0 = 1_000_000_000;
    const a = boot({ storage, wall: t0 });
    login(a);
    a.server.stop();

    const b = boot({ storage, wall: t0 + 3_600_000 });
    expect(b.profile.home.pending).toBeCloseTo(12 * 3600, 0);
    login(b);
    expect(b.last('G2U_HOME_INCOME_NOTIFY')!.offlineEarned).toBe(12 * 3600);
    b.advance(6000, 500);
    expect(b.last('G2U_HOME_INCOME_NOTIFY')!.offlineEarned).toBeUndefined();
    b.server.stop();

    const c = boot({ storage, wall: t0 + 3_600_000 + 6000 + 100 * 3_600_000 });
    expect(c.profile.home.pending - b.profile.home.pending).toBeCloseTo((12 * OFFLINE_CAP_MS) / 1000, 0);
  });
});

describe('裝潢', () => {
  const layout = [
    { id: 'cube_white', x: 0, y: 0, rot: 0 as const },
    { id: 'cube_red', x: 3, y: 2, rot: 0 as const },
  ];

  it('只能裝潢自己的家園；裝潢模式暫停魚群與輪替、不能開砲，離開後回填', () => {
    const h = boot({ wall: 0 });
    login(h);
    h.req('U2G_HOME_EDIT_REQ', { editing: true });
    expect(h.last('G2U_HOME_EDIT_ACK')).toMatchObject({ ok: false, editing: false });

    enter(h, MY_HOME_ROOM_ID);
    expect(h.server.script.activeGroups.size).toBeGreaterThan(0);
    h.req('U2G_HOME_EDIT_REQ', { editing: true });
    expect(h.last('G2U_HOME_EDIT_ACK')).toEqual({ ok: true, editing: true });
    expect(h.server.script.activeGroups.size).toBe(0);
    h.advance(30_000, 500);
    expect(h.server.script.activeGroups.size).toBe(0);
    h.req('U2G_SHOOT_REQ', { bulletId: 7001, bulletType: 0, bet: 500, angle: 0, scriptIdDataVec: [] });
    expect(h.last('G2U_SHOOT_REJECT')).toMatchObject({ bulletId: 7001, reason: 'edit' });

    h.sent.length = 0;
    h.req('U2G_HOME_EDIT_REQ', { editing: false });
    expect(h.take('G2U_SYNC_SCRIPT_ACK')[0].list.length).toBeGreaterThan(0);
    expect(h.server.script.activeGroups.size).toBeGreaterThan(0);
  });

  it('存裝潢：驗證擁有數 / 重疊；成功後房間的裝潢更新', () => {
    const h = boot({ wall: 0 });
    login(h);
    enter(h, MY_HOME_ROOM_ID);
    h.req('U2G_HOME_DECO_SAVE_REQ', { items: [{ id: 'plate_gold', x: 0, y: 0, rot: 0 }] });
    expect(h.last('G2U_HOME_DECO_SAVE_ACK')).toMatchObject({ ok: false });
    h.req('U2G_HOME_DECO_SAVE_REQ', { items: layout });
    expect(h.last('G2U_HOME_DECO_SAVE_ACK')).toEqual({ ok: true });
    expect(h.profile.home.deco).toEqual(layout);
    expect(h.last('G2U_ROOM_DECO_NOTIFY')).toEqual({ items: layout });
    expect(h.server.room.current.deco).toEqual(layout);
    // NPC 家園的裝潢隨房間內容一起送
    enter(h, 10);
    expect(h.last('G2U_ROOM_INFO_NOTIFY')!.room.deco.length).toBeGreaterThan(10);
  });
});

describe('存檔 / debug', () => {
  it('資產寫進儲存空間，下次啟動讀回來', () => {
    const storage = new MemoryStorage();
    const a = boot({ storage });
    login(a);
    a.req('U2G_GACHA_DRAW_REQ', { times: 10 });
    a.req('U2G_SHOOT_REQ', { bulletId: 1, bulletType: 0, bet: 500, angle: 0, scriptIdDataVec: [] });
    a.advance(3000, 500);
    const saved = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)!) as PlayerProfile;
    expect(saved.tickets).toBe(0);
    expect(saved.money).toBe(a.profile.money);
    a.server.stop();

    const b = boot({ storage });
    expect(b.profile.tickets).toBe(0);
    expect(b.profile.fish).toEqual(a.profile.fish);
    expect(b.profile.decos).toEqual(a.profile.decos);
    login(b);
    expect(b.last('G2U_ROOM_DATA_NOTIFY')!.seats[0]!.money).toBe(b.profile.money);
  });

  it('debug：加券、解鎖全部、重置存檔', () => {
    const h = boot();
    login(h);
    const tool = (toolType: number, quantity = 0) => h.req('U2G_DEBUG_CLIENT_TOOL_USE_REQ', { toolType, target: 0, quantity });
    tool(UgcDebugTool.AddTickets, 25);
    expect(h.profile.tickets).toBe(35);
    tool(UgcDebugTool.UnlockAll);
    expect(Object.keys(h.profile.fish)).toHaveLength(23);
    expect(h.profile.scenes).toHaveLength(10);
    expect(h.profile.decos.plate_gold).toBe(5);
    tool(UgcDebugTool.ResetProfile);
    expect(h.profile.tickets).toBe(10);
    expect(Object.keys(h.profile.fish)).toHaveLength(11);
    expect(h.last('G2U_PROFILE_NOTIFY')!.profile.scenes).toEqual([Forest]);
  });
});
