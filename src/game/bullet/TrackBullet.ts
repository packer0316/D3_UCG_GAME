/**
 * 追蹤彈（鎖定 / 榴彈砲）— 翻譯自原版 Bullet3dTrack + BulletPathMove3dTrack.lua
 *
 *   movTime = max(水平距離 / speed, 0.1)；movHeight = 50 × movTime
 *   前半（u < 0.5，t = u/0.5）：高度 = movHeight·4(t/2)(1 − t/2)，水平比例線性到 0.5
 *   後半（t = (u − 0.5)/0.5）：高度 = (1 − t)·movHeight，水平比例 = 0.5 + √t·0.5
 *   每幀重讀目標位置（追蹤）；底部高度由起點高度線性內插到目標高度。抵達即命中（原版必中）。
 *   朝向：Helper.DirectionToQuat(front, up = (0,0,1))，本地 +Y = 前方、+Z 盡量朝上。
 *   原版 front 取自父節點位移（拋物線高度在子節點 sprite 上，所以只有水平朝向）；
 *   這裡 front 含拋物線高度，子彈沿弧線抬頭 / 低頭。
 */
import * as THREE from 'three';
import { setCocosRotation } from '@core/math/cocos';
import type { EfkHandle } from '@engine/effekseer/EfkSystem';
import { TRACK_ARC, type BulletDefine, type SpecialBulletTypeId } from '../define/BulletDefine';
import type { Fish } from '../world/Fish';
import type { ActiveBullet, BulletHost, LockShotParams } from './BulletTypes';

const WORLD_UP = new THREE.Vector3(0, 0, 1);

export class TrackBullet implements ActiveBullet {
  readonly id: number;
  readonly seat: number;
  readonly bet: number;
  readonly def: BulletDefine;
  readonly bulletType: SpecialBulletTypeId;
  readonly isSelf: boolean;
  alive = true;
  private readonly host: BulletHost;
  private readonly node = new THREE.Group();
  private readonly sprite = new THREE.Object3D();
  private readonly start: THREE.Vector3;
  private readonly target: THREE.Vector3;
  private readonly fish: Fish;
  private readonly movTime: number;
  private readonly movHeight: number;
  private elapsed = 0;
  private efk: EfkHandle | null = null;
  private readonly prev = new THREE.Vector3();
  private readonly front = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  constructor(p: LockShotParams) {
    this.host = p.host;
    this.id = p.id;
    this.seat = p.seat;
    this.bet = p.bet;
    this.def = p.def;
    this.bulletType = p.bulletType;
    this.isSelf = p.isSelf;
    this.fish = p.targets[0];
    this.start = p.host.stage.projectToGround(p.muzzle) ?? p.muzzle.clone().setZ(0);
    this.start.z = 0;
    this.target = this.fish.getLockPos();
    const dist = Math.hypot(this.target.x - this.start.x, this.target.y - this.start.y);
    this.movTime = Math.max(dist / this.def.speed, TRACK_ARC.minTime);
    this.movHeight = TRACK_ARC.heightRate * this.movTime;

    this.node.position.copy(this.start);
    this.node.scale.setScalar(this.def.nodeScale);
    this.sprite.position.set(0, 0, this.def.groundDist);
    setCocosRotation(this.sprite, this.def.spriteRot);
    this.node.add(this.sprite);
    p.host.layer3d.add(this.node);
    this.prev.copy(this.start);
    if (this.def.efk) this.efk = p.host.efk.play(this.def.efk, this.sprite);
  }

  private get fishAlive(): boolean {
    return !!this.fish.node.parent && this.fish.hittable && !this.fish.dying;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.elapsed += dt;
    if (this.fishAlive) this.fish.getLockPos(this.target);
    const u = Math.min(1, this.elapsed / this.movTime);
    const rise = TRACK_ARC.riseTimeRate;
    let frac: number;
    let h: number;
    if (u < rise) {
      const t = u / rise;
      frac = 0.5 * t;
      h = this.movHeight * 4 * (t * 0.5) * (1 - t * 0.5);
    } else {
      const t = (u - rise) / (1 - rise);
      frac = 0.5 + Math.sqrt(t) * 0.5;
      h = (1 - t) * this.movHeight;
    }
    const x = this.start.x + (this.target.x - this.start.x) * frac;
    const y = this.start.y + (this.target.y - this.start.y) * frac;
    const z = this.start.z + (this.target.z - this.start.z) * frac + h;
    this.node.position.set(x, y, z);
    this.faceDirection(this.front.set(x - this.prev.x, y - this.prev.y, z - this.prev.z));
    this.prev.set(x, y, z);

    if (u >= 1) {
      const point = this.node.position.clone();
      if (this.fishAlive) this.host.hit(this, [this.fish], point);
      else this.host.blank(this, point);
    }
  }

  /** Helper.DirectionToQuat：基底 (right, front, up) → 本地 +Y 對齊飛行方向 */
  private faceDirection(front: THREE.Vector3): void {
    if (front.lengthSq() < 1e-8) return; // 這幀沒移動：保留上一幀朝向
    front.normalize();
    const right = this.right.crossVectors(front, WORLD_UP);
    if (right.lengthSq() < 1e-8) return; // 垂直上下：沒有水平分量可定左右，保留上一幀朝向
    right.normalize();
    const up = this.up.crossVectors(right, front).normalize();
    this.node.quaternion.setFromRotationMatrix(this.basis.makeBasis(right, front, up));
  }

  destroy(): void {
    this.alive = false;
    this.efk?.stop();
    this.node.removeFromParent();
  }
}
