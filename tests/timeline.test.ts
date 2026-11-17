import { describe, expect, it } from 'vitest';
import { FishTimeline, type TimelineFish } from '../src/game/timeline/FishTimeline';
import type { GroupEntry } from '../src/game/path/PathTypes';

const entries: GroupEntry[] = [
  { fish: 0, path: 1, delay: 0, duration: 10 },
  { fish: 1, path: 1, delay: 2, duration: 10 },
  { fish: 2, path: 1, delay: 5, duration: 3 },
];

function makeTimeline() {
  const added: { fish: TimelineFish; elapsed: number; fromScratch: boolean }[] = [];
  const removed: number[] = [];
  const ended: number[] = [];
  const tl = new FishTimeline({
    onAddFish: (fish, elapsed, fromScratch) => added.push({ fish, elapsed, fromScratch }),
    onDelFish: (s) => removed.push(s),
    onGroupEnd: (g) => ended.push(g),
  });
  return { tl, added, removed, ended };
}

describe('FishTimeline', () => {
  it('spawns fish at their delay and removes them at delay + duration', () => {
    const { tl, added, removed, ended } = makeTimeline();
    tl.addGroup(3, 1, entries, 0, [], true);
    expect(added.map((a) => a.fish.serial)).toEqual([3000]);
    expect(added[0].fish.fishType).toBe(1);
    for (let i = 0; i < 130; i++) tl.update(0.1);
    expect(added.map((a) => a.fish.serial)).toEqual([3000, 3001, 3002]);
    expect(removed).toEqual([3002, 3000, 3001]);
    expect(ended).toEqual([3]);
  });

  it('late join fast-forwards: expired fish are skipped, alive fish get elapsed path time', () => {
    const { tl, added } = makeTimeline();
    tl.addGroup(1, 1, entries, 9000, [], false);
    // fish 2 (5..8s) already expired; fish 0 elapsed 9s, fish 1 elapsed 7s
    expect(added.map((a) => [a.fish.fishIndex, +a.elapsed.toFixed(3)])).toEqual([
      [0, 9],
      [1, 7],
    ]);
    expect(added.every((a) => !a.fromScratch)).toBe(true);
  });

  it('dead fishes are not spawned', () => {
    const { tl, added } = makeTimeline();
    tl.addGroup(1, 1, entries, 3000, [1], false);
    expect(added.map((a) => a.fish.fishIndex)).toEqual([0]);
  });

  it('never rewinds', () => {
    const { tl } = makeTimeline();
    const sub = tl.addGroup(1, 1, entries, 4000, [], false);
    tl.addGroup(1, 1, entries, 1000, [], false);
    expect(sub.time).toBeCloseTo(4);
  });
});
