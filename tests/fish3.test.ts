/**
 * 第三階段：魚種 15–17、22–28 + 魚身 EFK（SPEC §14）
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error — 工具是 .mjs（無型別）
import { parseLuaAssignment, parseLuaValue } from '../tools/lib/lua-table.mjs';
// @ts-expect-error — 工具是 .mjs（無型別）
import { convertFishEfkSetting } from '../tools/lib/fish-efk.mjs';
import { getFishDefine, WinCircleType } from '../src/game/define/FishDefine';
import { listEfkFiles } from '../src/game/systems/FishSystem';
import type { FishEfkSetting } from '../src/game/world/FishEfkPlayer';
import { getGroup, listGroupIds, type FishDataFile, type GroupDataMap } from '../src/game/path/PathTypes';
import { SCHEDULE, SUPPORTED_FISH_TYPES, BOSS_GROUPS } from '../src/server-fake/config/scheduleConfig';
import { RtpEngine } from '../src/server-fake/rtp/RtpEngine';
import { buildPayouts, TARGET_RTP } from '../src/server-fake/config/payoutConfig';

const RES = 'public/res/';
const fishData = JSON.parse(readFileSync(RES + 'Data/FishData.json', 'utf8')) as FishDataFile;
const groups = JSON.parse(readFileSync(RES + 'Data/GroupData.json', 'utf8')) as GroupDataMap;
const NEW_TYPES = [15, 16, 17, 22, 23, 25, 26, 27, 28];

describe('lua-table', () => {
  it('parses tables, comments, cc ctors, concat and arithmetic', () => {
    const v = parseLuaValue(
      `{
        -- 註解
        A = 1, B = -2.5, C = "x" .. 'y', --[[ 區塊
        註解 ]] D = cc.vec3( 1, 2, -3 ), E = { 10, 20, 30 },
        ["k k"] = true, F = nil, G = 1/4, H = fishG.Res_Path .. "/a.efk";
      }`,
      (p: string) => (p === 'fishG.Res_Path' ? 'R' : { $ref: p }),
    );
    expect(v).toEqual({
      A: 1,
      B: -2.5,
      C: 'xy',
      D: { x: 1, y: 2, z: -3 },
      E: [10, 20, 30],
      'k k': true,
      F: null,
      G: 0.25,
      H: 'R/a.efk',
    });
  });

  it('finds an assignment by dotted name', () => {
    const src = `fishG.SoundTable = {\n  A = "sound/a", -- x\n  B = "sound/b",\n}\n`;
    expect(parseLuaAssignment(src, 'fishG.SoundTable')).toEqual({ A: 'sound/a', B: 'sound/b' });
  });
});

describe('fish EFK converter', () => {
  const src = `common.GameRequire( "Define/SoundDefine" )
local FishEfkSetting = {
    BodyEfk = { { Efk = { File = fishG.Res_Path .. "/Effekseer_dt3/a.efk", Duration = -1, Scale = 10 }, BoneName = "root" } },
    WithActEfk = {
        Run = {
            { Efk = { File = fishG.Res_Path .. "/Effekseer_dt3/walk.efk", Position = cc.vec3(0, 1, 2), Delay = 0.5 }, BoneName = "Dummy_all" },
            { Sound = { Source = fishG.SoundTable.WALK, Delay = 1 } },
            -- { Efk = { File = "commented.efk" } },
        },
        BigWin = { { Efk = { File = fishG.Res_Path .. "/Effekseer_dt3/big.efk" }, ShockWorld = { Times = 2, Delta = 5 } } },
    },
}
return FishEfkSetting`;

  it('converts to lower-case JSON with resolved paths and sounds', () => {
    const r = convertFishEfkSetting(src, { WALK: 'sound/walk' });
    expect(r.warnings).toEqual([]);
    expect(r.json.bodyEfk).toEqual([{ efk: { file: 'Effekseer_dt3/a.efk', duration: -1, scale: 10 }, bone: 'root' }]);
    expect(r.json.withActEfk.Run).toEqual([
      { efk: { file: 'Effekseer_dt3/walk.efk', position: { x: 0, y: 1, z: 2 }, delay: 0.5 }, bone: 'Dummy_all' },
      { sound: { source: 'sound/walk', delay: 1 } },
    ]);
    expect(r.json.withActEfk.BigWin[0].shockWorld).toEqual({ times: 2, delta: 5 });
    expect(r.efkFiles.sort()).toEqual(['Effekseer_dt3/a.efk', 'Effekseer_dt3/big.efk', 'Effekseer_dt3/walk.efk']);
    expect(r.sounds).toEqual(['sound/walk']);
  });

  it('keeps only listed animations (body always kept)', () => {
    const r = convertFishEfkSetting(src, { WALK: 'sound/walk' }, ['Run']);
    expect(Object.keys(r.json.withActEfk)).toEqual(['Run']);
    expect(r.json.bodyEfk).toHaveLength(1);
    expect(r.efkFiles).not.toContain('Effekseer_dt3/big.efk');
  });
});

describe('fish defines 15–17, 22–28', () => {
  const atlas = JSON.parse(readFileSync(RES + 'DinosaurExport/plist/Reward_common_D3_1.plist.json', 'utf8')) as {
    frames: Record<string, unknown>;
  };

  it('every supported fish type has a define, a copied model and a reward image', () => {
    for (const t of SUPPORTED_FISH_TYPES) {
      const d = getFishDefine(t);
      expect(d, `type ${t}`).toBeDefined();
      if (!d!.model.virtual) expect(existsSync(RES + d!.model.model), d!.model.model).toBe(true);
      expect(atlas.frames[d!.reward.image], d!.reward.image).toBeDefined();
      d!.extraTextures?.forEach((p) => expect(existsSync(RES + p), p).toBe(true));
    }
  });

  it('fish EFK settings exist and every referenced efk / sound was copied', () => {
    for (const t of SUPPORTED_FISH_TYPES) {
      const d = getFishDefine(t)!;
      if (!d.efk) continue;
      expect(existsSync(RES + d.efk), d.efk).toBe(true);
      const setting = JSON.parse(readFileSync(RES + d.efk, 'utf8')) as FishEfkSetting;
      for (const f of listEfkFiles(setting)) expect(existsSync(RES + f), f).toBe(true);
      const anims = Object.keys(setting.withActEfk ?? {});
      for (const a of anims) {
        expect(d.model.animations[a] ?? a.startsWith('Hurt'), `${d.name} anim ${a}`).toBeTruthy();
        for (const e of setting.withActEfk![a]) {
          if (e.sound) expect(existsSync(`${RES}Sound/mp3/${e.sound.source}.mp3`), e.sound.source).toBe(true);
        }
      }
    }
  });

  it('original settings are translated (spot checks)', () => {
    expect(getFishDefine(26)!.model.runAnimation).toEqual(['Idle_1', 'Idle_1', 'Idle_1', 'Idle_2']);
    expect(getFishDefine(27)!.model.hitBoxBone).toBe('Bip001 Neck');
    expect(getFishDefine(27)!.common.waitAction?.Act_Leave).toEqual({ checkTime: 2, ani: 'Out' });
    expect(getFishDefine(23)!.model.animations.Run).toEqual({ start: 36, end: 65, speed: 0.5 });
    expect(getFishDefine(22)!.model.isFlying).toBe(true);
    expect(getFishDefine(28)!.model.virtual).toBe(true);
    expect(getFishDefine(28)!.reward.winCircle?.[1]?.type).toBe(WinCircleType.Middle);
  });

  it('every new fish type appears in at least one group', () => {
    const seen = new Set<number>();
    for (const id of listGroupIds(groups)) getGroup(groups, id)!.forEach((e) => seen.add(e.fish + 1));
    for (const t of NEW_TYPES) expect(seen.has(t), `type ${t}`).toBe(true);
  });
});

describe('fake server: schedule / payouts for new fish', () => {
  it('special / knight / boss kinds have candidate groups', () => {
    const all = listGroupIds(groups);
    for (const kind of ['special', 'knight', 'boss']) {
      const def = SCHEDULE.find((k) => k.kind === kind)!;
      const candidates = all.filter((id) => {
        const entries = getGroup(groups, id)!;
        const types = new Set(entries.map((e) => e.fish + 1));
        return [...types].every((t) => SUPPORTED_FISH_TYPES.has(t)) && def.filter(id, types, entries);
      });
      expect(candidates.length, kind).toBeGreaterThan(0);
    }
    expect(BOSS_GROUPS).toContain(57);
  });

  it('every new fish has a payout and the expected return equals target RTP', () => {
    const odds = new Map(fishData.Fishes.map((f) => [f.Data, f.Odds]));
    const payouts = buildPayouts(odds);
    const e = new RtpEngine(TARGET_RTP, 1);
    for (const [t, p] of payouts) e.setPayout(t, p);
    for (const t of NEW_TYPES) {
      const p = e.getPayout(t);
      expect(p, `type ${t}`).toBeDefined();
      const E = e.expectedOdds(p!);
      expect(Math.min(1, TARGET_RTP / E) * E).toBeCloseTo(TARGET_RTP, 9);
    }
    // 獵龍騎士 / Boss 小獎不死
    expect(payouts.get(22)!.outcomes.every((o) => o.unDead)).toBe(true);
    expect(payouts.get(27)!.outcomes.find((o) => o.showType === 1)?.unDead).toBe(true);
    expect(payouts.get(27)!.outcomes.find((o) => o.showType === 3)?.unDead).toBeFalsy();
  });
});
