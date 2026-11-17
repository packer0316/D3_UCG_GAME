import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PathTrack, cardinalSplineEval } from '../src/game/path/PathTrack';
import type { GroupDataMap, PathDataMap } from '../src/game/path/PathTypes';
import { getGroup } from '../src/game/path/PathTypes';

const paths = JSON.parse(readFileSync('public/res/Data/PathData.json', 'utf8')) as PathDataMap;
const groups = JSON.parse(readFileSync('public/res/Data/GroupData.json', 'utf8')) as GroupDataMap;

describe('cardinal spline (cc.CardinalSplineTo)', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
    { x: 30, y: 10 },
  ];
  it('passes through control points at segment boundaries', () => {
    const out = { x: 0, y: 0 };
    expect(cardinalSplineEval(pts, 0, 0, out)).toEqual({ x: 0, y: 0 });
    cardinalSplineEval(pts, 0, 1 / 3, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(0);
    cardinalSplineEval(pts, 0, 2 / 3, out);
    expect(out.x).toBeCloseTo(20);
    expect(out.y).toBeCloseTo(10);
    expect(cardinalSplineEval(pts, 0, 1, out)).toEqual({ x: 30, y: 10 });
  });
});

describe('PathTrack', () => {
  it('compiles every path in PathData without NaN', () => {
    let count = 0;
    for (const [id, p] of Object.entries(paths)) {
      if (!Array.isArray(p.wp) || p.wp.length === 0) {
        expect(new PathTrack(p).duration).toBe(0);
        continue;
      }
      const track = new PathTrack(p);
      for (let i = 0; i <= 20; i++) {
        const pos = track.evaluate((track.duration * i) / 20);
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw new Error(`path ${id} NaN at ${i}`);
      }
      count++;
    }
    expect(count).toBeGreaterThan(900);
  });

  it('T-Rex path 872 total time matches group duration (149.28s) and has wait markers', () => {
    const track = new PathTrack(paths['872']);
    expect(track.duration).toBeCloseTo(149.28, 2);
    const waits = track.markers.filter((m) => m.kind === 'waitStart').map((m) => m.wait);
    expect(waits).toContain(0.05);
    expect(waits).toContain(1.5);
    expect(waits).toContain(4.53);
  });

  it('path 936 uses bezier segments (spline points carry waits)', () => {
    const track = new PathTrack(paths['936']);
    expect(track.segments.some((s) => s.kind === 'bezier')).toBe(true);
    expect(track.segments.some((s) => s.kind === 'cardinal')).toBe(false);
  });

  it('starts at wp[0] and ends at the last spline point', () => {
    const p = paths['2'];
    const track = new PathTrack(p);
    expect(track.evaluate(0)).toEqual({ x: p.wp[0].x, y: p.wp[0].y });
    const last = p.wp[0].spline!.pt[p.wp[0].spline!.pt.length - 1];
    const end = track.evaluate(track.duration + 1);
    expect(end.x).toBeCloseTo(last.x);
    expect(end.y).toBeCloseTo(last.y);
  });

  it('group entries of small-fish groups fit their path duration', () => {
    const g = getGroup(groups, 1)!;
    for (const e of g) {
      const track = new PathTrack(paths[String(e.path)]);
      expect(track.duration).toBeGreaterThan(0);
    }
  });
});
