/**
 * 場景材質：對照原版 ground.material
 *
 * technique "sceneTest"（shader_3d_scene_position_tex.vert + alpha_scene.frag）— 一般場景：
 *   dist = min(1, |u_center - v_wpos| / u_z)        v_wpos 是 view space（CC_MVMatrix × position）
 *   dif  = (dist - u_progress) × u_mul              > 0 → discard（u_mul 1 淡入 / -1 淡出）
 *   轉場中邊緣 0.05 範圍加上 u_boardAddColor（dif = max(dif + 0.05, 0) × 20）
 *   貼圖 alpha < 0.3 discard；輸出 tex × u_color + 邊緣色，alpha 固定 1
 *
 * technique "skybox"（shader_3d_skin_position_tex_azure.vert + flowmap.frag）— 天空場景（opts.flowMap）：
 *   貼圖依 flowmap 流動（兩相位交錯），u_Switch 控制「變天」（SPEC §15.2）。
 *   uv 在 Cocos 座標（y = 1 − v，原版頂點 shader 的翻轉）計算，取樣時轉回 three 座標。
 *
 * 預設 u_mul = 1、u_progress = 1：完全顯示、沒有邊緣色（與原版轉場結束後的狀態相同）。
 */
import * as THREE from 'three';

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vViewPos;
void main() {
  vUv = uv;
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewPos = mvPosition.xyz;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec4 uColor;
uniform float uMul;
uniform float uProgress;
uniform vec3 uCenter;
uniform float uZ;
uniform vec3 uBoardAddColor;
#ifdef USE_FLOWMAP
uniform sampler2D uFlowMap;
uniform float uSwitch;
uniform float uTime;
#endif
varying vec2 vUv;
varying vec3 vViewPos;

#ifdef USE_FLOWMAP
// Cocos 座標（y 向下）→ three 取樣座標
vec4 sampleCocos(sampler2D t, vec2 c) {
  return texture2D(t, vec2(c.x, 1.0 - c.y));
}

// flowmap.frag 逐行翻譯（CC_Texture0 = map、CC_Time.g = uTime）
vec4 flowColor() {
  vec2 tc = vec2(vUv.x, 1.0 - vUv.y);
  vec4 flow = sampleCocos(uFlowMap, tc);
  vec2 flowUv = tc + (flow.rg - vec2(0.5)) * vec2(0.6);
  float phase = fract(uTime * 0.2);
  vec4 colA = sampleCocos(map, mix(tc, flowUv, phase));
  vec4 colB = sampleCocos(map, mix(tc, flowUv, fract(phase + 0.51)));
  vec4 col = mix(colA, colB, abs(phase * 2.0 - 1.0));
  vec4 tinted = vec4(1.0, 0.47, 0.788, 0.686) * col;
  float s = (-2.0 + tc.y * 4.0) + flow.b + uSwitch;
  float st = step(1.0, s);
  vec4 c = mix(tinted, col, st);
  return mix(c, vec4(0.286, 0.184, 0.812, 0.757), smoothstep(0.9, 1.0, s) - st);
}
#endif

void main() {
  float dist = min(1.0, distance(uCenter, vViewPos) / uZ);
  float dif = dist * uMul - uProgress * uMul;
  if (dif > 0.0) {
    discard;
  } else if (uProgress < 1.0) {
    dif = max(dif + 0.05, 0.0) * 20.0;
  } else {
    dif = max(dif, 0.0);
  }
#ifdef USE_FLOWMAP
  vec4 tex = flowColor();
#else
  vec4 tex = texture2D(map, vUv);
  if (tex.a < 0.3) discard;
#endif
  gl_FragColor = vec4((tex * uColor).rgb + uBoardAddColor * dif, 1.0);
}
`;

export interface SceneMaterialOptions {
  /** 天空 flowmap（technique "skybox"） */
  flowMap?: THREE.Texture | null;
  /** u_Switch */
  switchVal?: number;
}

export class SceneMaterial extends THREE.ShaderMaterial {
  /** 天空 flowmap 材質 */
  readonly isFlow: boolean;

  constructor(map: THREE.Texture | null, opts: SceneMaterialOptions = {}) {
    const isFlow = !!opts.flowMap;
    super({
      uniforms: {
        map: { value: map },
        uColor: { value: new THREE.Vector4(1, 1, 1, 1) },
        uMul: { value: 1 },
        uProgress: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uZ: { value: 1 },
        uBoardAddColor: { value: new THREE.Vector3() },
        uFlowMap: { value: opts.flowMap ?? null },
        uSwitch: { value: opts.switchVal ?? 10 },
        uTime: { value: 0 },
      },
      defines: isFlow ? { USE_FLOWMAP: '' } : {},
      vertexShader,
      fragmentShader,
      depthWrite: true,
    });
    this.isFlow = isFlow;
    this.name = isFlow ? 'SceneMaterial(skybox)' : 'SceneMaterial';
  }

  /** IrisChangeScene:IrisEffect 開始時設定的 uniform */
  setIris(mul: number, range: number, center: [number, number, number], boardAddColor: [number, number, number]): void {
    const u = this.uniforms;
    u.uMul.value = mul;
    u.uZ.value = range;
    (u.uCenter.value as THREE.Vector3).set(...center);
    (u.uBoardAddColor.value as THREE.Vector3).set(...boardAddColor);
    u.uProgress.value = 0;
  }

  set progress(v: number) {
    this.uniforms.uProgress.value = v;
  }

  set mul(v: number) {
    this.uniforms.uMul.value = v;
  }

  /** 天空：CC_Time.g（秒） */
  set time(v: number) {
    this.uniforms.uTime.value = v;
  }

  /** 天空：u_Switch（變天） */
  set switchVal(v: number) {
    this.uniforms.uSwitch.value = v;
  }
}
