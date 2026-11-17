/**
 * 砲台 — 對照原版 CannonView.lua + CannonSkinNormal.lua + CannonSkinLaser.lua
 *
 * - 多外觀：A（一般 / 鎖定）、B（榴彈）、C（雷擊）、C+D（紫雷擊）、E（雷射 + 無人機 ES）；依子彈類型切換
 * - 瞄準：angle = atan2(dx, dy)（自 +Y 順時針，度），clamp ±90，rotation.z = -angle
 * - 開火：播 Atk（鎖定類 LockedAtk）一次後回 Idle；砲口骨骼 GunFire 播開火特效
 * - 過熱：fireFactor += 0.05/發；停火 CoolDownTime 後若 > 0.4 播冷卻煙；再 0.15s 後以 1/s 衰減
 */
import * as THREE from 'three';
import { clamp, setCocosRotation } from '@core/math/cocos';
import { findCocosNode, instantiateC3b, sliceC3bClip, type C3bModelTemplate } from '@engine/loaders/C3bLoader';
import { CannonMaterial } from '@engine/materials/CannonMaterial';
import type { EfkHandle, EfkSystem } from '@engine/effekseer/EfkSystem';
import type { CannonSkinId } from '../define/BulletDefine';
import {
  CANNON_COOLDOWN_EFK_MIN_FACTOR,
  CANNON_FIRE_DECAY_DELAY,
  CANNON_FIRE_DECAY_PER_SEC,
  CANNON_FIRE_FACTOR_STEP,
  CANNON_LIMIT_ANGLE,
  type CannonSkinDefine,
} from '../define/CannonDefine';

export interface CannonSkinAssets {
  def: CannonSkinDefine;
  template: C3bModelTemplate;
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  matcap: THREE.Texture | null;
  fire: THREE.Texture | null;
  attached: C3bModelTemplate[];
}

interface SkinView {
  assets: CannonSkinAssets;
  sprite: THREE.Group;
  mixer: THREE.AnimationMixer;
  materials: CannonMaterial[];
  gunPoint: THREE.Object3D;
  idle: THREE.AnimationAction | null;
  atk: THREE.AnimationAction | null;
  lockedAtk: THREE.AnimationAction | null;
  extraMixers: THREE.AnimationMixer[];
}

export class Cannon {
  readonly node = new THREE.Group();
  /** 自 +Y 順時針角度（度） */
  angle = 0;
  private view: SkinView | null = null;
  private fireFactor = 0;
  private fireCount = 0;
  private sinceFire = Infinity;
  private coolDownPlayed = true;
  /** Duration -1 的開火特效（雷射）：同時只保留一個 */
  private loopEfk = new Map<string, EfkHandle>();

  constructor(
    readonly seat: number,
    private readonly skins: ReadonlyMap<CannonSkinId, CannonSkinAssets>,
    private readonly efk: EfkSystem,
    initial: CannonSkinId = 'Normal',
  ) {
    this.node.name = `Cannon_${seat}`;
    this.setSkin(initial);
  }

  get skinId(): CannonSkinId | null {
    return this.view?.assets.def.id ?? null;
  }

  /** 切換外觀（CannonView:ChangeSkin） */
  setSkin(id: CannonSkinId): void {
    if (this.view?.assets.def.id === id) return;
    const assets = this.skins.get(id) ?? this.skins.get('Normal');
    if (!assets) return;
    this.stopLoopEfk();
    if (this.view) {
      this.view.mixer.stopAllAction();
      this.view.sprite.removeFromParent();
      for (const m of this.view.materials) m.dispose();
    }
    this.view = this.buildView(assets);
    this.node.add(this.view.sprite);
    this.fireFactor = 0;
    this.fireCount = 0;
  }

  private buildView(assets: CannonSkinAssets): SkinView {
    const def = assets.def;
    const sprite = instantiateC3b(assets.template);
    setCocosRotation(sprite, def.spriteRot);
    const materials: CannonMaterial[] = [];
    sprite.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshBasicMaterial;
      const mat = new CannonMaterial(
        { map: assets.map ?? src.map, matcap: assets.matcap, normalMap: assets.normalMap, fire: assets.fire },
        !!mesh.geometry.getAttribute('tangent'),
      );
      mesh.material = mat;
      materials.push(mat);
    });
    const gunPoint = findCocosNode(sprite, def.gunPointBone) ?? sprite;
    const mixer = new THREE.AnimationMixer(sprite);
    const action = (key: 'Idle' | 'Atk' | 'LockedAtk', loop: boolean) => {
      const r = def.animations[key];
      const clip = sliceC3bClip(assets.template, key, r.start, r.end);
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      a.clampWhenFinished = !loop;
      return a;
    };
    const view: SkinView = {
      assets,
      sprite,
      mixer,
      materials,
      gunPoint,
      idle: action('Idle', true),
      atk: action('Atk', false),
      lockedAtk: action('LockedAtk', false),
      extraMixers: [],
    };
    view.idle?.play();
    mixer.addEventListener('finished', (e) => {
      if ((e.action === view.atk || e.action === view.lockedAtk) && view.idle) {
        e.action.stop();
        view.idle.reset().play();
      }
    });

    // 掛載物件（雷射無人機 ES）
    def.attached?.forEach((a, i) => {
      const tpl = assets.attached[i];
      if (!tpl) return;
      const obj = instantiateC3b(tpl);
      setCocosRotation(obj, a.rotation);
      obj.position.set(a.position.x, a.position.y, a.position.z);
      obj.scale.multiplyScalar(a.scale);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshBasicMaterial;
        const mat = new CannonMaterial({ map: src.map, matcap: assets.matcap, normalMap: null, fire: null }, false);
        mesh.material = mat;
        materials.push(mat);
      });
      (findCocosNode(sprite, a.bone) ?? sprite).add(obj);
      const clip = sliceC3bClip(tpl, 'Idle', a.idle.start, a.idle.end);
      if (clip) {
        const mx = new THREE.AnimationMixer(obj);
        mx.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
        view.extraMixers.push(mx);
      }
    });
    return view;
  }

  /** 瞄準地面上的點 */
  aimAt(target: { x: number; y: number }): void {
    const dx = target.x - this.node.position.x;
    const dy = target.y - this.node.position.y;
    if (dx * dx + dy * dy < 1e-6) return;
    this.setAngle((Math.atan2(dx, dy) * 180) / Math.PI);
  }

  setAngle(deg: number): void {
    this.angle = clamp(deg, -CANNON_LIMIT_ANGLE, CANNON_LIMIT_ANGLE);
    this.node.rotation.set(0, 0, (-this.angle * Math.PI) / 180);
  }

  /** 射擊方向（地面 XY 單位向量） */
  get direction(): { x: number; y: number } {
    const r = (this.angle * Math.PI) / 180;
    return { x: Math.sin(r), y: Math.cos(r) };
  }

  /** 砲口世界座標 */
  getMuzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.node.updateWorldMatrix(true, true);
    return (this.view?.gunPoint ?? this.node).getWorldPosition(out);
  }

  fire(locked = false): void {
    const v = this.view;
    if (!v) return;
    const anim = locked ? (v.lockedAtk ?? v.atk) : v.atk;
    if (anim) {
      v.idle?.stop();
      v.atk?.stop();
      v.lockedAtk?.stop();
      anim.reset().play();
    }
    const def = v.assets.def;
    for (const e of def.atkEfk) {
      if (e.condition && !e.condition(this.fireCount, this.fireFactor)) continue;
      const bone = findCocosNode(v.sprite, e.bone) ?? v.gunPoint;
      if ((e.efk.duration ?? 0) < 0) {
        // 常駐型（雷射）：已在播放就不重複
        if (this.loopEfk.get(e.efk.file)?.alive) continue;
        this.loopEfk.set(e.efk.file, this.efk.play(e.efk, bone));
      } else {
        this.efk.play(e.efk, bone);
      }
    }
    this.fireCount++;
    this.fireFactor = Math.min(def.overHopUpperBound, this.fireFactor + CANNON_FIRE_FACTOR_STEP);
    this.sinceFire = 0;
    this.coolDownPlayed = false;
  }

  /** 停止常駐開火特效（雷射光束結束時） */
  stopLoopEfk(): void {
    for (const h of this.loopEfk.values()) h.stop();
    this.loopEfk.clear();
  }

  update(dt: number): void {
    const v = this.view;
    if (!v) return;
    v.mixer.update(dt);
    for (const m of v.extraMixers) m.update(dt);
    const def = v.assets.def;
    this.sinceFire += dt;
    if (!this.coolDownPlayed && this.sinceFire >= def.coolDownTime) {
      this.coolDownPlayed = true;
      this.fireCount = 0;
      if (this.fireFactor > CANNON_COOLDOWN_EFK_MIN_FACTOR) {
        this.efk.play(def.coolDownEfk.efk, findCocosNode(v.sprite, def.coolDownEfk.bone) ?? v.gunPoint);
      }
    }
    if (this.sinceFire >= def.coolDownTime + CANNON_FIRE_DECAY_DELAY && this.fireFactor > 0) {
      this.fireFactor = Math.max(0, this.fireFactor - CANNON_FIRE_DECAY_PER_SEC * dt);
    }
    for (const m of v.materials) m.fireFactor = this.fireFactor;
  }
}
