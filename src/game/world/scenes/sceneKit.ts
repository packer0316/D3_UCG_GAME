/**
 * 程序化場景共用的小工具（SPEC §18）：組裝場景、幾何處理、光暈片、圓石。
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ProcMaterial, type ProcMaterialOptions } from './ProcMaterial';
import { SCENE_CAMERA } from './ProceduralScene';
import { fbm, seededRandom } from './noise';

/** 繪製順序：天空 → 天體 → 場景（之後才是魚 / 子彈 / 砲台，renderOrder 0） */
export const Order = { sky: -3, celestial: -2, scene: -1 } as const;

/** 加色、不寫深度（光暈、光點） */
export const ADDITIVE = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;

/** 場景組裝：收集根節點與所有材質（Iris 轉場、uTime 由 BGScene 統一處理） */
export class SceneKit {
  readonly root = new THREE.Group();
  readonly materials: ProcMaterial[] = [];

  add<T extends THREE.Object3D>(obj: T, renderOrder: number = Order.scene): T {
    obj.renderOrder = renderOrder;
    // 場景永遠在畫面內，不做 frustum culling
    obj.frustumCulled = false;
    this.root.add(obj);
    return obj;
  }

  material(opts: ProcMaterialOptions): ProcMaterial {
    const m = new ProcMaterial(opts);
    this.materials.push(m);
    return m;
  }
}

/** three 的基本幾何是 Y 朝上 → 轉成 Z 朝上 */
export const zUp = <T extends THREE.BufferGeometry>(g: T): T => g.rotateX(Math.PI / 2) as T;

/** 整個幾何塗成同一個頂點色 */
export function tint<T extends THREE.BufferGeometry>(g: T, color: number | THREE.Color): T {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export const at = <T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number): T => g.translate(x, y, z) as T;

/** 合併幾何（有的有索引、有的沒有 → 統一成沒有索引），並釋放原本的 */
export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  return merged;
}

/** 圓石：細分的二十面體，用雜訊推拉成圓潤的石頭、底部削平（半徑約 1） */
export function makeRockGeometry(seed: number): THREE.BufferGeometry {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = geo.getAttribute('position');
  const rnd = seededRandom(seed);
  const sx = 0.85 + rnd() * 0.45;
  const sy = 0.85 + rnd() * 0.45;
  const sz = 0.6 + rnd() * 0.35;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.8 + 0.4 * fbm(x * 1.1 + z * 1.7 + seed, y * 1.1 - z * 1.3, 3, seed);
    pos.setXYZ(i, x * k * sx, y * k * sy, Math.max(z * k * sz, -0.3));
  }
  geo.computeVertexNormals();
  return geo;
}

export interface Glow {
  x: number;
  y: number;
  z: number;
  /** 寬 */
  size: number;
  /** 高；省略 = 與寬相同 */
  height?: number;
  color: number | THREE.Color;
}

/**
 * 一批光暈片合成一個 mesh：面向場景相機（相機固定，不必每幀轉）；flat = 平貼地面（光池）。
 * 頂點色 = 顏色，uv 0 ~ 1。
 */
export function makeGlowMesh(glows: Glow[], material: THREE.Material, flat = false): THREE.Mesh {
  const cam = new THREE.Vector3(SCENE_CAMERA.x, SCENE_CAMERA.y, SCENE_CAMERA.z);
  const up = new THREE.Vector3(0, 0, 1);
  const parts = glows.map((g) => {
    const quad = tint(new THREE.PlaneGeometry(g.size, g.height ?? g.size), g.color);
    if (flat) return quad.translate(g.x, g.y, g.z);
    const pos = new THREE.Vector3(g.x, g.y, g.z);
    return quad.applyMatrix4(new THREE.Matrix4().lookAt(cam, pos, up).setPosition(pos));
  });
  return new THREE.Mesh(mergeAll(parts), material);
}

/** 光暈（加色）：頂點色 = 顏色；uBlink > 0 = 每秒閃幾次，否則緩慢呼吸 */
export const GLOW_FRAGMENT = /* glsl */ `
uniform float uBlink;
vec4 shade() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 4.5) * smoothstep(1.0, 0.7, r);
  float on = uBlink > 0.0 ? smoothstep(0.55, 0.45, fract(uTime * uBlink)) : 0.82 + 0.18 * sin(uTime * 1.4 + vWorldPos.x * 0.02);
  return vec4(vColor * a * on, a * on);
}
`;

/** 漂浮的光點（Points）：緩慢飄動、一閃一閃；頂點色 = 顏色，aSeed = 0 ~ 1 的亂數 */
export const MOTE_VERTEX = /* glsl */ `
attribute float aSeed;
varying float vSeed;
uniform float uViewH;
void procWorld(inout vec3 wp) {
  vSeed = aSeed;
  wp += vec3(sin(uTime * 0.07 + aSeed * 6.28), cos(uTime * 0.05 + aSeed * 12.0), sin(uTime * 0.09 + aSeed * 20.0)) * vec3(10.0, 10.0, 5.0);
}
float procPointSize(vec4 mv) {
  return (1.6 + 2.6 * fract(aSeed * 7.3)) * uViewH / 720.0 * clamp(420.0 / -mv.z, 0.7, 3.0);
}
`;
export const MOTE_FRAGMENT = /* glsl */ `
varying float vSeed;
vec4 shade() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 4.0) * smoothstep(1.0, 0.6, r);
  float glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.6 + vSeed * 1.4) + vSeed * 50.0), 4.0);
  return vec4(vColor * a * glint, a * glint);
}
`;

/** 建立光點 Points：每個點 = 位置 + 顏色（aSeed 自動給） */
export function makeMotes(kit: SceneKit, name: string, points: { x: number; y: number; z: number; color: THREE.Color }[], viewH: THREE.IUniform, rnd: () => number): THREE.Points {
  const pos = new Float32Array(points.length * 3);
  const col = new Float32Array(points.length * 3);
  const seed = new Float32Array(points.length);
  points.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    col.set([p.color.r, p.color.g, p.color.b], i * 3);
    seed[i] = rnd();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = kit.material({
    name,
    vertex: MOTE_VERTEX,
    fragment: MOTE_FRAGMENT,
    defines: { PROC_WORLD: true, PROC_POINTS: true },
    uniforms: { uViewH: viewH },
    vertexColors: true,
    ...ADDITIVE,
  });
  return kit.add(new THREE.Points(geo, mat));
}
