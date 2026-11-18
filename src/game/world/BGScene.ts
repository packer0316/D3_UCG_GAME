/**
 * 背景場景 — 對照原版 BGSceneLayer.lua / IrisChangeScene.lua / AzureDragonScene.lua，
 * 殭屍專案 GameScenePrison / GameSceneCemetery（SPEC §16）
 *   bg3d:setRotation3D(define.Rotation or (90,0,0))   Y-up 模型 → Z-up 世界；define.Scale（殭屍場景 0.1）
 *   材質 ground.material：一般場景 technique "sceneTest"、天空 "skybox"（flowmap，SPEC §15.2）、
 *        殭屍場景指定 mesh 換成 PrisonScene / CemeteryScene（SPEC §16.2），其餘 mesh 與掛件維持 sceneTest
 *   每種場景一個節點（m_sceneNodes），同時只有一個可見（KeepScenesSingle）
 *   ChangeScene：沒有上一個場景 → 直接顯示；否則圓形擴散轉場（2 秒，SPEC §15.3 / §16.4）
 *   天空是相機前方的背景板：最先畫、不寫深度；轉場時不套 Iris、整段可見（SPEC §15.3）
 *   程序化場景（define.procedural，SPEC §18）：不載 c3b，由 scenes/ 的建構函式產生；預載時就建好（含烘焙貼圖）
 */
import * as THREE from 'three';
import { setCocosRotation } from '@core/math/cocos';
import { Act } from '@core/tween/Action';
import type { ActionManager } from '@core/tween/ActionManager';
import { findCocosNode, instantiateC3b, sliceC3bClip, type C3bModelTemplate } from '@engine/loaders/C3bLoader';
import type { AssetManager } from '@engine/assets/AssetManager';
import { SceneMaterial } from '@engine/materials/SceneMaterial';
import type { IrisSceneMaterial } from './scenes/ProcMaterial';
import { getProceduralSceneBuilder, type ProceduralScene } from './scenes/ProceduralScene';
import './scenes';
import type { RenderPass, Stage } from '@engine/stage/Stage';
import {
  IRIS_TRANSITION,
  SCENE_DEFINES,
  SceneType,
  evalMoonSwitch,
  type FrameRange,
  type SceneDefine,
} from '../define/SceneDefine';

/** 繪製順序：天空背景 → 場景（之後才是魚 / 子彈 / 砲台，renderOrder 0） */
const RenderOrder = { sky: -2, scene: -1 } as const;

export interface SceneChangeOptions {
  /** Iris 範圍（view space 距離，依新場景的相機）；省略 = IRIS_TRANSITION.range */
  irisRange?: number;
  /** 換相機前的相機快照：轉場中舊場景用它畫（省略 = 目前相機） */
  prevCamera?: THREE.Camera | null;
}

interface SceneNode {
  type: number;
  def: SceneDefine;
  root: THREE.Group;
  materials: IrisSceneMaterial[];
  /** 程序化場景（每幀 update） */
  proc?: ProceduralScene;
  /** 天空背景（不套 Iris） */
  isSky: boolean;
  /** 進場後經過秒數（墓地紅月） */
  elapsed: number;
}

/** 場景 + 掛件用到的所有資源路徑 */
function scenePaths(def: SceneDefine): { models: string[]; textures: string[] } {
  const models = [...(def.model ? [def.model] : []), ...(def.attachments ?? []).map((a) => a.model)];
  const textures = [
    ...(def.sky ? [def.sky.flowMap] : []),
    ...Object.values(def.shader?.textures ?? {}).map((t) => t.path),
  ];
  return { models: [...new Set(models)], textures };
}

/** 靜態姿勢：切出影格範圍、停在最後一格（Sprite3DBase:PlayAnim(key, false) 播完的樣子） */
function applyPose(obj: THREE.Object3D, tpl: C3bModelTemplate, pose: FrameRange): void {
  const clip = sliceC3bClip(tpl, `pose_${pose.start}_${pose.end}`, pose.start, pose.end);
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(obj);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(clip.duration);
}

export class BGScene {
  private nodes = new Map<number, SceneNode>();
  private proceduralLoads = new Map<number, Promise<SceneNode>>();
  private currentType: number = SceneType.NONE;
  /** 進行中的轉場：再次切換時直接結束 */
  private finishTransition: (() => void) | null = null;
  /** 場景 shader 時間（CC_Time，秒） */
  private time = 0;
  /** 轉場中的舊場景：移到這裡，在主場景之前用舊相機畫（見 iris） */
  private readonly prevScene = new THREE.Scene();
  private prevCamera: THREE.Camera | null = null;
  private readonly prevPass: RenderPass;
  /** 程序化場景烘焙貼圖用 */
  private readonly renderer: THREE.WebGLRenderer;

  constructor(
    private readonly assets: AssetManager,
    private readonly layer: THREE.Group,
    private readonly actions: ActionManager,
    stage: Stage,
  ) {
    this.renderer = stage.renderer;
    // World3D（order 100）之前：畫舊場景 → 清深度，新場景在主場景裡蓋上去
    this.prevPass = {
      id: 'bg-prev-scene',
      order: 90,
      enabled: false,
      render: (s) => {
        s.renderer.render(this.prevScene, this.prevCamera ?? s.camera);
        // 最後一個材質可能關了深度寫入：clear 前先打開 depth mask
        s.renderer.state.buffers.depth.setMask(true);
        s.renderer.clearDepth();
      },
    };
    stage.addPass(this.prevPass);
  }

  get sceneType(): number {
    return this.currentType;
  }

  get define(): SceneDefine | null {
    return SCENE_DEFINES[this.currentType] ?? null;
  }

  /** 預載模型與貼圖（切換時不必等下載） */
  preload(types: readonly number[]): Promise<unknown> {
    return Promise.all(
      types.flatMap((t): Promise<unknown>[] => {
        const def = SCENE_DEFINES[t];
        if (!def) return [];
        // 程序化場景：現在就建好（烘焙貼圖、產生地形），切換時不卡
        if (def.procedural) return [this.getScene(def)];
        const { models, textures } = scenePaths(def);
        return [...models.map((m) => this.assets.model(m)), ...textures.map((p) => this.assets.texture(p))];
      }),
    );
  }

  /** BGSceneLayer:ChangeScene；回傳新場景設定（未定義的場景回傳 null、不切換） */
  async change(sceneType: number, opts: SceneChangeOptions = {}): Promise<SceneDefine | null> {
    const def = SCENE_DEFINES[sceneType];
    if (!def || sceneType === this.currentType) return def ?? null;
    this.finishTransition?.();
    const prev = this.nodes.get(this.currentType) ?? null;
    this.currentType = sceneType;
    const next = await this.getScene(def);
    // 等模型時又被切到別的場景
    if (this.currentType !== sceneType) return def;
    this.onSceneEnter(next);
    if (!prev) {
      this.keepSingle(sceneType);
      return def;
    }
    next.root.visible = false;
    this.iris(prev, next, opts.irisRange ?? IRIS_TRANSITION.range, opts.prevCamera ?? null);
    return def;
  }

  /** shader 時間推進（只更新可見場景的動態材質）、墓地紅月時間軸 */
  update(dt: number): void {
    this.time += dt;
    for (const n of this.nodes.values()) {
      if (!n.root.visible) continue;
      n.elapsed += dt;
      n.proc?.update?.(this.time, dt);
      const moon = n.def.moonSwitch ? evalMoonSwitch(n.def.moonSwitch, n.elapsed) : null;
      for (const m of n.materials) {
        if (!m.animated) continue;
        m.time = this.time;
        if (moon !== null) m.setScalar('Moon_Switch', moon);
      }
    }
  }

  /** GameSceneXXX:OnSceneEnter：每次轉到該場景都重來（墓地紅月從頭演） */
  private onSceneEnter(node: SceneNode): void {
    node.elapsed = 0;
  }

  /** BGSceneLayer:CreateScene */
  private async getScene(def: SceneDefine): Promise<SceneNode> {
    const cached = this.nodes.get(def.type);
    if (cached) return cached;
    if (def.procedural) return this.buildProcedural(def);
    const { models, textures } = scenePaths(def);
    const [tpls, texs] = await Promise.all([
      Promise.all(models.map((m) => this.assets.model(m))),
      Promise.all(textures.map((p) => this.assets.texture(p))),
    ]);
    const existing = this.nodes.get(def.type);
    if (existing) return existing;
    const tplOf = new Map(models.map((m, i) => [m, tpls[i]] as const));
    const texOf = new Map(textures.map((p, i) => [p, texs[i]] as const));

    const flowMap = def.sky ? texOf.get(def.sky.flowMap)! : null;
    if (flowMap) {
      // AzureDragonScene：setTexParameters(LINEAR, LINEAR, REPEAT, REPEAT)
      this.setWrap(flowMap, THREE.RepeatWrapping);
    }
    // 殭屍場景 shader 的額外貼圖（GameScenePrison / GameSceneCemetery:InitShaderShow）
    const shaderTextures: Record<string, THREE.Texture> = {};
    for (const [name, t] of Object.entries(def.shader?.textures ?? {})) {
      const tex = texOf.get(t.path)!;
      this.setWrap(tex, t.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
      shaderTextures[name] = tex;
    }

    const isSky = !!def.sky;
    const tpl = tplOf.get(def.model!)!;
    const root = instantiateC3b(tpl);
    setCocosRotation(root, def.rotation ?? { x: 90, y: 0, z: 0 });
    // BGSceneLayer:CreateScene → setScale(define.Scale)：覆寫 c3b 節點帶給根節點的縮放
    if (def.scale !== undefined) root.scale.setScalar(def.scale);
    if (def.pose) applyPose(root, tpl, def.pose);

    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    // 殭屍場景 shader 套用的 mesh：LightMeshNames，都找不到就用第 0 個
    const shaderMeshes = new Set<THREE.Mesh>();
    if (def.shader) {
      for (const name of def.shader.meshNames) {
        const hit = findCocosNode(root, name);
        hit?.traverse((o) => (o as THREE.Mesh).isMesh && shaderMeshes.add(o as THREE.Mesh));
      }
      if (shaderMeshes.size === 0 && meshes[0]) shaderMeshes.add(meshes[0]);
    }

    const materials: SceneMaterial[] = [];
    for (const mesh of meshes) {
      const map = (mesh.material as THREE.MeshBasicMaterial).map ?? null;
      let mat: SceneMaterial;
      if (def.sky) {
        mat = new SceneMaterial(map, { kind: 'flow', flowMap, switchVal: def.sky.switchVal });
      } else if (def.shader && shaderMeshes.has(mesh)) {
        mat = new SceneMaterial(map, { kind: def.shader.kind, textures: shaderTextures, vec4: def.shader.uniforms });
      } else {
        mat = new SceneMaterial(map);
      }
      this.setupSceneMesh(mesh, mat, isSky);
      materials.push(mat);
    }

    // 掛件（GameScenePrison:AddExtensionModel）：一般場景材質，一起參與 Iris
    for (const a of def.attachments ?? []) {
      const atpl = tplOf.get(a.model)!;
      const parents = a.bones ? a.bones.map((b) => findCocosNode(root, b)) : [root];
      parents.forEach((parent, i) => {
        if (!parent) {
          console.warn(`[BGScene] ${def.name}: attach bone ${a.bones?.[i]} not found`);
          return;
        }
        const inst = instantiateC3b(atpl);
        // CreateExtensionModel：setRotation3D / setScale(model.Scale) 一律覆寫（Break_wall.c3b 節點自帶縮放 100）
        setCocosRotation(inst, a.rotation ?? { x: 0, y: 0, z: 0 });
        inst.scale.setScalar(a.scale ?? 1);
        if (a.pose) applyPose(inst, atpl, a.pose);
        inst.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = new SceneMaterial((mesh.material as THREE.MeshBasicMaterial).map ?? null);
          this.setupSceneMesh(mesh, mat, false);
          materials.push(mat);
        });
        parent.add(inst);
      });
    }

    root.name = `scene_${def.type}`;
    root.visible = false;
    this.layer.add(root);
    const node: SceneNode = { type: def.type, def, root, materials, isSky, elapsed: 0 };
    this.nodes.set(def.type, node);
    return node;
  }

  /** 程序化場景（SPEC §18）：根節點已經是世界座標（Z 朝上），繪製順序由場景自己決定 */
  private buildProcedural(def: SceneDefine): Promise<SceneNode> {
    const pending = this.proceduralLoads.get(def.type);
    if (pending) return pending;
    const build = getProceduralSceneBuilder(def.procedural!);
    if (!build) throw new Error(`[BGScene] 程序化場景 "${def.procedural}" 沒有註冊`);
    // Preload and an early scene switch can ask for the same asynchronous assets.
    const task = Promise.resolve(build({ renderer: this.renderer })).then(proc => {
      proc.root.name = `scene_${def.type}`;
      proc.root.visible = false;
      this.layer.add(proc.root);
      const node: SceneNode = { type: def.type, def, root: proc.root, materials: proc.materials, isSky: false, elapsed: 0, proc };
      this.nodes.set(def.type, node);
      return node;
    });
    this.proceduralLoads.set(def.type, task);
    void task.then(() => this.proceduralLoads.delete(def.type), () => this.proceduralLoads.delete(def.type));
    return task;
  }

  private setWrap(tex: THREE.Texture, wrap: THREE.Wrapping): void {
    if (tex.wrapS === wrap && tex.wrapT === wrap) return;
    tex.wrapS = tex.wrapT = wrap;
    tex.needsUpdate = true;
  }

  private setupSceneMesh(mesh: THREE.Mesh, mat: SceneMaterial, isSky: boolean): void {
    mesh.material = mat;
    // 場景永遠在畫面內；骨骼 / 縮放過的模型自算包圍體不可靠，一律不做 frustum culling
    mesh.frustumCulled = false;
    if (isSky) {
      // 背景板：最先畫、不寫深度，地面場景轉場時可直接蓋在上面
      mat.depthWrite = false;
      mesh.renderOrder = RenderOrder.sky;
    } else {
      mesh.renderOrder = RenderOrder.scene;
    }
  }

  /** 保持同一時間只有一個場景可見 */
  private keepSingle(visibleType: number): void {
    for (const [type, n] of this.nodes) n.root.visible = type === visibleType;
  }

  /**
   * IrisChangeScene:Change：u_progress 0 → 1，以相機為中心由近到遠擴散。
   * - 新場景是地面：新場景 u_mul = 1 淡入，**蓋在舊場景上**——舊場景移到 prevScene，在主場景之前以「換相機前的相機」
   *   完整畫出（不溶解）、清深度，再畫主場景。
   *   原版是舊場景 u_mul = −1 同時淡出；兩場景形狀相同時結果一樣，但換相機後（SPEC §16.4）舊場景從新相機看
   *   形狀對不上 / 蓋不滿畫面，各自依自己的距離溶解 / 出現會露出空洞（底色）。
   * - 新場景是天空：天空不套 Iris（距離都超過 range）、在背景整段可見；舊的地面 u_mul = −1 淡出露出天空（SPEC §15.3）。
   */
  private iris(prev: SceneNode, next: SceneNode, range: number, prevCamera: THREE.Camera | null): void {
    const { center, boardAddColor, fadeTime } = IRIS_TRANSITION;
    const fading: IrisSceneMaterial[] = [];
    const setIris = (node: SceneNode, mul: number) => {
      for (const m of node.materials) {
        m.setIris(mul, range, center, boardAddColor);
        fading.push(m);
      }
    };
    prev.root.visible = true;
    next.root.visible = true;
    const overlay = !next.isSky;
    if (overlay) {
      setIris(next, 1);
      this.prevScene.add(prev.root);
      this.prevCamera = prevCamera;
      this.prevPass.enabled = true;
    } else if (!prev.isSky) {
      setIris(prev, -1);
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
      if (overlay) {
        this.prevPass.enabled = false;
        this.prevCamera = null;
        this.layer.add(prev.root);
      }
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
