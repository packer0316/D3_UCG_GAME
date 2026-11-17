/**
 * 雷擊彈（脈衝炮 / 紫雷擊，擴散）— 翻譯自原版 BulletLightning.lua
 *
 * - 目標由 ShootingSystem 在開砲時決定：主目標 + 範圍內其他魚（共 3–6 條）
 * - 視覺：dt3_cannon_C_Bullet(_purple).csd，billboard（overlay 投影），大小依深度換算
 * - 3D 直線以 500/s 飛向主目標 lockPos；距離 < 10 或超時即命中，一次帶全部目標
 */
import * as THREE from 'three';
import type { CsdInstance } from '@engine/csd/CsdPlayer';
import type { BulletDefine, SpecialBulletTypeId } from '../define/BulletDefine';
import type { Fish } from '../world/Fish';
import type { ActiveBullet, BulletHost, LockShotParams } from './BulletTypes';

const HIT_DIST = 10;

export class LightningBullet implements ActiveBullet {
  readonly id: number;
  readonly seat: number;
  readonly bet: number;
  readonly def: BulletDefine;
  readonly bulletType: SpecialBulletTypeId;
  readonly isSelf: boolean;
  alive = true;
  private readonly host: BulletHost;
  private readonly pos: THREE.Vector3;
  private readonly target: THREE.Vector3;
  private readonly targets: Fish[];
  private readonly visual: CsdInstance | null;
  private elapsed = 0;
  private readonly maxTime: number;

  constructor(p: LockShotParams) {
    this.host = p.host;
    this.id = p.id;
    this.seat = p.seat;
    this.bet = p.bet;
    this.def = p.def;
    this.bulletType = p.bulletType;
    this.isSelf = p.isSelf;
    this.targets = p.targets;
    this.pos = p.muzzle.clone();
    this.target = this.targets[0].getLockPos();
    this.maxTime = this.pos.distanceTo(this.target) / this.def.speed + 0.5;
    this.visual = this.def.csd && p.host.csd.get(this.def.csd) ? p.host.csd.create(this.def.csd).play(undefined, true) : null;
    if (this.visual) {
      this.visual.root.renderOrder = 8;
      p.host.overlay.add(this.visual.root);
    }
    this.place();
  }

  private place(): void {
    if (!this.visual) return;
    const d = this.host.stage.worldToDesign(this.pos);
    this.visual.root.position.set(d.x, d.y, 8);
    this.visual.root.scale.setScalar(this.host.stage.pixelsPerUnit(this.pos) * this.def.nodeScale);
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.elapsed += dt;
    const main = this.targets[0];
    if (main.node.parent && !main.dying) main.getLockPos(this.target);
    const step = this.def.speed * dt;
    const dist = this.pos.distanceTo(this.target);
    if (dist <= Math.max(HIT_DIST, step) || this.elapsed >= this.maxTime) {
      this.pos.copy(this.target);
      const alive = this.targets.filter((f) => f.node.parent && f.hittable && !f.dying);
      if (alive.length && alive[0] === main) this.host.hit(this, alive, this.pos.clone());
      else if (alive.length) this.host.hit(this, alive, alive[0].getLockPos());
      else this.host.blank(this, this.pos.clone());
      return;
    }
    this.pos.addScaledVector(this.target.clone().sub(this.pos).normalize(), step);
    this.visual?.update(dt);
    this.place();
  }

  destroy(): void {
    this.alive = false;
    this.visual?.dispose();
  }
}
