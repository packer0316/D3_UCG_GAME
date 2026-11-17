/**
 * 一般子彈（BT_None）— 對照原版 Bullet.lua / BulletBody.lua / BulletSprite_Efk.lua
 *
 *   node（位置、朝向、scale 0.5）→ sprite（z = groundDist、rot (90,0,0)）→ Fireball.efk
 *   撞牆：依法線翻轉速度軸（|n.x|>0.5 翻 x、|n.y|>0.5 翻 y），第 MaxBounceTimes 次碰牆消失（存活 < 0.5s 例外）
 *   碰撞由 ShootingSystem 以地面 OBB 判定。
 */
import * as THREE from 'three';
import { setCocosRotation, type Vec2 } from '@core/math/cocos';
import { circleHitsPolygonEdge, makeOBB, type OBB2 } from '@core/math/geom2d';
import type { EfkHandle, EfkSystem } from '@engine/effekseer/EfkSystem';
import { BULLET_MIN_LIFE_BEFORE_BLANK, SpecialBulletType, type BulletDefine } from '../define/BulletDefine';

export type BulletWallResult = 'none' | 'bounce' | 'blank';

export class NormalBullet {
  readonly node = new THREE.Group();
  readonly sprite = new THREE.Object3D();
  readonly vel: Vec2;
  readonly bulletType = SpecialBulletType.None;
  bounceTimes = 0;
  age = 0;
  alive = true;
  private efkHandle: EfkHandle | null = null;

  constructor(
    readonly id: number,
    readonly seat: number,
    readonly bet: number,
    readonly def: BulletDefine,
    start: Vec2,
    angleDeg: number,
    efk: EfkSystem,
    /** 是否為本人子彈（只有本人子彈會送 HIT / 觸發受擊表演） */
    readonly isSelf: boolean,
  ) {
    const r = (angleDeg * Math.PI) / 180;
    this.vel = { x: Math.sin(r) * def.speed, y: Math.cos(r) * def.speed };
    this.node.position.set(start.x, start.y, 0);
    this.node.scale.setScalar(def.nodeScale);
    this.updateRotation();
    this.sprite.position.set(0, 0, def.groundDist);
    setCocosRotation(this.sprite, def.spriteRot);
    this.node.add(this.sprite);
    if (def.efk) this.efkHandle = efk.play(def.efk, this.sprite);
  }

  private updateRotation(): void {
    this.node.rotation.set(0, 0, -Math.atan2(this.vel.x, this.vel.y));
  }

  get pos(): Vec2 {
    return { x: this.node.position.x, y: this.node.position.y };
  }

  /** 世界座標下的碰撞半徑 */
  get radius(): number {
    return (this.def.colliderSize * this.def.nodeScale) / 2;
  }

  getOBB(): OBB2 {
    const s = this.def.colliderSize * this.def.nodeScale;
    return makeOBB(this.node.position.x, this.node.position.y, s, s, this.node.rotation.z);
  }

  update(dt: number, walls: readonly Vec2[]): BulletWallResult {
    this.age += dt;
    // 每小步位移不超過碰撞半徑：牆只在「離邊 ≤ 半徑」時判得到，一步走太遠會直接跨過牆（穿牆）
    const r = this.radius;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / r));
    const h = dt / steps;
    let result: BulletWallResult = 'none';
    for (let i = 0; i < steps; i++) {
      this.node.position.x += this.vel.x * h;
      this.node.position.y += this.vel.y * h;
      const hit = circleHitsPolygonEdge(this.pos, r, this.vel, walls);
      if (!hit) continue;
      this.bounceTimes++;
      if (this.bounceTimes >= this.def.maxBounceTimes && this.age >= BULLET_MIN_LIFE_BEFORE_BLANK) return 'blank';
      if (Math.abs(hit.nx) > 0.5) this.vel.x = -this.vel.x;
      if (Math.abs(hit.ny) > 0.5) this.vel.y = -this.vel.y;
      this.updateRotation();
      result = 'bounce';
    }
    return result;
  }

  destroy(): void {
    this.alive = false;
    this.efkHandle?.stop();
    this.node.removeFromParent();
  }
}
