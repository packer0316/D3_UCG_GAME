/**
 * 背景場景 — 對照原版 BGSceneLayer.lua / IrisChangeScene.lua / AzureDragonScene.lua
 *   bg3d:setRotation3D(define.Rotation or (90,0,0))   Y-up 模型 → Z-up 世界
 *   材質 ground.material：一般場景 technique "sceneTest"、天空 technique "skybox"（flowmap，SPEC §15.2）
 *   每種場景一個節點（m_sceneNodes），同時只有一個可見（KeepScenesSingle）
 *   ChangeScene：沒有上一個場景 → 直接顯示；否則圓形擴散轉場（舊場景淡出、新場景淡入，2 秒）
 *   天空是相機前方的背景板：最先畫、不寫深度；轉場時不套 Iris、整段可見（SPEC §15.3）
 */
import * as THREE from 'three';
import { setCocosRotation } from '@core/math/cocos';
import { Act } from '@core/tween/Action';
import type { ActionManager } from '@core/tween/ActionManager';
import { instantiateC3b } from '@engine/loaders/C3bLoader';
import type { AssetManager } from '@engine/assets/AssetManager';
import { SceneMaterial } from '@engine/materials/SceneMaterial';
import { IRIS_TRANSITION, SCENE_DEFINES, SceneType, type SceneDefine } from '../define/SceneDefine';

interface SceneNode {
  type: number;
  root: THREE.Group;
  materials: SceneMaterial[];
  /** 天空背景（不套 Iris） */
  isSky: boolean;
}

export class BGScene {
  private nodes = new Map<number, SceneNode>();
  private currentType: number = SceneType.NONE;
  /** 進行中的轉場：再次切換時直接結束 */
  private finishTransition: (() => void) | null = null;
  /** 天空 flowmap 時間（CC_Time.g） */
  private time = 0;

  constructor(
    private readonly assets: AssetManager,
    private readonly layer: THREE.Group,
    private readonly actions: ActionManager,
  ) {}

  get sceneType(): number {
    return this.currentType;
  }

  get define(): SceneDefine | null {
    return SCENE_DEFINES[this.currentType] ?? null;
  }

  /** 預載模型（切換時不必等下載） */
  preload(types: readonly number[]): Promise<unknown> {
    return Promise.all(
      types.flatMap((t) => {
        const def = SCENE_DEFINES[t];
        if (!def) return [];
        return def.sky ? [this.assets.model(def.model), this.assets.texture(def.sky.flowMap)] : [this.assets.model(def.model)];
      }),
    );
  }

  /** BGSceneLayer:ChangeScene；回傳新場景設定（未定義的場景回傳 null、不切換） */
  async change(sceneType: number): Promise<SceneDefine | null> {
    const def = SCENE_DEFINES[sceneType];
    if (!def || sceneType === this.currentType) return def ?? null;
    this.finishTransition?.();
    const prev = this.nodes.get(this.currentType) ?? null;
    this.currentType = sceneType;
    const next = await this.getScene(def);
    // 等模型時又被切到別的場景
    if (this.currentType !== sceneType) return def;
    if (!prev) {
      this.keepSingle(sceneType);
      return def;
    }
    next.root.visible = false;
    this.iris(prev, next);
    return def;
  }

  /** 天空 flowmap 時間推進（只有可見的天空需要） */
  update(dt: number): void {
    this.time += dt;
    for (const n of this.nodes.values()) {
      if (!n.isSky || !n.root.visible) continue;
      for (const m of n.materials) m.time = this.time;
    }
  }

  /** BGSceneLayer:CreateScene */
  private async getScene(def: SceneDefine): Promise<SceneNode> {
    const cached = this.nodes.get(def.type);
    if (cached) return cached;
    const [tpl, flowMap] = await Promise.all([
      this.assets.model(def.model),
      def.sky ? this.assets.texture(def.sky.flowMap) : Promise.resolve(null),
    ]);
    const existing = this.nodes.get(def.type);
    if (existing) return existing;
    if (flowMap && flowMap.wrapS !== THREE.RepeatWrapping) {
      // AzureDragonScene：setTexParameters(LINEAR, LINEAR, REPEAT, REPEAT)
      flowMap.wrapS = flowMap.wrapT = THREE.RepeatWrapping;
      flowMap.needsUpdate = true;
    }
    const isSky = !!def.sky;
    const root = instantiateC3b(tpl);
    setCocosRotation(root, def.rotation ?? { x: 90, y: 0, z: 0 });
    const materials: SceneMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshBasicMaterial;
      const mat = new SceneMaterial(src.map ?? null, def.sky ? { flowMap, switchVal: def.sky.switchVal } : {});
      if (isSky) {
        // 背景板：最先畫、不寫深度，地面場景轉場時可直接蓋在上面
        mat.depthWrite = false;
        mesh.renderOrder = -2;
        mesh.frustumCulled = false;
      } else {
        mesh.renderOrder = -1;
      }
      mesh.material = mat;
      materials.push(mat);
    });
    root.name = `scene_${def.type}`;
    root.visible = false;
    this.layer.add(root);
    const node: SceneNode = { type: def.type, root, materials, isSky };
    this.nodes.set(def.type, node);
    return node;
  }

  /** 保持同一時間只有一個場景可見 */
  private keepSingle(visibleType: number): void {
    for (const [type, n] of this.nodes) n.root.visible = type === visibleType;
  }

  /**
   * IrisChangeScene:Change：舊場景 u_mul = -1 淡出、新場景 u_mul = 1 淡入，u_progress 0 → 1。
   * 天空不套 Iris（距離都超過 range，套了會整段看不到 / 不消失）：在背景整段可見，結束時才隱藏。
   */
  private iris(prev: SceneNode, next: SceneNode): void {
    const { range, center, boardAddColor, fadeTime } = IRIS_TRANSITION;
    const fading: SceneMaterial[] = [];
    for (const [node, mul] of [
      [prev, -1],
      [next, 1],
    ] as const) {
      node.root.visible = true;
      if (node.isSky) continue;
      for (const m of node.materials) {
        m.setIris(mul, range, center, boardAddColor);
        fading.push(m);
      }
    }
    const setProgress = (t: number) => {
      for (const m of fading) m.progress = t;
    };
    const finish = () => {
      if (this.finishTransition !== finish) return;
      this.finishTransition = null;
      this.actions.stopAll(this);
      setProgress(1);
      for (const m of fading) m.mul = 1;
      prev.root.visible = false;
      next.root.visible = true;
      this.keepSingle(this.currentType);
    };
    this.finishTransition = finish;
    this.actions.run(
      Act.seq(
        Act.tween(fadeTime, () => setProgress),
        Act.call(finish),
      ),
      this,
    );
  }
}
