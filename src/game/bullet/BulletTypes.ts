/**
 * 子彈行為共用介面（BulletBehaviorRegistry 的單位）。
 * 一般子彈（直線、反彈、碰撞）由 ShootingSystem 自己做碰撞；
 * 鎖定類子彈（追蹤彈 / 雷擊 / 雷射）自行飛行，抵達後呼叫 host.hit()。
 */
import type * as THREE from 'three';
import type { ActionManager } from '@core/tween/ActionManager';
import type { CsdLibrary } from '@engine/csd/CsdPlayer';
import type { EfkSystem } from '@engine/effekseer/EfkSystem';
import type { Stage } from '@engine/stage/Stage';
import type { BulletDefine, SpecialBulletTypeId } from '../define/BulletDefine';
import type { Fish } from '../world/Fish';

export interface BulletHost {
  readonly stage: Stage;
  readonly efk: EfkSystem;
  readonly csd: CsdLibrary;
  readonly actions: ActionManager;
  /** 3D 子彈圖層 */
  readonly layer3d: THREE.Group;
  /** 2D overlay 子彈圖層 */
  readonly overlay: THREE.Group;
  /** 命中（fishes[0] 為主目標） */
  hit(bullet: ActiveBullet, fishes: Fish[], point: THREE.Vector3): void;
  /** 沒打到（目標消失 / 超時） */
  blank(bullet: ActiveBullet, point: THREE.Vector3): void;
}

export interface ActiveBullet {
  readonly id: number;
  readonly seat: number;
  readonly bet: number;
  readonly def: BulletDefine;
  readonly bulletType: SpecialBulletTypeId;
  readonly isSelf: boolean;
  alive: boolean;
  update(dt: number): void;
  destroy(): void;
}

export interface LockShotParams {
  host: BulletHost;
  id: number;
  seat: number;
  bet: number;
  def: BulletDefine;
  bulletType: SpecialBulletTypeId;
  isSelf: boolean;
  /** 砲口世界座標 */
  muzzle: THREE.Vector3;
  /** 目標（雷擊：主目標在前） */
  targets: Fish[];
}

export type LockShotFactory = (p: LockShotParams) => ActiveBullet;

/** kind → 行為（擴充點：新子彈類型註冊在這裡） */
export class BulletBehaviorRegistry {
  private map = new Map<string, LockShotFactory>();

  register(kind: string, factory: LockShotFactory): void {
    this.map.set(kind, factory);
  }

  create(kind: string, p: LockShotParams): ActiveBullet {
    const f = this.map.get(kind);
    if (!f) throw new Error(`[BulletBehaviorRegistry] unknown bullet kind ${kind}`);
    return f(p);
  }

  has(kind: string): boolean {
    return this.map.has(kind);
  }
}
