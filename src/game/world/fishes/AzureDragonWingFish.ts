/**
 * 翔空蒼龍翅膀 — 翻譯自原版 FishAzureDragonWing.lua（SPEC §14.5）
 *
 * - 沒有模型（empty.c3t）、不走腳本路徑（InitPathMoveBehaviour 回傳 nil）
 * - 找到場上的蒼龍後掛在對應骨骼、節點縮放 50（CheckParentExist）。
 *   本版不重設父節點：每幀把節點世界 transform 設為「骨骼世界矩陣 × 縮放 50」，
 *   因此碰撞（getOBB）、點選（hitBox）、鎖定、跳字位置都沿用一般魚的流程。
 * - 可打 = 蒼龍可打（SetShootable 同步）
 * - 被打死（OnKillNotify → parent:DestroyWing）：通知蒼龍、自己移除
 */
import * as THREE from 'three';
import { Fish, type FishInit } from '../Fish';
import { AzureDragonFish } from './AzureDragonFish';

/** CheckParentExist：self:setScale(50) */
const WING_NODE_SCALE = 50;

export class AzureDragonWingFish extends Fish {
  private parent: AzureDragonFish | null = null;
  private bone: THREE.Object3D | null = null;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();

  constructor(init: FishInit) {
    super(init);
    this.followPath = false;
  }

  protected override onInit(): void {
    this.hittable = false;
  }

  /** 找場上的蒼龍（同群組優先，對照原版 GetFishByClassType） */
  private findParent(): void {
    let found: AzureDragonFish | null = null;
    for (const f of this.env.aliveFish()) {
      if (!(f instanceof AzureDragonFish) || f.dying) continue;
      if (f.groupIndex === this.groupIndex) {
        found = f;
        break;
      }
      found ??= f;
    }
    if (!found) return;
    const bone = found.wingBone(this.fishIndex);
    if (!bone) return;
    this.parent = found;
    this.bone = bone;
    this.attachedTo = found;
    found.generateWing(this.fishIndex);
  }

  override update(dt: number): void {
    if (!this.parent && !this.dying) this.findParent();
    const p = this.parent;
    if (p && this.bone) {
      // 跟著骨骼（魚圖層在原點、無旋轉縮放 → 節點本地 = 世界）
      this.bone.updateWorldMatrix(true, false);
      this.bone.matrixWorld.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.node.position.copy(this.tmpPos);
      this.node.quaternion.copy(this.tmpQuat);
      this.node.scale.copy(this.tmpScale).multiplyScalar(WING_NODE_SCALE);
    }
    if (!this.dying) this.hittable = !!p && p.shootable && !p.dying && p.sprite.visible;
    super.update(dt);
  }

  /** OnKillNotify → parent:DestroyWing(m_fishId) */
  override onKilled(): void {
    this.parent?.destroyWing(this.fishIndex);
  }
}
