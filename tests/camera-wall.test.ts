import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { setCocosRotation, type Vec2 } from '../src/core/math/cocos';
import { circleHitsPolygonEdge, pointInPolygon } from '../src/core/math/geom2d';
import { WALL_POLYGON } from '../src/game/define/DisplayDefine';
import { BULLET_DATA } from '../src/game/define/BulletDefine';
import { CANNON_LIMIT_ANGLE, SEAT_ANCHORS } from '../src/game/define/CannonDefine';
import { NormalBullet } from '../src/game/bullet/NormalBullet';
import type { EfkSystem } from '../src/engine/effekseer/EfkSystem';
import { CAMERA_PRESETS } from '../src/features/debug/CameraPresets';

describe('circleHitsPolygonEdge 法線方向', () => {
  const ccwWall = [...WALL_POLYGON].reverse();
  for (const [name, wall] of [
    ['順時針（WALL_POLYGON）', WALL_POLYGON],
    ['逆時針', ccwWall],
  ] as const) {
    it(`${name}：牆內朝牆移動 → 反彈，法線朝內`, () => {
      const top = circleHitsPolygonEdge({ x: 0, y: 149 }, 2, { x: 0, y: 170 }, wall)!;
      expect(top.nx).toBeCloseTo(0);
      expect(top.ny).toBeCloseTo(-1);
      const bottom = circleHitsPolygonEdge({ x: 0, y: -13 }, 2, { x: 0, y: -170 }, wall)!;
      expect(bottom.nx).toBeCloseTo(0);
      expect(bottom.ny).toBeCloseTo(1);
    });
    it(`${name}：牆外朝牆內移動 → 不擋（讓子彈進場）`, () => {
      expect(circleHitsPolygonEdge({ x: 0, y: -15 }, 2, { x: 0, y: 170 }, wall)).toBeNull();
    });
  }
});

/** 與 Stage.designToGround 相同的換算（設計高 640） */
function rig(setting: (typeof CAMERA_PRESETS)[number]['setting'], aspect: number) {
  const H = 640;
  const W = H * aspect;
  const cam = new THREE.PerspectiveCamera(setting.fov, aspect, setting.near, setting.far);
  cam.position.set(setting.position.x, setting.position.y, setting.position.z);
  setCocosRotation(cam, setting.rotation);
  cam.updateMatrixWorld();
  const rc = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const toGround = (x: number, y: number) => {
    rc.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, (y / H) * 2 - 1), cam);
    return rc.ray.intersectPlane(plane, new THREE.Vector3());
  };
  return { W, toGround };
}

const efkStub = { play: () => null } as unknown as EfkSystem;

function distToEdges(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t));
  }
  return best;
}

describe.each(CAMERA_PRESETS.map((p) => [p.name, p] as const))('相機預設 %s：子彈牆', (_name, preset) => {
  const wall: readonly Vec2[] = preset.wall ?? WALL_POLYGON;
  const farY = Math.max(...wall.map((p) => p.y));

  for (const aspect of [16 / 9, 1882 / 559]) {
    const { W, toGround } = rig(preset.setting, aspect);
    const cannons = SEAT_ANCHORS.map((a) => toGround(W / 2 + a.dx, a.y)!);

    it(`砲台都在牆內（aspect ${aspect.toFixed(2)}）`, () => {
      for (const c of cannons) expect(pointInPolygon(c, wall)).toBe(true);
    });

    it(`點畫面任一處開砲，子彈不會一出砲口就被彈回來（aspect ${aspect.toFixed(2)}）`, () => {
      for (const cannon of cannons) {
        for (let cy = 60; cy <= 640; cy += 40) {
          for (let cx = 0; cx <= W; cx += W / 24) {
            const g = toGround(cx, cy);
            if (!g) continue; // 地平線以上：不改瞄準
            const deg = Math.max(-CANNON_LIMIT_ANGLE, Math.min(CANNON_LIMIT_ANGLE, (Math.atan2(g.x - cannon.x, g.y - cannon.y) * 180) / Math.PI));
            const b = new NormalBullet(1, 0, 1, BULLET_DATA[1], { x: cannon.x, y: cannon.y }, deg, efkStub, true);
            const label = `click (${cx.toFixed(0)},${cy}) deg=${deg.toFixed(1)}`;
            for (let i = 0; i < 60; i++) {
              const vy = b.vel.y;
              b.update(1 / 60, wall);
              // 只有撞到遠端牆才會轉成往鏡頭方向飛（側牆只翻 x）；砲台前方的近端牆不能把子彈彈回來
              if (vy >= 0 && b.vel.y < 0) expect(b.pos.y, `${label} reversed`).toBeGreaterThan(farY - 20);
            }
            // 開砲一秒後仍在牆內（或正貼著牆反彈），不是飛到牆外
            const inside = pointInPolygon(b.pos, wall) || distToEdges(b.pos, wall) <= b.radius;
            expect(inside, `${label} outside at (${b.pos.x.toFixed(1)},${b.pos.y.toFixed(1)})`).toBe(true);
          }
        }
      }
    });
  }
});

describe('相機第一種：子彈撞遠端牆會反彈回來（原版 BulletBody:bounceByNormal）', () => {
  it('直直往前打 → 在 y≈150 反彈，之後往砲台方向飛', () => {
    const b = new NormalBullet(1, 0, 1, BULLET_DATA[1], { x: 0, y: 0 }, 0, efkStub, true);
    let bouncedAt: number | null = null;
    for (let i = 0; i < 120 && bouncedAt === null; i++) if (b.update(1 / 60, WALL_POLYGON) === 'bounce') bouncedAt = b.pos.y;
    expect(bouncedAt).not.toBeNull();
    expect(bouncedAt!).toBeGreaterThan(140);
    expect(b.vel.y).toBeLessThan(0);
  });
});
