/**
 * 子彈命中特效 — 原版 BulletHit.lua（BulletHit_Csd）：在命中點播放 csd，同一座位同一檔案同時只留一個。
 *   一般 Fire_Normal_Hit（0.1）、鎖定（0.2）、榴彈 dt3_cannon_B_Hit（0.12）、雷擊 dt3_cannon_C_Hit(_purple)（0.1）
 * 原版放在 3D 空間（scale = 世界單位 / csd 像素）；此版在 overlay 依該點深度換算成透視大小。
 */
import type * as THREE from 'three';
import type { ActionManager } from '@core/tween/ActionManager';
import type { CsdInstance, CsdLibrary } from '@engine/csd/CsdPlayer';
import type { Stage } from '@engine/stage/Stage';
import type { BulletHitFxDefine } from '../define/BulletDefine';

interface Playing {
  inst: CsdInstance;
}

export class BulletHitFx {
  private active = new Map<string, Playing>();
  private playing = new Set<CsdInstance>();

  constructor(
    private readonly lib: CsdLibrary,
    private readonly stage: Stage,
    private readonly layer: THREE.Group,
    _actions?: ActionManager,
  ) {}

  play(seat: number, world: THREE.Vector3, fx: BulletHitFxDefine | undefined): void {
    if (!fx || !this.lib.get(fx.csd)) return;
    const key = `${seat}:${fx.csd}`;
    const old = this.active.get(key);
    if (old) this.remove(old.inst);
    const inst = this.lib.create(fx.csd);
    const d = this.stage.worldToDesign(world);
    inst.root.position.set(d.x, d.y, 4);
    inst.root.scale.setScalar(this.stage.pixelsPerUnit(world) * fx.scale);
    inst.root.renderOrder = 4;
    this.layer.add(inst.root);
    const entry = { inst };
    this.active.set(key, entry);
    this.playing.add(inst);
    inst.play(inst.animations[0], false, () => {
      if (this.active.get(key) === entry) this.active.delete(key);
      this.remove(inst);
    });
  }

  private remove(inst: CsdInstance): void {
    this.playing.delete(inst);
    inst.dispose();
  }

  update(dt: number): void {
    for (const inst of [...this.playing]) inst.update(dt);
  }
}
