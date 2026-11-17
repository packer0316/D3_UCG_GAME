/**
 * 巡光炮（雷射）— 翻譯自原版 BulletTrack.lua + LockShootEffect.lua + BulletManager（雷射段）
 *
 * LaserShot：每次開砲一發，dt3_cannon_E_Bullet.csd 在 2D 以 1000 px/s 從砲口直線飛向目標，抵達即命中。
 * LaserBeam：每個座位一條常駐光束 dt3_cannon_E_laser.csd
 *   - 放在砲口投影位置、轉向目標；Line.scaleY = 長度 / 250、Hit 節點放在末端
 *   - 每次射擊重設 3 次 loop（0–16）；用完或 0.5s 沒射擊 → end（20–36）後隱藏
 */
import * as THREE from 'three';
import type { CsdInstance, CsdLibrary, CsdNodeView } from '@engine/csd/CsdPlayer';
import type { Stage } from '@engine/stage/Stage';
import { LASER_BEAM, type BulletDefine, type SpecialBulletTypeId } from '../define/BulletDefine';
import type { Fish } from '../world/Fish';
import type { ActiveBullet, BulletHost, LockShotParams } from './BulletTypes';

const E_BULLET_CSD = 'DinosaurExport/Bullet_dt3/dt3_cannon_E_Bullet.csd';

export class LaserShot implements ActiveBullet {
  readonly id: number;
  readonly seat: number;
  readonly bet: number;
  readonly def: BulletDefine;
  readonly bulletType: SpecialBulletTypeId;
  readonly isSelf: boolean;
  alive = true;
  private readonly host: BulletHost;
  private readonly fish: Fish;
  private readonly from: THREE.Vector2;
  private readonly to: THREE.Vector2;
  private progress = 0;
  private readonly visual: CsdInstance | null;

  constructor(p: LockShotParams) {
    this.host = p.host;
    this.id = p.id;
    this.seat = p.seat;
    this.bet = p.bet;
    this.def = p.def;
    this.bulletType = p.bulletType;
    this.isSelf = p.isSelf;
    this.fish = p.targets[0];
    this.from = p.host.stage.worldToDesign(p.muzzle);
    this.to = p.host.stage.worldToDesign(this.fish.getLockPos());
    this.visual = p.host.csd.get(E_BULLET_CSD) ? p.host.csd.create(E_BULLET_CSD).play(undefined, true) : null;
    if (this.visual) {
      this.visual.root.scale.setScalar(this.def.nodeScale);
      p.host.overlay.add(this.visual.root);
    }
  }

  update(dt: number): void {
    if (!this.alive) return;
    const alive = !!this.fish.node.parent && this.fish.hittable && !this.fish.dying;
    if (alive) this.host.stage.worldToDesign(this.fish.getLockPos(), this.to);
    const len = Math.max(1, this.from.distanceTo(this.to));
    this.progress += (this.def.speed * dt) / len;
    const t = Math.min(1, this.progress);
    if (this.visual) {
      this.visual.root.position.set(this.from.x + (this.to.x - this.from.x) * t, this.from.y + (this.to.y - this.from.y) * t, 9);
      this.visual.root.rotation.z = -Math.atan2(this.to.x - this.from.x, this.to.y - this.from.y);
      this.visual.update(dt);
    }
    if (t >= 1) {
      const point = this.fish.getLockPos();
      if (alive) this.host.hit(this, [this.fish], point);
      else this.host.blank(this, point);
    }
  }

  destroy(): void {
    this.alive = false;
    this.visual?.dispose();
  }
}

export class LaserBeam {
  private instance: CsdInstance | null = null;
  private line: CsdNodeView | undefined;
  private hitNode: CsdNodeView | undefined;
  private state: 'idle' | 'loop' | 'end' = 'idle';
  private loopsLeft = 0;
  private sinceShot = 0;
  private length = 0;
  private readonly gun = new THREE.Vector2();
  private readonly tgt = new THREE.Vector2();
  /** 光束結束時（停止砲口常駐特效） */
  onEnd: (() => void) | null = null;

  constructor(
    private readonly lib: CsdLibrary,
    private readonly stage: Stage,
    private readonly layer: THREE.Group,
    private readonly csdPath: string,
  ) {}

  private ensure(): CsdInstance | null {
    if (this.instance) return this.instance;
    if (!this.lib.get(this.csdPath)) return null;
    const inst = this.lib.create(this.csdPath);
    this.line = inst.find('Line');
    this.hitNode = inst.find('Hit');
    const baseScaleY = this.line?.data.scaleY ?? 1;
    inst.afterTick = () => {
      // timeline 會改 Line 的 Scale：套用後再依長度拉長
      if (this.line) this.line.scaleY = (this.line.scaleY || baseScaleY) * (this.length / LASER_BEAM.length);
      if (this.hitNode) this.hitNode.y = this.length;
    };
    inst.root.visible = false;
    inst.root.renderOrder = 3;
    this.layer.add(inst.root);
    this.instance = inst;
    return inst;
  }

  /** 每次雷射開砲 */
  shoot(): void {
    const inst = this.ensure();
    if (!inst) return;
    this.loopsLeft = LASER_BEAM.loopTimes;
    this.sinceShot = 0;
    if (this.state !== 'loop') {
      this.state = 'loop';
      inst.root.visible = true;
      this.playLoop();
    }
  }

  private playLoop(): void {
    this.instance?.play('loop', false, () => {
      this.loopsLeft--;
      if (this.loopsLeft > 0 && this.sinceShot < LASER_BEAM.idleTimeout) this.playLoop();
      else this.end();
    });
  }

  end(): void {
    if (!this.instance || this.state !== 'loop') return;
    this.state = 'end';
    this.instance.play('end', false, () => {
      this.state = 'idle';
      if (this.instance) this.instance.root.visible = false;
      this.onEnd?.();
    });
  }

  get active(): boolean {
    return this.state !== 'idle';
  }

  /** gunWorld：砲口世界座標；target：鎖定的魚（無則結束） */
  update(dt: number, gunWorld: THREE.Vector3, target: Fish | null): void {
    const inst = this.instance;
    if (!inst || this.state === 'idle') return;
    this.sinceShot += dt;
    if (this.state === 'loop' && (!target || this.sinceShot >= LASER_BEAM.idleTimeout)) this.end();
    this.stage.worldToDesign(gunWorld, this.gun);
    if (target) this.stage.worldToDesign(target.getLockPos(), this.tgt);
    const dx = this.tgt.x - this.gun.x;
    const dy = this.tgt.y - this.gun.y;
    this.length = Math.hypot(dx, dy);
    inst.root.position.set(this.gun.x, this.gun.y, 3);
    inst.root.rotation.z = -Math.atan2(dx, dy);
    inst.update(dt);
  }

  dispose(): void {
    this.instance?.dispose();
    this.instance = null;
  }
}
