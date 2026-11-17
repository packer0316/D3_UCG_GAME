/**
 * c3b → three.js。行為對照 Cocos2d-x Sprite3D::initFrom / createNode / MeshSkin：
 *
 * - skeleton 節點 → THREE.Bone 樹，掛在模型根節點（= Cocos Sprite3D）下
 * - 有骨骼的 part（或整個模型只有一個節點）→ SkinnedMesh 掛在根節點（單位矩陣），
 *   並把該節點 transform 分解後套到「根節點」（最後一個生效；之後位置/旋轉會被設定覆寫，只留縮放）
 * - 沒有骨骼的 part → 一般 Mesh，套用節點 transform 掛在父節點下
 * - 沒有 part 的節點 → 空 Object3D（可被動畫驅動 / 當掛點）
 * - Skinning：attached 模式 + bind(skeleton, identity)，
 *   最終 = boneWorld(含根節點) × invBindPose，等同 Cocos palette × Sprite 世界矩陣
 * - 動畫：整條 take 一個 AnimationClip（keytime 0..1 × totalTime），之後依 30fps 影格切片
 * - 非骨骼的動畫 curve（Animate3D _nodeCurves）：是「附加變換」，後乘在節點原本的變換上，見 bindNodeCurves
 * - 色彩：不做色彩管理（與 Cocos 相同，貼圖 NoColorSpace，輸出 Linear）
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { parseC3b, type C3bData, type C3bMesh, type C3bNode, type C3bNodePart } from './C3bParser';

export const C3B_FPS = 30;

/** three.js PropertyBinding 不允許 [ ] . : / 出現在節點名稱 */
export function sanitizeNodeName(name: string): string {
  return name.replace(/[[\].:/]/g, '_');
}

export interface C3bModelTemplate {
  readonly url: string;
  readonly data: C3bData;
  /** 原型（不要直接加進場景，請用 instantiate） */
  readonly root: THREE.Group;
  /** 整條 take；沒有動畫則為 null */
  readonly clip: THREE.AnimationClip | null;
  /** 依 materialId 的 diffuse 貼圖 */
  readonly textures: Map<string, THREE.Texture>;
  /** 切片快取 */
  readonly slices: Map<string, THREE.AnimationClip>;
}

export interface C3bLoadOptions {
  /** 載入貼圖（由 AssetManager 提供快取） */
  loadTexture: (url: string) => Promise<THREE.Texture>;
}

function dirOf(url: string): string {
  const i = url.lastIndexOf('/');
  return i >= 0 ? url.slice(0, i + 1) : '';
}

function applyMatrix(obj: THREE.Object3D, m: Float32Array): void {
  const mat = new THREE.Matrix4().fromArray(m);
  mat.decompose(obj.position, obj.quaternion, obj.scale);
}

function buildGeometries(mesh: C3bMesh): Map<string, THREE.BufferGeometry> {
  const buffer = new THREE.InterleavedBuffer(mesh.vertices, mesh.stride);
  const attrs = new Map<string, THREE.InterleavedBufferAttribute>();
  let offset = 0;
  for (const a of mesh.attribs) {
    const attr = new THREE.InterleavedBufferAttribute(buffer, a.size, offset);
    switch (a.name) {
      case 'VERTEX_ATTRIB_POSITION':
        attrs.set('position', attr);
        break;
      case 'VERTEX_ATTRIB_NORMAL':
        attrs.set('normal', attr);
        break;
      case 'VERTEX_ATTRIB_TEX_COORD':
        attrs.set('uv', attr);
        break;
      case 'VERTEX_ATTRIB_TEX_COORD1':
        attrs.set('uv1', attr);
        break;
      case 'VERTEX_ATTRIB_BLEND_WEIGHT':
        attrs.set('skinWeight', attr);
        break;
      case 'VERTEX_ATTRIB_BLEND_INDEX':
        attrs.set('skinIndex', attr);
        break;
      case 'VERTEX_ATTRIB_COLOR':
        attrs.set('color', attr);
        break;
      case 'VERTEX_ATTRIB_TANGENT':
        // 砲台 normal map 用（shader 以 vec4 宣告，w 自動補 1）
        attrs.set('tangent', attr);
        break;
      default:
        // BINORMAL 等：shader 以 cross(n, t) 重建，不需要
        break;
    }
    offset += a.size;
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const part of mesh.parts) {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of attrs) g.setAttribute(name, attr);
    g.setIndex(new THREE.BufferAttribute(part.indices, 1));
    if (part.aabb) {
      const [x0, y0, z0, x1, y1, z1] = part.aabb;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    }
    g.computeBoundingSphere();
    out.set(part.id, g);
  }
  return out;
}

/**
 * SkinnedMesh 的 boundingBox / boundingSphere 若為 null，three 會在排序透明物件、raycast 時
 * 逐頂點套骨骼計算；c3b 多個 part 共用頂點資料，會讀到超出本 part 骨架的索引而崩潰。
 * 這裡以 c3b part 的 AABB（綁定姿勢）預先設定，three 就不會再計算。
 */
export function presetSkinnedBounds(mesh: THREE.SkinnedMesh): void {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  if (!g.boundingSphere) g.computeBoundingSphere();
  mesh.boundingBox = g.boundingBox!.clone();
  mesh.boundingSphere = g.boundingSphere!.clone();
}

/** 依 c3b 材質建立 diffuse 貼圖對照 */
async function loadMaterialTextures(
  data: C3bData,
  baseUrl: string,
  opts: C3bLoadOptions,
): Promise<Map<string, THREE.Texture>> {
  const out = new Map<string, THREE.Texture>();
  await Promise.all(
    data.materials.map(async (m) => {
      const diffuse = m.textures.find((t) => t.usage === 'DIFFUSE') ?? m.textures[0];
      if (!diffuse?.filename) return;
      try {
        const tex = await opts.loadTexture(baseUrl + diffuse.filename);
        const wrap = (w: string) => (w === 'CLAMP' || w === 'GL_CLAMP_TO_EDGE' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping);
        if (tex.wrapS !== wrap(diffuse.wrapS) || tex.wrapT !== wrap(diffuse.wrapT)) {
          tex.wrapS = wrap(diffuse.wrapS);
          tex.wrapT = wrap(diffuse.wrapT);
          tex.needsUpdate = true;
        }
        out.set(m.id, tex);
      } catch (err) {
        console.warn(`[C3bLoader] texture missing: ${baseUrl + diffuse.filename}`, err);
      }
    }),
  );
  return out;
}

/** Sprite3D 本身的附加變換層（根節點 → 此層 → 骨骼 / mesh） */
export const C3B_ADDITIONAL_NODE = '__cocosAdditional';

interface NodeCurveTarget {
  /** three 物件名稱（track 綁定用） */
  name: string;
  /** 節點原本的 local 變換：key = base · 動畫值；null = 附加變換層（本身為單位） */
  base: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | null;
}

function skeletonNames(data: C3bData): Set<string> {
  const out = new Set<string>();
  const walk = (n: C3bNode) => {
    out.add(n.id);
    n.children.forEach(walk);
  };
  data.nodes.filter((n) => n.skeleton).forEach(walk);
  return out;
}

/**
 * Cocos Animate3D::startWithTarget：curve 名稱先找骨骼；找不到就找「Sprite3D 本身的名字」或
 * findChildByNameRecursively 子節點，對它 setAdditionalTransform —— 後乘在節點原本的變換上（不是取代）。
 * 都找不到 → 忽略。
 *
 * - 目標是 Sprite3D 本身（只有一個節點的模型，Sprite3D 會被命名成該節點 id，例如 A_Tiger_01）：
 *   根節點的位置/旋轉由遊戲設定（spriteRot），所以插一層附加變換在根節點與所有內容之間。
 *   AttachedBindMode 下 SkinnedMesh 自己的變換會被抵銷，track 打在 mesh 上是沒有作用的。
 * - 目標是其他節點：把節點原本的變換烘進 key（base · 動畫值；base 縮放為等比時精確）。
 */
function bindNodeCurves(data: C3bData, root: THREE.Group): Map<string, NodeCurveTarget> {
  const out = new Map<string, NodeCurveTarget>();
  const anim = data.animations[0];
  if (!anim) return out;
  const bones = skeletonNames(data);
  const find = (o: THREE.Object3D, name: string): THREE.Object3D | null => {
    if (o.userData.cocosNodeName === name) return o;
    for (const c of o.children) {
      const r = find(c, name);
      if (r) return r;
    }
    return null;
  };
  for (const b of anim.bones) {
    if (bones.has(b.bone) || out.has(b.bone)) continue;
    const target = find(root, b.bone);
    if (!target) continue;
    if (target === root) {
      const layer = new THREE.Group();
      layer.name = C3B_ADDITIONAL_NODE;
      while (root.children.length) layer.add(root.children[0]);
      root.add(layer);
      // 初值 = 第一個 key（Cocos 開始播動畫前是單位；龍生成就播動畫，先套上讓碰撞範圍以正確朝向計算）
      const k = b.keys[0];
      if (k?.translation) layer.position.fromArray(k.translation);
      if (k?.rotation) layer.quaternion.fromArray(k.rotation);
      if (k?.scale) layer.scale.fromArray(k.scale);
      out.set(b.bone, { name: C3B_ADDITIONAL_NODE, base: null });
    } else {
      // 名稱重複時（例如與 mesh 同名）改名，確保 PropertyBinding 綁到這個節點
      if (root.getObjectByName(target.name) !== target) target.name = sanitizeNodeName(b.bone) + '_node';
      out.set(b.bone, {
        name: target.name,
        base: { p: target.position.clone(), q: target.quaternion.clone(), s: target.scale.clone() },
      });
    }
  }
  return out;
}

function buildClip(data: C3bData, name: string, nodeCurves: Map<string, NodeCurveTarget>): THREE.AnimationClip | null {
  const anim = data.animations[0];
  if (!anim) return null;
  const T = anim.totalTime;
  const bones = skeletonNames(data);
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  for (const b of anim.bones) {
    const nodeCurve = nodeCurves.get(b.bone);
    if (!nodeCurve && !bones.has(b.bone)) continue;
    const node = nodeCurve ? nodeCurve.name : sanitizeNodeName(b.bone);
    const base = nodeCurve?.base ?? null;
    const qt: number[] = [];
    const qv: number[] = [];
    const st: number[] = [];
    const sv: number[] = [];
    const pt: number[] = [];
    const pv: number[] = [];
    for (const k of b.keys) {
      // 匯出器偶有 NaN keytime（例如 A_Tiger_01 的單一 key）；Cocos 單一 key 直接取值
      const t = (Number.isFinite(k.time) ? k.time : 0) * T;
      if (k.rotation) {
        qt.push(t);
        if (base) qv.push(...q.fromArray(k.rotation).premultiply(base.q).toArray());
        else qv.push(...k.rotation);
      }
      if (k.scale) {
        st.push(t);
        if (base) sv.push(k.scale[0] * base.s.x, k.scale[1] * base.s.y, k.scale[2] * base.s.z);
        else sv.push(...k.scale);
      }
      if (k.translation) {
        pt.push(t);
        if (base) pv.push(...p.fromArray(k.translation).multiply(base.s).applyQuaternion(base.q).add(base.p).toArray());
        else pv.push(...k.translation);
      }
    }
    if (qt.length) tracks.push(new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, qt, qv));
    if (st.length) tracks.push(new THREE.VectorKeyframeTrack(`${node}.scale`, st, sv));
    if (pt.length) tracks.push(new THREE.VectorKeyframeTrack(`${node}.position`, pt, pv));
  }
  return new THREE.AnimationClip(name, T, tracks);
}

function buildTemplate(data: C3bData, url: string, textures: Map<string, THREE.Texture>): THREE.Group {
  const root = new THREE.Group();
  root.name = url.slice(url.lastIndexOf('/') + 1);
  const nodeMap = new Map<string, THREE.Object3D>();

  // 1. skeleton → Bone 樹
  const buildBone = (n: C3bNode, parent: THREE.Object3D) => {
    const bone = new THREE.Bone();
    bone.name = sanitizeNodeName(n.id);
    bone.userData.cocosName = n.id;
    applyMatrix(bone, n.transform);
    parent.add(bone);
    nodeMap.set(n.id, bone);
    for (const c of n.children) buildBone(c, bone);
  };
  for (const n of data.nodes) if (n.skeleton) buildBone(n, root);

  // mesh part id → geometry
  const geoms = new Map<string, THREE.BufferGeometry>();
  for (const m of data.meshes) for (const [id, g] of buildGeometries(m)) geoms.set(id, g);

  const makeMaterial = (part: C3bNodePart) => {
    const tex = textures.get(part.materialId) ?? textures.values().next().value ?? null;
    return new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.3 });
  };

  const findBone = (name: string): THREE.Bone => {
    const o = nodeMap.get(name);
    if (o instanceof THREE.Bone) return o;
    // Cocos 只在 skeleton 找；找不到時補一根固定骨避免崩潰
    console.warn(`[C3bLoader] ${url}: bone "${name}" not in skeleton`);
    const b = new THREE.Bone();
    b.name = sanitizeNodeName(name);
    root.add(b);
    nodeMap.set(name, b);
    return b;
  };

  // 2. 一般節點
  const createNode = (n: C3bNode, parent: THREE.Object3D, singleSprite: boolean) => {
    let created: THREE.Object3D | null = null;
    for (const part of n.parts) {
      const geom = geoms.get(part.meshPartId);
      if (!geom) {
        console.warn(`[C3bLoader] ${url}: mesh part ${part.meshPartId} missing`);
        continue;
      }
      if (part.bones.length > 0 || singleSprite) {
        let mesh: THREE.Mesh;
        if (part.bones.length > 0 && geom.getAttribute('skinIndex')) {
          const skinned = new THREE.SkinnedMesh(geom, makeMaterial(part));
          const bones = part.bones.map(findBone);
          const inverses = part.invBindPoses.map((m) => new THREE.Matrix4().fromArray(m));
          skinned.bindMode = THREE.AttachedBindMode;
          skinned.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
          // 預先給包圍體：多個 part 共用頂點資料，three 自行逐頂點計算會碰到別 part 的骨骼索引
          presetSkinnedBounds(skinned);
          mesh = skinned;
        } else {
          mesh = new THREE.Mesh(geom, makeMaterial(part));
        }
        mesh.name = sanitizeNodeName(n.id);
        mesh.userData.cocosName = n.id;
        mesh.userData.materialId = part.materialId;
        mesh.frustumCulled = false;
        root.add(mesh);
        // Cocos：把節點 transform 套到 Sprite3D 本身（最後一個生效）
        applyMatrix(root, n.transform);
        // Cocos：singleSprite 時 root->setName(id)（root = 父節點參數；動畫 node curve 以此名稱找目標）
        if (singleSprite) parent.userData.cocosNodeName = n.id;
        created = root;
      } else {
        const mesh = new THREE.Mesh(geom, makeMaterial(part));
        mesh.name = sanitizeNodeName(n.id);
        mesh.userData.cocosName = n.id;
        mesh.userData.cocosNodeName = n.id;
        mesh.userData.materialId = part.materialId;
        applyMatrix(mesh, n.transform);
        parent.add(mesh);
        created = mesh;
      }
    }
    if (n.parts.length === 0) {
      const obj = new THREE.Object3D();
      obj.name = sanitizeNodeName(n.id);
      obj.userData.cocosName = n.id;
      obj.userData.cocosNodeName = n.id;
      applyMatrix(obj, n.transform);
      parent.add(obj);
      nodeMap.set(n.id, obj);
      created = obj;
    }
    for (const c of n.children) createNode(c, created ?? parent, n.children.length === 1);
  };
  const plainNodes = data.nodes.filter((n) => !n.skeleton);
  for (const n of plainNodes) createNode(n, root, plainNodes.length === 1);

  return root;
}

export async function loadC3b(url: string, opts: C3bLoadOptions): Promise<C3bModelTemplate> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[C3bLoader] ${url}: HTTP ${res.status}`);
  const data = parseC3b(await res.arrayBuffer());
  const textures = await loadMaterialTextures(data, dirOf(url), opts);
  return createC3bTemplate(data, url, textures);
}

/** 由已解析的 c3b 建立模板（loadC3b 內部使用；測試可直接呼叫） */
export function createC3bTemplate(data: C3bData, url: string, textures = new Map<string, THREE.Texture>()): C3bModelTemplate {
  const root = buildTemplate(data, url, textures);
  const clip = buildClip(data, root.name, bindNodeCurves(data, root));
  return { url, data, root, clip, textures, slices: new Map() };
}

/** 建立實例（骨架獨立）；材質仍為共用，呼叫端需要時自行替換 */
export function instantiateC3b(tpl: C3bModelTemplate): THREE.Group {
  const inst = cloneSkinned(tpl.root) as THREE.Group;
  inst.userData.template = tpl;
  return inst;
}

/**
 * 依 30fps 影格切出子動畫（對照 cc.Animate3D:createWithFrames）。
 * 會在起訖時間點插值補 key，確保稀疏 key 的骨骼也正確。
 */
export function sliceC3bClip(
  tpl: C3bModelTemplate,
  name: string,
  startFrame: number,
  endFrame: number,
  fps = C3B_FPS,
): THREE.AnimationClip | null {
  const key = `${name}:${startFrame}:${endFrame}:${fps}`;
  const cached = tpl.slices.get(key);
  if (cached) return cached;
  const full = tpl.clip;
  if (!full) return null;
  const t0 = Math.min(startFrame / fps, full.duration);
  // Animate3D：duration 超出時夾在 fullDuration - fromTime
  const t1 = Math.min(endFrame / fps, full.duration);
  const minDur = 1 / fps / 100;
  const span = Math.max(t1 - t0, minDur);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of full.tracks) {
    const size = track.getValueSize();
    // createInterpolant 於 runtime 依插值模式指派，型別定義沒有宣告
    const interp = (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
    const times: number[] = [0];
    const values: number[] = Array.from(interp.evaluate(t0) as ArrayLike<number>);
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (t > t0 + 1e-6 && t < t1 - 1e-6) {
        times.push(t - t0);
        for (let k = 0; k < size; k++) values.push(track.values[i * size + k]);
      }
    }
    times.push(span);
    values.push(...Array.from(interp.evaluate(t1 > t0 ? t1 : t0) as ArrayLike<number>));
    const Ctor = track.constructor as new (n: string, t: number[], v: number[]) => THREE.KeyframeTrack;
    tracks.push(new Ctor(track.name, times, values));
  }
  const clip = new THREE.AnimationClip(name, span, tracks);
  tpl.slices.set(key, clip);
  return clip;
}

/** 依 Cocos 原始名稱找節點（骨骼掛點 getAttachNode） */
export function findCocosNode(root: THREE.Object3D, cocosName: string): THREE.Object3D | null {
  const target = sanitizeNodeName(cocosName);
  return root.getObjectByName(target) ?? null;
}
