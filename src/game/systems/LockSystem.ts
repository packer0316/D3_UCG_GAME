/**
 * 鎖定目標 — 翻譯自原版 BulletModel:LockFish、FishSystem:GetBestOddsFish、FishBase 點選射線、
 * BulletManager 準心（LockAim_Anim.csb）
 *
 * - 點選：相機射線 vs 魚 hitBox（OBB），多隻時取最高賠率；點到的魚優先
 * - 自動：目前目標還活著就保留；否則同種最近的魚；否則畫面內最高賠率（符合限制賠率）
 * - 準心：start（0–15）→ loop（20–80），每幀跟著魚的 lockPos；換目標播 L_4
 */
import * as THREE from 'three';
import { pointInPolygon } from '@core/math/geom2d';
import type { CsdInstance } from '@engine/csd/CsdPlayer';
import { WALL_POLYGON } from '../define/DisplayDefine';
import { LOCK_AIM_CSD, LOCK_CHANGE_SOUND } from '../define/SkillDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';
import type { Fish } from '../world/Fish';

export class LockSystem {
  target: Fish | null = null;
  /** 玩家點選的目標（優先） */
  byClick = false;
  /** 低於此賠率不能選（依子彈類型） */
  limitOdds = 0;
  private lastType = 0;
  private readonly lastPos = new THREE.Vector2();
  private reticle: CsdInstance | null = null;
  private odds = new Map<number, number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpBox = new THREE.Box3();
  private readonly tmpM = new THREE.Matrix4();

  constructor(private readonly ctx: GameContext) {
    for (const f of ctx.data.fishData.Fishes) this.odds.set(f.Data, f.Odds);
  }

  async preload(): Promise<void> {
    await this.ctx.csd.load(LOCK_AIM_CSD).catch((e) => console.warn('[LockSystem]', e));
  }

  init(): void {
    this.ctx.events.on('fish:remove', ({ serial }) => {
      if (this.target?.serial === serial) this.clear(true);
    });
  }

  oddsOf(fish: Fish): number {
    return this.odds.get(fish.type) ?? 0;
  }

  /** 可被選為目標：可命中、在畫面判定範圍內、賠率達標 */
  isSelectable(fish: Fish): boolean {
    if (!fish.hittable || fish.dying || !fish.sprite.visible || !fish.node.parent) return false;
    if (this.oddsOf(fish) < this.limitOdds) return false;
    return pointInPolygon({ x: fish.node.position.x, y: fish.node.position.y }, WALL_POLYGON);
  }

  private get fishSystem() {
    return this.ctx.services.get(Tokens.FishSystem);
  }

  /** FishSystem:GetBestOddsFish */
  pickBest(): Fish | null {
    let same: Fish | null = null;
    let sameDist = Infinity;
    let best: Fish | null = null;
    let bestOdds = -1;
    for (const f of this.fishSystem.hittable()) {
      if (!this.isSelectable(f)) continue;
      if (f.type === this.lastType) {
        const d = this.lastPos.distanceTo(new THREE.Vector2(f.node.position.x, f.node.position.y));
        if (d < sameDist) {
          sameDist = d;
          same = f;
        }
      }
      const o = this.oddsOf(f);
      if (o > bestOdds) {
        bestOdds = o;
        best = f;
      }
    }
    return same ?? best;
  }

  /** 設計座標點選：相機射線 vs 每隻魚的 hitBox，取最高賠率 */
  pickAt(designX: number, designY: number): Fish | null {
    const stage = this.ctx.stage;
    stage.camera.updateMatrixWorld();
    const ndc = new THREE.Vector2((designX / stage.designWidth) * 2 - 1, (designY / stage.designHeight) * 2 - 1);
    this.raycaster.setFromCamera(ndc, stage.camera);
    let best: Fish | null = null;
    let bestOdds = -1;
    for (const f of this.fishSystem.hittable()) {
      if (!this.isSelectable(f)) continue;
      f.node.updateWorldMatrix(true, false);
      const local = this.raycaster.ray.clone().applyMatrix4(this.tmpM.copy(f.node.matrixWorld).invert());
      if (!local.intersectsBox(f.getLocalHitBox(this.tmpBox))) continue;
      const o = this.oddsOf(f);
      if (o > bestOdds) {
        bestOdds = o;
        best = f;
      }
    }
    return best;
  }

  lock(fish: Fish, byClick: boolean): void {
    this.byClick = byClick;
    if (this.target === fish) return;
    this.target = fish;
    this.lastType = fish.type;
    this.ctx.audio.play(LOCK_CHANGE_SOUND);
    this.showReticle();
    this.ctx.events.emit('lock:change', { fish });
  }

  /** keepMemory：保留最後的魚種 / 位置（自動重選同種最近） */
  clear(keepMemory = false): void {
    if (this.target && keepMemory) {
      this.lastType = this.target.type;
      this.lastPos.set(this.target.node.position.x, this.target.node.position.y);
    }
    if (!this.target) return;
    this.target = null;
    this.byClick = false;
    if (this.reticle) this.reticle.root.visible = false;
    this.ctx.events.emit('lock:change', { fish: null });
  }

  /** 每次開砲前：失效的目標清掉；auto 時沒有目標就自動選 */
  ensureTarget(auto: boolean): Fish | null {
    if (this.target && !this.isSelectable(this.target)) this.clear(true);
    if (!this.target && auto) {
      const f = this.pickBest();
      if (f) this.lock(f, false);
    }
    return this.target;
  }

  private showReticle(): void {
    if (!this.reticle) {
      if (!this.ctx.csd.get(LOCK_AIM_CSD)) return;
      this.reticle = this.ctx.csd.create(LOCK_AIM_CSD);
      this.reticle.root.renderOrder = 2;
      this.ctx.layers.hitFx.add(this.reticle.root);
    }
    const r = this.reticle;
    r.root.visible = true;
    r.play('start', false, () => r.play('loop', true));
  }

  update(dt: number): void {
    if (!this.reticle || !this.target) return;
    const d = this.ctx.stage.worldToDesign(this.target.getLockPos());
    this.reticle.root.position.set(d.x, d.y, 2);
    this.reticle.update(dt);
  }
}
