/**
 * 魚（龍）— 對照原版 FishBase.lua + FishSpriteBase.lua + PathMove.lua + FishBody.lua
 *
 * 節點結構：
 *   node（FishBase）    位置 = 路徑 (x,y,0)、rotation.z = 朝向、scale = spriteScale × 3
 *   └─ sprite（Sprite3D）rotation = spriteRot（預設 90,0,180）、position = spriteOffset
 *      ├─ SkinnedMesh(es)  FishMaterial
 *      └─ shadow mesh(es)  PlanarShadowMaterial（共用 geometry / skeleton）
 *   └─ plugin nodes（Boss_Mark 等）
 */
import * as THREE from 'three';
import { setCocosRotation, type Vec2 } from '@core/math/cocos';
import { makeOBB, type OBB2 } from '@core/math/geom2d';
import { instantiateC3b, presetSkinnedBounds, sliceC3bClip, type C3bModelTemplate } from '@engine/loaders/C3bLoader';
import { FishMaterial, FISH_BLEACH_DEFAULT } from '@engine/materials/FishMaterial';
import { PlanarShadowMaterial } from '@engine/materials/ShadowMaterial';
import type { FishDefine } from '../define/FishDefine';
import type { PathTrack } from '../path/PathTrack';
import type { TimelineFish } from '../timeline/FishTimeline';

export const FISH_NODE_SCALE = 3; // 原版：加入場景的龍都會放大 3 倍
/** 不可選取時的不透明度（FishBase:SetUnSelectable 預設 70） */
export const UNSELECTABLE_OPACITY = 70;

export interface FishInit {
  info: TimelineFish;
  define: FishDefine;
  template: C3bModelTemplate;
  texture: THREE.Texture | null;
  plugins: C3bModelTemplate[];
  track: PathTrack;
  shadowColor: [number, number, number];
  /** 生成時已經走了幾秒 */
  elapsed: number;
  fromScratch: boolean;
}

/** 依魚種快取：sprite 在魚節點本地座標的 XY 範圍（未乘節點縮放） */
const footprintCache = new Map<number, { w: number; h: number; center: THREE.Vector3; height: number }>();

export class Fish {
  readonly serial: number;
  readonly groupIndex: number;
  readonly fishIndex: number;
  readonly type: number;
  readonly define: FishDefine;
  readonly node = new THREE.Group();
  readonly sprite: THREE.Group;
  readonly materials: FishMaterial[] = [];
  readonly shadowMaterials: PlanarShadowMaterial[] = [];
  readonly mixer: THREE.AnimationMixer;
  readonly track: PathTrack;
  readonly addTime: number;
  readonly fromScratch: boolean;

  /** 可被子彈命中 */
  hittable = true;
  /** 由 FishFactory 注入的回呼（避免魚直接依賴 context） */
  hooks: { onBossComing?: (fish: Fish) => void } = {};
  /** 死亡表演中（路徑停止） */
  dying = false;
  pathTime = 0;

  private template: C3bModelTemplate;
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnim = '';
  private lastPos: Vec2;
  private readonly pos: Vec2 = { x: 0, y: 0 };
  private footprint: { w: number; h: number; center: THREE.Vector3; height: number };
  private pluginMixers: THREE.AnimationMixer[] = [];
  /** 給子類別：wait marker 處理 */
  protected nextMarker = 0;
  readonly spriteHome = new THREE.Vector3();

  constructor(init: FishInit) {
    const { info, define, template } = init;
    this.serial = info.serial;
    this.groupIndex = info.groupIndex;
    this.fishIndex = info.fishIndex;
    this.type = info.fishType;
    this.define = define;
    this.template = template;
    this.track = init.track;
    this.addTime = info.addTime;
    this.fromScratch = init.fromScratch;
    this.node.name = `Fish_${this.serial}`;
    this.node.userData.fish = this;

    const m = define.model;
    // ---- sprite（Cocos FishSpriteBase:InitModelSetting）
    this.sprite = instantiateC3b(template);
    setCocosRotation(this.sprite, m.spriteRot ?? { x: 90, y: 0, z: 180 });
    const off = m.spriteOffset ?? { x: 0, y: 0, z: 0 };
    this.sprite.position.set(off.x, off.y, off.z);
    this.spriteHome.copy(this.sprite.position);
    this.node.add(this.sprite);

    // ---- 材質 + 陰影
    const bleach = define.bleach ?? FISH_BLEACH_DEFAULT;
    const meshes: THREE.Mesh[] = [];
    this.sprite.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const mesh of meshes) {
      const cocosName = mesh.userData.cocosName as string;
      if (m.preserveMeshes && !m.preserveMeshes.includes(cocosName)) {
        mesh.visible = false;
        continue;
      }
      const origMap = (mesh.material as THREE.MeshBasicMaterial).map ?? null;
      const mat = new FishMaterial(init.texture ?? origMap);
      mat.setBleachParams(bleach.pow, bleach.scalar);
      mesh.material = mat;
      this.materials.push(mat);

      const shadowMat = new PlanarShadowMaterial(init.shadowColor);
      this.shadowMaterials.push(shadowMat);
      let shadow: THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = mesh as THREE.SkinnedMesh;
        const s = new THREE.SkinnedMesh(sk.geometry, shadowMat);
        s.bindMode = THREE.AttachedBindMode;
        s.bind(sk.skeleton, sk.bindMatrix);
        presetSkinnedBounds(s);
        shadow = s;
      } else {
        shadow = new THREE.Mesh(mesh.geometry, shadowMat);
        shadow.position.copy(mesh.position);
        shadow.quaternion.copy(mesh.quaternion);
        shadow.scale.copy(mesh.scale);
      }
      shadow.name = mesh.name + '_shadow';
      shadow.frustumCulled = false;
      shadow.renderOrder = 1;
      mesh.parent!.add(shadow);
    }

    this.node.scale.setScalar(m.spriteScale * FISH_NODE_SCALE);

    // ---- 外掛節點（FishBase:AttachPlugin）
    m.pluginNodes?.forEach((p, i) => {
      const tpl = init.plugins[i];
      if (!tpl) return;
      const plugin = instantiateC3b(tpl);
      plugin.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const src = mesh.material as THREE.MeshBasicMaterial;
          mesh.material = new THREE.MeshBasicMaterial({ map: src.map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
          mesh.renderOrder = 2;
        }
      });
      setCocosRotation(plugin, p.rotation);
      plugin.position.set(p.offset.x, p.offset.y, p.offset.z);
      plugin.scale.setScalar(p.scale);
      const bone = p.attachBone && p.attachBone !== 'None' ? this.sprite.getObjectByName(p.attachBone) : null;
      (bone ?? this.node).add(plugin);
      if (p.animation) {
        const clip = sliceC3bClip(tpl, 'Act1', p.animation.start, p.animation.end);
        if (clip) {
          const mx = new THREE.AnimationMixer(plugin);
          mx.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(p.animationSpeed ?? 1).play();
          this.pluginMixers.push(mx);
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(this.sprite);
    this.footprint = this.computeFootprint();

    // ---- 初始位置 / 朝向（PathMoveNormal:RunMovPathAct）
    this.pathTime = init.elapsed;
    this.track.evaluate(this.pathTime, this.pos);
    this.node.position.set(this.pos.x, this.pos.y, 0);
    // 晚加入時用前一點推算朝向，避免第一幀朝向錯誤
    const prev = this.track.evaluate(Math.max(0, this.pathTime - 0.05), { x: 0, y: 0 });
    this.lastPos = prev;
    this.updateHeading();
  }

  /**
   * 建構完成後由 FishFactory 呼叫（避免在父類別建構子內呼叫子類別覆寫的方法）：
   * 播放跑步動畫，並快轉到目前時間點的 WaitAction 狀態。
   */
  start(): void {
    this.playRunAnimation();
    this.nextMarker = 0;
    this.processMarkers(this.pathTime, true);
  }

  // ------------------------------------------------------------------
  // 動畫（Sprite3DBase:PlayAnims）
  // ------------------------------------------------------------------

  playAnim(name: string, loop = true, speed = 1): boolean {
    const range = this.define.model.animations[name];
    if (!range) return false;
    const clip = sliceC3bClip(this.template, name, range.start, range.end);
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    if (this.currentAction && this.currentAction !== action) this.currentAction.stop();
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.setEffectiveTimeScale(speed * (range.speed ?? 1));
    action.play();
    this.currentAction = action;
    this.currentAnim = name;
    return true;
  }

  get animName(): string {
    return this.currentAnim;
  }

  /** 原版 PlayRunAnimation：RunAnimation 隨機挑一個 loop */
  playRunAnimation(speed = 1): void {
    const list = this.define.model.runAnimation;
    const name = list[Math.floor(Math.random() * list.length)];
    this.playAnim(name, true, speed);
  }

  // ------------------------------------------------------------------
  // 路徑（PathMoveNormal）
  // ------------------------------------------------------------------

  /** 由 FishSystem 每幀以群組時鐘驅動 */
  setPathTime(t: number): void {
    if (this.dying) return;
    const prev = this.pathTime;
    this.pathTime = t;
    this.track.evaluate(t, this.pos);
    this.node.position.x = this.pos.x;
    this.node.position.y = this.pos.y;
    this.node.position.z = 0;
    this.updateHeading();
    if (t > prev) this.processMarkers(t, false);
  }

  /** PathMoveNormal:UpdateTransform：逐幀位移方向；|dir|² ≤ 0.001 不轉也不更新 lastPos */
  private updateHeading(): void {
    const dx = this.pos.x - this.lastPos.x;
    const dy = this.pos.y - this.lastPos.y;
    if (dx * dx + dy * dy <= 0.001) return;
    this.node.rotation.set(0, 0, -Math.atan2(dx, dy));
    this.lastPos.x = this.pos.x;
    this.lastPos.y = this.pos.y;
  }

  /** WaitAction：wait == checkTime 時，開始播 ani、結束播 nextAni（PathMove CreateWaitAnimAct） */
  private processMarkers(t: number, silent: boolean): void {
    const markers = this.track.markers;
    const waitAction = this.define.common.waitAction;
    while (this.nextMarker < markers.length && markers[this.nextMarker].time <= t) {
      const mk = markers[this.nextMarker++];
      if (!waitAction) continue;
      for (const w of Object.values(waitAction)) {
        if (w.checkTime !== mk.wait) continue;
        const anim = mk.kind === 'waitStart' ? w.ani : w.nextAni;
        if (anim) this.onWaitAnim(anim, silent);
      }
    }
  }

  /** 子類別覆寫（例如 TRex：Reset 隱藏、Declare 開始走路） */
  protected onWaitAnim(anim: string, _silent: boolean): void {
    this.playAnim(anim, true, 1);
  }

  // ------------------------------------------------------------------
  // 每幀
  // ------------------------------------------------------------------

  update(dt: number): void {
    this.mixer.update(dt);
    for (const m of this.pluginMixers) m.update(dt);
  }

  // ------------------------------------------------------------------
  // 外觀
  // ------------------------------------------------------------------

  set alpha(a: number) {
    for (const m of this.materials) m.alpha = a;
    for (const s of this.shadowMaterials) s.opacityFactor = a;
  }

  set bleachRate(r: number) {
    for (const m of this.materials) m.bleachRate = r;
  }

  /** 不可選取（低於目前砲種的限制賠率）：半透明 */
  unselectable = false;

  /**
   * FishBase:SetUnSelectable：不可選取時不透明度預設 70（/255），可選取時 255。
   * 只改魚身（含陰影，跟著 u_color.a），外掛節點（Boss_Mark）不變；死亡表演中不覆寫。
   */
  setUnSelectable(v: boolean, opacity = UNSELECTABLE_OPACITY): void {
    this.unselectable = v;
    if (this.dying) return;
    this.alpha = v ? opacity / 255 : 1;
  }

  setVisible(v: boolean): void {
    this.sprite.visible = v;
  }

  // ------------------------------------------------------------------
  // 碰撞 / 位置
  // ------------------------------------------------------------------

  /** 模型在魚節點本地座標的範圍（原版 Sprite contentSize） */
  private computeFootprint() {
    const cached = footprintCache.get(this.type);
    if (cached) return cached;
    const saved = { p: this.node.position.clone(), r: this.node.rotation.clone(), s: this.node.scale.clone() };
    this.node.position.set(0, 0, 0);
    this.node.rotation.set(0, 0, 0);
    this.node.scale.set(1, 1, 1);
    this.node.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    this.sprite.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || mesh.renderOrder === 1) return;
      // c3b 多個 part 共用同一份頂點資料、各自有骨骼表：只能走「本 part 有索引到的頂點」，
      // 否則其他 part 的骨骼索引會超出本 part 的骨架範圍（three 的 computeBoundingBox 會走全部頂點）
      const index = mesh.geometry.index;
      if (!index) return;
      const seen = new Uint8Array(mesh.geometry.getAttribute('position').count);
      for (let i = 0; i < index.count; i++) {
        const vi = index.getX(i);
        if (seen[vi]) continue;
        seen[vi] = 1;
        mesh.getVertexPosition(vi, v);
        box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
      }
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
    this.node.position.copy(saved.p);
    this.node.rotation.copy(saved.r);
    this.node.scale.copy(saved.s);
    const size = box.getSize(new THREE.Vector3());
    const fp = { w: size.x, h: size.y, center: box.getCenter(new THREE.Vector3()), height: size.z };
    footprintCache.set(this.type, fp);
    return fp;
  }

  /** 地面 XY 的碰撞盒（原版 PhysicsBody box：中心 = 節點位置，大小 = contentSize × ColliderScale × 節點縮放） */
  getOBB(groundCenter?: Vec2): OBB2 {
    const cs = this.define.model.colliderScale ?? { x: 1, y: 1 };
    const s = this.node.scale.x;
    const cx = groundCenter?.x ?? this.node.position.x;
    const cy = groundCenter?.y ?? this.node.position.y;
    return makeOBB(cx, cy, this.footprint.w * cs.x * s, this.footprint.h * cs.y * s, this.node.rotation.z);
  }

  /** hitBox 中心的世界座標（原版 getLockPos，用於跳字位置） */
  getLockPos(out = new THREE.Vector3()): THREE.Vector3 {
    const hb = this.define.model.hitBox;
    if (hb) out.set(hb.offset?.x ?? 0, hb.offset?.y ?? 0, hb.offset?.z ?? 0);
    else out.set(0, 0, this.footprint.height / 2);
    this.node.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.node.matrixWorld);
  }

  /** 點選用的 3D 盒子（魚節點本地座標；原版 FishHitBox：HitBox.Scale / Offset，沒設定則用模型範圍） */
  getLocalHitBox(out = new THREE.Box3()): THREE.Box3 {
    const hb = this.define.model.hitBox;
    if (hb) {
      const c = new THREE.Vector3(hb.offset?.x ?? 0, hb.offset?.y ?? 0, hb.offset?.z ?? 0);
      const s = new THREE.Vector3(hb.scale.x, hb.scale.y, hb.scale.z);
      return out.setFromCenterAndSize(c, s);
    }
    const fp = this.footprint;
    return out.setFromCenterAndSize(fp.center, new THREE.Vector3(fp.w, fp.h, fp.height));
  }

  /** 雷擊命中後的延遲死亡（被雷擊打死的魚依距離依序死亡） */
  private killDelay = 0;
  private killDelayAt = 0;

  setKillDelay(seconds: number): void {
    this.killDelay = seconds;
    this.killDelayAt = performance.now();
  }

  /** 取出並清除延遲（2 秒內有效） */
  consumeKillDelay(): number {
    const d = performance.now() - this.killDelayAt < 2000 ? this.killDelay : 0;
    this.killDelay = 0;
    return d;
  }

  get isFlying(): boolean {
    return !!this.define.model.isFlying;
  }

  destroy(): void {
    this.mixer.stopAllAction();
    this.node.removeFromParent();
    for (const m of this.materials) m.dispose();
    for (const m of this.shadowMaterials) m.dispose();
    this.node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial) mesh.material.dispose();
    });
  }
}
