/**
 * 程序化場景的材質外框（SPEC §18.3）。
 *
 * 每個材質只要提供 fragment 片段（定義 `vec4 shade()`），外框負責：
 * - 共用 varying：vWorldPos / vViewPos / vNormal / vUv / vColor（頂點色 × instance 色）
 * - Iris 轉場（§15.3）：與 SceneMaterial 相同的 uMul / uProgress / uBoardAddColor，
 *   但距離用 d / (d + uZ) 壓縮 —— 遠景（山、天空）很遠，照原本的 min(1, d / uZ) 會全部擠在最後一刻才跳出來
 * - 共用雜訊函式（GLSL_NOISE）
 * - 可選的頂點片段：定義 PROC_DISPLACE → `void procDisplace(inout vec3 p, inout vec3 n)`（模型空間）、
 *   PROC_WORLD → `void procWorld(inout vec3 wp)`（世界空間，例如隨風擺動 / 粒子飄動）、
 *   PROC_POINTS → `float procPointSize(vec4 mv)`
 *
 * 不用 three.js 的燈光與色彩管理（本專案 ColorManagement 關閉），shade() 直接輸出顯示用的顏色。
 */
import * as THREE from 'three';

/** SceneMaterial 與 ProcMaterial 共同的介面（BGScene 用） */
export interface IrisSceneMaterial {
  readonly animated: boolean;
  setIris(mul: number, range: number, center: [number, number, number], boardAddColor: [number, number, number]): void;
  progress: number;
  mul: number;
  time: number;
  setScalar(name: string, v: number): void;
}

/** 共用雜訊（hash 不用 sin，各家 GPU 結果一致）；p 開頭的是可平鋪的版本（烘焙貼圖用） */
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise3(p);
    p = p * 2.03 + vec3(11.7, 5.3, 8.9);
    a *= 0.5;
  }
  return s;
}
// 可平鋪：格點座標對 period 取餘數
float pnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, period);
  vec2 i1 = mod(i + 1.0, period);
  return mix(mix(hash12(i0), hash12(vec2(i1.x, i0.y)), u.x), mix(hash12(vec2(i0.x, i1.y)), hash12(i1), u.x), u.y);
}
float pfbm(vec2 p, float period) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * pnoise(p, period);
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return s;
}
`;

const VARYINGS = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vViewPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
`;

const buildVertex = (chunk: string) => /* glsl */ `
uniform float uTime;
${VARYINGS}
${GLSL_NOISE}
${chunk}
void main() {
  vUv = uv;
  vColor = vec3(1.0);
  #ifdef USE_COLOR
    vColor = color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor.rgb;
  #endif
  vec3 p = position;
  vec3 n = normal;
  #ifdef PROC_DISPLACE
    procDisplace(p, n);
  #endif
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = m * vec4(p, 1.0);
  #ifdef PROC_WORLD
    procWorld(wp.xyz);
  #endif
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(m) * n);
  vec4 mv = viewMatrix * wp;
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #ifdef PROC_POINTS
    gl_PointSize = procPointSize(mv);
  #endif
}
`;

const buildFragment = (chunk: string) => /* glsl */ `
uniform float uTime;
uniform float uMul;
uniform float uProgress;
uniform float uZ;
uniform vec3 uBoardAddColor;
${VARYINGS}
${GLSL_NOISE}
${chunk}
void main() {
  // Iris：以相機為中心由近到遠；距離壓縮成 d / (d + uZ)，遠景也會在轉場中陸續出現
  float d = length(vViewPos);
  float dist = min(1.0, 1.05 * d / (d + uZ));
  float dif = (dist - uProgress) * uMul;
  if (dif > 0.0) discard;
  float edge = uProgress < 1.0 ? max(dif + 0.05, 0.0) * 20.0 : 0.0;
  vec4 c = shade();
  gl_FragColor = vec4(c.rgb + uBoardAddColor * edge * c.a, c.a);
}
`;

export interface ProcMaterialOptions {
  name: string;
  /** GLSL：必須定義 vec4 shade() */
  fragment: string;
  /** GLSL：頂點片段（搭配 defines：PROC_DISPLACE / PROC_WORLD / PROC_POINTS） */
  vertex?: string;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number | boolean>;
  transparent?: boolean;
  blending?: THREE.Blending;
  depthWrite?: boolean;
  depthTest?: boolean;
  side?: THREE.Side;
  vertexColors?: boolean;
}

export class ProcMaterial extends THREE.ShaderMaterial implements IrisSceneMaterial {
  /** 每幀更新 uTime */
  readonly animated = true;

  constructor(opts: ProcMaterialOptions) {
    super({
      uniforms: {
        uTime: { value: 0 },
        uMul: { value: 1 },
        uProgress: { value: 1 },
        uZ: { value: 800 },
        uBoardAddColor: { value: new THREE.Vector3() },
        ...opts.uniforms,
      },
      defines: opts.defines ?? {},
      vertexShader: buildVertex(opts.vertex ?? ''),
      fragmentShader: buildFragment(opts.fragment),
      transparent: opts.transparent ?? false,
      blending: opts.blending ?? THREE.NormalBlending,
      depthWrite: opts.depthWrite ?? !opts.transparent,
      depthTest: opts.depthTest ?? true,
      side: opts.side ?? THREE.FrontSide,
      vertexColors: opts.vertexColors ?? false,
    });
    this.name = `ProcMaterial(${opts.name})`;
  }

  setIris(mul: number, range: number, _center: [number, number, number], boardAddColor: [number, number, number]): void {
    const u = this.uniforms;
    u.uMul.value = mul;
    u.uZ.value = range;
    (u.uBoardAddColor.value as THREE.Vector3).set(...boardAddColor);
    u.uProgress.value = 0;
  }

  set progress(v: number) {
    this.uniforms.uProgress.value = v;
  }

  set mul(v: number) {
    this.uniforms.uMul.value = v;
  }

  set time(v: number) {
    this.uniforms.uTime.value = v;
  }

  setScalar(name: string, v: number): void {
    const u = this.uniforms[name];
    if (!u) return;
    if (typeof u.value === 'number') u.value = v;
    else (u.value as THREE.Vector4).x = v;
  }
}
