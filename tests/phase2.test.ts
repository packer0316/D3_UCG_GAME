import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EventBus } from '../src/core/events/EventBus';
import { parseCsd } from '../src/engine/csd/CsdParser';
import { csdEase } from '../src/engine/csd/CsdEasing';
import { SkillSystem } from '../src/game/systems/SkillSystem';
import { SpecialBulletType } from '../src/game/define/BulletDefine';
import { isFishSupported } from '../src/game/define/FishDefine';
import type { GameContext, GameEvents } from '../src/game/GameContext';
import type { CsdFile } from '../src/engine/csd/CsdParser';
import type { FishDataFile, GroupDataMap } from '../src/game/path/PathTypes';
import { RtpEngine } from '../src/server-fake/rtp/RtpEngine';
import { buildPayouts, TARGET_RTP } from '../src/server-fake/config/payoutConfig';
import { buildSummonList } from '../src/features/debug/SummonList';

const fishData = JSON.parse(readFileSync('public/res/Data/FishData.json', 'utf8')) as FishDataFile;
const groups = JSON.parse(readFileSync('public/res/Data/GroupData.json', 'utf8')) as GroupDataMap;

describe('CSD', () => {
  it('Card.csd.json has the five skill buttons with original images', () => {
    const csd = JSON.parse(readFileSync('public/res/DinosaurExport/main/Card.csd.json', 'utf8')) as CsdFile;
    const btns = csd.root.children.map((c) => [c.name, c.file?.path]);
    expect(btns).toEqual([
      ['ImgBtn_1', 'Aim.png'],
      ['ImgBtn_2', 'Torpedo.png'],
      ['ImgBtn_4', 'Lightning_v2.png'],
      ['ImgBtn_3', 'Drone.png'],
      ['ImgBtn_5', 'AIAuto.png'],
    ]);
  });

  it('parses timelines and animation list (LockAim_Anim)', () => {
    const xml = readFileSync(
      'D:/GIT_TMD/Git_1/TMD_CocosStudio_DragonTycoon3/CocosProject/cocosstudio/DinosaurExport/main/LockAim_Anim.csd',
      'utf8',
    );
    const csd = parseCsd(xml);
    expect(csd.animations).toEqual([
      { name: 'start', start: 0, end: 15 },
      { name: 'loop', start: 20, end: 80 },
    ]);
    const alpha = csd.timelines.find((t) => t.prop === 'Alpha')!;
    expect(alpha.frames.map((f) => [f.i, f.v])).toEqual([
      [20, 0],
      [50, 255],
      [80, 0],
    ]);
  });

  it('easing matches cocos tweenfunc endpoints', () => {
    for (const type of [0, 1, 2, 3, 4, 5, 7, 8, 11, 13, 14, 26, 29]) {
      expect(csdEase(type, 0)).toBeCloseTo(0, 5);
      expect(csdEase(type, 1)).toBeCloseTo(1, 5);
    }
  });
});

describe('SkillSystem（SkillCtrlView 規則）', () => {
  const make = () => {
    const events = new EventBus<GameEvents>();
    return new SkillSystem({ events } as unknown as GameContext);
  };

  it('all off → normal bullet, no auto', () => {
    const s = make();
    expect(s.bulletType).toBe(SpecialBulletType.None);
    expect(s.auto).toBe(false);
  });

  it('skills are mutually exclusive; highest weight decides the bullet type', () => {
    const s = make();
    s.toggle('Skill_1');
    expect(s.bulletType).toBe(SpecialBulletType.Focus);
    s.toggle('Skill_3');
    expect(s.isOn('Skill_1')).toBe(false);
    expect(s.bulletType).toBe(SpecialBulletType.Advanced);
    s.toggle('AutoShoot'); // 準心可與技能並存，但權重較低
    expect(s.bulletType).toBe(SpecialBulletType.Advanced);
    expect(s.auto).toBe(true);
  });

  it('AutoShoot and AIAuto are mutually exclusive', () => {
    const s = make();
    s.toggle('AutoShoot');
    s.toggle('AIAuto');
    expect(s.isOn('AutoShoot')).toBe(false);
    expect(s.isOn('AIAuto')).toBe(true);
    expect(s.bulletType).toBe(SpecialBulletType.Lock);
    s.toggle('AIAuto');
    expect(s.bulletType).toBe(SpecialBulletType.None);
  });
});

describe('RTP（特殊子彈 / 出獎模式）', () => {
  const odds = new Map(fishData.Fishes.map((f) => [f.Data, f.Odds]));
  const engine = (seed: number) => {
    const e = new RtpEngine(TARGET_RTP, seed);
    for (const [t, p] of buildPayouts(odds)) e.setPayout(t, p);
    return e;
  };

  it('lightning cost split over n fish still returns RTP × cost (Monte Carlo)', () => {
    const e = engine(99);
    const bet = 100;
    const cost = bet * 20;
    let paid = 0;
    let won = 0;
    for (let i = 0; i < 300_000; i++) {
      const n = 3 + (i % 4); // 3–6 條
      paid += cost;
      // 小魚 1–8 混大一點的 9–11，總容量足以吸收 RTP × 20
      const types = Array.from({ length: n }, (_, k) => 1 + ((i * 7 + k * 3) % 11));
      for (const r of e.judgeMulti(types, bet, cost / bet)) won += r.money;
    }
    expect(won / paid).toBeGreaterThan(1.07);
    expect(won / paid).toBeLessThan(1.13);
  });

  it('cheat mode wins every hit', () => {
    const e = engine(1);
    e.cheatMode = true;
    for (let i = 0; i < 100; i++) expect(e.judge(13, 100).win).toBe(true);
  });
});

describe('召喚魚名單（TestSummonUI）', () => {
  const list = buildSummonList(groups, fishData, isFishSupported);

  it('contains the original GroupIdMap entries, sorted by groupId descending', () => {
    expect(list.some((e) => e.label === '35-帝王暴龍' && e.original && e.supported)).toBe(true);
    expect(list.find((e) => e.groupId === 151)?.supported).toBe(false);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].groupId).toBeGreaterThanOrEqual(list[i].groupId);
  });

  it('adds supported normal-fish groups (e.g. 21 刺甲龍/太古劍龍/棘龍)', () => {
    const g21 = list.find((e) => e.groupId === 21);
    expect(g21?.supported).toBe(true);
    expect(g21?.name).toContain('刺甲龍');
  });
});
