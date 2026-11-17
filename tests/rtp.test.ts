import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RtpEngine } from '../src/server-fake/rtp/RtpEngine';
import { buildPayouts, TARGET_RTP } from '../src/server-fake/config/payoutConfig';
import type { FishDataFile } from '../src/game/path/PathTypes';

const fishData = JSON.parse(readFileSync('public/res/Data/FishData.json', 'utf8')) as FishDataFile;
const odds = new Map(fishData.Fishes.map((f) => [f.Data, f.Odds]));

function makeEngine(seed = 12345): RtpEngine {
  const e = new RtpEngine(TARGET_RTP, seed);
  for (const [t, p] of buildPayouts(odds)) e.setPayout(t, p);
  return e;
}

describe('RtpEngine', () => {
  it('target RTP is 110%', () => {
    expect(TARGET_RTP).toBe(1.1);
  });

  it('expected return per hit equals target RTP for every fish (analytic)', () => {
    const e = makeEngine();
    for (const [type] of buildPayouts(odds)) {
      const p = e.getPayout(type)!;
      const E = e.expectedOdds(p);
      const prob = Math.min(1, TARGET_RTP / E);
      expect(prob * E).toBeCloseTo(TARGET_RTP, 9);
    }
  });

  it('converges to 110% ± 1.5% on small fish (Monte Carlo, 2M hits)', () => {
    const e = makeEngine(42);
    const types = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (let i = 0; i < 2_000_000; i++) e.judge(types[i % types.length], 100);
    const s = e.getStats();
    expect(s.rtp).toBeGreaterThan(1.085);
    expect(s.rtp).toBeLessThan(1.115);
  });

  it('T-Rex: small win keeps it alive, BOSSSHOW (showType 3) kills it', () => {
    const e = makeEngine(7);
    let undead = 0;
    let boss = 0;
    for (let i = 0; i < 200_000; i++) {
      const r = e.judge(24, 100);
      if (!r.win) continue;
      if (r.outcome!.showType === 1) {
        expect(r.outcome!.unDead).toBe(true);
        undead++;
      } else if (r.outcome!.showType === 3) {
        expect(r.outcome!.unDead).toBeFalsy();
        boss++;
      }
    }
    expect(undead).toBeGreaterThan(0);
    expect(boss).toBeGreaterThan(0);
  });

  it('forceNext picks the requested showType', () => {
    const e = makeEngine();
    e.forceNext = { showType: 3 };
    const r = e.judge(24, 100);
    expect(r.win).toBe(true);
    expect(r.outcome!.showType).toBe(3);
    expect(r.money).toBe(100 * 300);
  });
});
