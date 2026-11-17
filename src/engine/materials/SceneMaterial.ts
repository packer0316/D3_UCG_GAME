/**
 * 場景材質：對照原版 ground.material，依變體（kind）組 fragment shader。
 * 每個變體都先做 Iris 判斷，再由 sceneColor() 算顏色：
 *
 * Iris（technique "sceneTest" 的 alpha_scene.frag）：
 *   dist = min(1, |u_center - v_wpos| / u_z)        v_wpos 是 view space（CC_MVMatrix × position）
 *   dif  = (dist - u_progress) × u_mul              > 0 → discard（u_mul 1 淡入 / -1 淡出）
 *   轉場中邊緣 0.05 範圍加上 u_boardAddColor（dif = max(dif + 0.05, 0) × 20）
 *   輸出 sceneColor × u_color + 邊緣色，alpha 固定 1
 *
 * 變體：
 *   default  — sceneTest：貼圖 alpha < 0.3 discard
 *   flow     — skybox（flowmap.frag，天空場景，SPEC §15.2）
 *   prison   — 殭屍專案 PrisonScene（prisonScene.frag，SPEC §16.2）
 *   cemetery — 殭屍專案 CemeteryScene（cemeteryScene.frag，SPEC §16.2）
 * 原版 shader 的 uv 在 Cocos 座標（頂點 shader 做了 y = 1 − v）：一律在 Cocos 座標計算，取樣時用 sampleCocos 轉回 three 座標。
 *
 * 預設 u_mul = 1、u_progress = 1：完全顯示、沒有邊緣色（與原版轉場結束後的狀態相同）。
 */
import * as THREE from 'three';

export type SceneShaderKind = 'default' | 'flow' | 'prison' | 'cemetery';

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

const header = /* glsl */ `
uniform sampler2D map;
uniform vec4 uColor;
uniform float uMul;
uniform float uProgress;
uniform vec3 uCenter;
uniform float uZ;
uniform vec3 uBoardAddColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vViewPos;

// Cocos 座標（y 向下）→ three 取樣座標
vec4 sampleCocos(sampler2D t, vec2 c) {
  return texture2D(t, vec2(c.x, 1.0 - c.y));
}
// three uv → Cocos 座標（原版頂點 shader 的 TextureCoordOut）
vec2 cocosUv() {
  return vec2(vUv.x, 1.0 - vUv.y);
}
`;

const CHUNKS: Record<SceneShaderKind, string> = {
  default: /* glsl */ `
vec4 sceneColor() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < 0.3) discard;
  return tex;
}
`,

  // flowmap.frag 逐行翻譯（CC_Texture0 = map、CC_Time.g = uTime）
  flow: /* glsl */ `
uniform sampler2D uFlowMap;
uniform float uSwitch;
vec4 sceneColor() {
  vec2 tc = cocosUv();
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
`,

  // prisonScene.frag 逐行翻譯（Main_Tex = map、CC_Time.g = uTime；u_multColor → uColor、受擊漂白不需要）
  prison: /* glsl */ `
uniform sampler2D Depth_Tex;
uniform sampler2D Mask_Tex;
uniform sampler2D Noise_Tex1;
uniform vec4 Light_R_Color;
uniform vec4 Light_G_Color;
uniform vec4 Light_B_Color;
uniform vec4 Light_R_Intensity;
uniform vec4 Light_G_Intensity;
uniform vec4 Light_B_Intensity;
uniform vec4 Light_R_breathlight_Speed;
uniform vec4 Noise_Tex_G_Tiling;
uniform vec4 Noise_Tex_B_Tiling;
uniform vec4 Noise_Tex_G_flow;
uniform vec4 Noise_Tex_B_flow;
uniform vec4 G_B_light;
uniform vec4 Depth_POS;
uniform vec4 Depth_contrast;
uniform vec4 Depth_Color;
vec4 sceneColor() {
  vec2 uv = cocosUv();
  vec4 mainCol = sampleCocos(map, uv);
  vec4 mask = sampleCocos(Mask_Tex, uv);

  vec2 gUV = uv * Noise_Tex_G_Tiling.xy + Noise_Tex_G_flow.xy * uTime;
  float gNoise = step(0.5, sampleCocos(Noise_Tex1, gUV).r);
  float gLight = gNoise * Light_G_Intensity.x + G_B_light.x;
  vec3 gColor = Light_G_Color.rgb * mask.g * gLight;

  vec2 bUV = uv * Noise_Tex_B_Tiling.xy + Noise_Tex_B_flow.xy * uTime;
  float bNoise = step(0.5, sampleCocos(Noise_Tex1, bUV).r);
  float bLight = bNoise * Light_B_Intensity.x + G_B_light.x;
  vec3 bColor = Light_B_Color.rgb * mask.b * bLight;

  float rBreath = clamp(sin(uTime * Light_R_breathlight_Speed.x), -0.5, 1.0);
  vec3 rColor = clamp(Light_R_Color.rgb * (mask.r * Light_R_Intensity.x * rBreath), 0.0, 1.0);

  vec3 litColor = mainCol.rgb + rColor + gColor + bColor;

  float depthVal = sampleCocos(Depth_Tex, uv).x;
  float reveal = clamp((depthVal - 0.5) * Depth_contrast.x + Depth_POS.x, 0.0, 1.0);
  vec3 darkColor = mainCol.rgb * Depth_Color.rgb;

  vec3 col = clamp(mix(darkColor, litColor, reveal), 0.0, 1.0);
  return vec4(col, mainCol.a);
}
`,

  // cemeteryScene.frag 逐行翻譯（CC_Texture0 = map、CC_Time.y = uTime；變數名同原檔方便對照）
  cemetery: /* glsl */ `
uniform sampler2D Mask_Tex;
uniform sampler2D Noise_Tex;
uniform sampler2D Moon_Tex;
uniform vec4 Cloud_ColorB;
uniform vec4 Cloud_ColorA;
uniform vec4 Cloud_Intensity;
uniform vec4 RG_moonpos_BA_moonsize;
uniform vec4 Depth_R_Intensity_G_Pos_B_noiseintensity;
uniform vec4 Noise_Tex1_RG_Tiling_BA_Flow;
uniform vec4 Noise_Tex2_RG_Tiling_BA_Flow;
uniform vec4 moon_mask_R_Intensity_G_Pos_;
uniform vec4 XNoise_Tex2_RG_Tiling_BA_Flow;
uniform vec4 XNoise_Tex1_RG_Tiling_BA_Flow;
uniform vec4 Floor_Color;
uniform vec4 Moon_R_Switch_G_Intensity;
uniform vec4 Backcloud_tex_RG_Tiling_BA_Flow;
uniform vec4 background_Distortion;
uniform vec4 Corner_color;
uniform vec4 Moon_Switch;

const float MOON_PAD_X = 0.01;
const float MOON_PAD_Y = 0.0025;

vec4 sampleMoon(vec2 uv) {
  vec2 luv = clamp(uv, 0.0, 1.0);
  luv.x = luv.x * (1.0 - 2.0 * MOON_PAD_X) + MOON_PAD_X;
  luv.y = luv.y * (1.0 - 2.0 * MOON_PAD_Y) + MOON_PAD_Y;
  return sampleCocos(Moon_Tex, luv);
}

vec4 sceneColor() {
  vec2 uv1 = cocosUv();
  float t = uTime;

  // 主圖與遮罩
  vec4 val6 = sampleCocos(map, uv1);
  float val12 = val6.w;
  vec4 val19 = sampleCocos(Mask_Tex, uv1);
  float val16 = val19.y;

  // 擾動：兩張流動 noise 偏移主圖 UV
  vec2 val20 = vec2(0.004, 0.004);
  vec2 val26 = uv1 * XNoise_Tex1_RG_Tiling_BA_Flow.xy + XNoise_Tex1_RG_Tiling_BA_Flow.zw * t;
  float val29 = sampleCocos(Noise_Tex, val26).g;
  vec2 val38 = uv1 * XNoise_Tex2_RG_Tiling_BA_Flow.xy + XNoise_Tex2_RG_Tiling_BA_Flow.zw * t;
  float val41 = sampleCocos(Noise_Tex, val38).r;
  vec2 val46 = vec2(val41, val29);
  vec2 val48 = uv1 + val46 * val20;
  vec4 val54 = sampleCocos(map, val48);
  vec3 val49 = val54.xyz;

  // 地面扣色
  float val59 = ((1.0 - val54.z) - 0.5) * 6.0 - 1.0;
  float val62 = clamp((val29 * val41) * val59, 0.0, 1.0);
  vec3 val66 = val49 - Floor_Color.xyz * vec3(val62);

  // 霧氣深度
  float val68 = Depth_R_Intensity_G_Pos_B_noiseintensity.z;
  vec2 uvFog1 = uv1 * Noise_Tex2_RG_Tiling_BA_Flow.xy + Noise_Tex2_RG_Tiling_BA_Flow.zw * t;
  vec2 uvFog2 = uv1 * Noise_Tex1_RG_Tiling_BA_Flow.xy + Noise_Tex1_RG_Tiling_BA_Flow.zw * t;
  float val75 = sampleCocos(Noise_Tex, uvFog1).r;
  float val86 = sampleCocos(Noise_Tex, uvFog2).g;
  float val93 = ((val86 + val75) - 1.0) * val68;
  float val94 = Depth_R_Intensity_G_Pos_B_noiseintensity.y;
  float val95 = Depth_R_Intensity_G_Pos_B_noiseintensity.x;

  // 遮罩紅通道 + 背景擾動 → 主揭露遮罩
  vec2 val97 = background_Distortion.xy * val46;
  float val102 = clamp((1.0 - uv1.y) * 4.0 - 3.2, 0.0, 1.0);
  vec2 val105 = uv1 + vec2(fract(val102)) * val97;
  float val107 = sampleCocos(Mask_Tex, val105).x;
  float val112 = val107 - 0.5;
  float val115 = (val112 * val95 + val94) + val93;
  float val116 = clamp(val115, 0.0, 1.0);

  // 月亮：中心化 UV 半徑做圓盤與光暈
  vec2 val118 = RG_moonpos_BA_moonsize.xy;
  vec2 val120 = uv1 + val118;
  vec2 val121 = val120 - 0.5;
  vec2 val122 = RG_moonpos_BA_moonsize.zw;
  vec2 val123 = val122 * val121;
  float val130 = length(val123) - 0.5;
  float val134 = clamp(1.0 - (val130 * 20.0 + 3.0), 0.0, 1.0);
  float val136 = clamp(val134 + val116, 0.0, 1.0);

  float val143 = clamp(1.0 - (moon_mask_R_Intensity_G_Pos_.y + moon_mask_R_Intensity_G_Pos_.x * val112), 0.0, 1.0);
  float val146 = clamp(1.0 - val130 * 1.1, 0.0, 1.0);
  float val147 = val146 * val143;

  float val149 = Moon_R_Switch_G_Intensity.y;
  float val151 = Moon_Switch.x - 0.9;

  // 月面顏色（光暈核心）：藍 → 紅
  vec2 val154 = clamp(val121 + val120, 0.0, 1.0);
  float val158 = sampleMoon(val154).y;
  float val165 = clamp((val158 + val151) * val149, 0.0, 1.0);
  vec4 val166 = vec4(0.5, 0.0, 0.0, 0.0);
  vec4 val167 = vec4(0.4, 0.4, 0.8, 0.0);
  vec4 val168 = mix(val167, val166, val165);
  vec4 val169 = val168 * vec4(val146);

  // 月面本體顏色
  vec2 val172 = clamp(val122 * val121 + val120, 0.0, 1.0);
  vec4 val178 = sampleMoon(val172);
  float val181 = clamp(val149 * (val151 + val178.y), 0.0, 1.0);
  float val189 = (val178.x - 0.5) * 4.0;
  vec4 val191 = mix(vec4(1.0, 0.2, 0.0, 0.0), val166, val189);
  vec4 val193 = mix(val167, vec4(0.6, 0.6, 1.0, 0.0), val189);
  vec4 val195 = clamp(mix(val193, val191, val181), 0.0, 1.0);
  vec4 val197 = val195 * vec4(val134) + val169;

  // 背景雲
  float val200 = clamp(val112 * 2.0 + 1.0, 0.0, 1.0);
  vec2 uvBackcloud = uv1 * Backcloud_tex_RG_Tiling_BA_Flow.xy + Backcloud_tex_RG_Tiling_BA_Flow.zw * t;
  float val209 = sampleCocos(Mask_Tex, uvBackcloud).z;
  float val214 = (val209 - 0.5) * 2.0 + 0.5;
  vec4 val217 = mix(vec4(0.179, 0.14, 0.283, 0.0), vec4(0.454, 0.428, 0.768, 0.0), val214);
  vec4 val218 = mix(val217, val6, val200);
  vec4 val219 = mix(val218, val197, val147);

  // 雲色與各層疊合
  vec4 val221 = (val168 * 1.0) * 2.0;
  float val225 = ((1.0 - val115) - 0.76) * Cloud_Intensity.x;
  vec4 val229 = clamp(mix(Cloud_ColorB, Cloud_ColorA, val225), 0.0, 1.0);
  vec4 val230 = mix(val229, val221, val147);
  vec4 val231 = mix(val230, val218, val116);
  vec4 val232 = mix(val231, val219, val136);

  // 四角暈影
  float val235 = ((1.0 - uv1.y) - 0.7) * 4.0;
  vec2 val236 = uv1 - 0.5;
  float val242 = length(val236);
  float val246 = clamp((val242 * val242 - 0.25) * 4.0, 0.0, 1.0);
  float val248 = clamp(val246 * val235, 0.0, 1.0);
  vec4 val251 = mix(vec4(1.0, 1.0, 1.0, 0.0), Corner_color, val248);
  vec3 val254 = clamp(val251 * val232, 0.0, 1.0).xyz;

  // 特效結果與擾動後地面依遮罩綠通道混合
  vec3 val256 = mix(val254, val66, val16);
  return vec4(val256, val12);
}
`,
};

const main = /* glsl */ `
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
  vec4 tex = sceneColor();
  gl_FragColor = vec4((tex * uColor).rgb + uBoardAddColor * dif, 1.0);
}
`;

export interface SceneMaterialOptions {
  /** 變體；省略 = 有 flowMap 時 flow，否則 default */
  kind?: SceneShaderKind;
  /** 天空 flowmap（technique "skybox"） */
  flowMap?: THREE.Texture | null;
  /** u_Switch */
  switchVal?: number;
  /** prison / cemetery：額外貼圖（uniform 名稱 → 貼圖） */
  textures?: Record<string, THREE.Texture | null>;
  /** prison / cemetery：vec4 uniform 初始值（純量寫在 x） */
  vec4?: Record<string, readonly number[]>;
}

export class SceneMaterial extends THREE.ShaderMaterial {
  readonly kind: SceneShaderKind;

  constructor(map: THREE.Texture | null, opts: SceneMaterialOptions = {}) {
    const kind = opts.kind ?? (opts.flowMap ? 'flow' : 'default');
    const uniforms: Record<string, THREE.IUniform> = {
      map: { value: map },
      uColor: { value: new THREE.Vector4(1, 1, 1, 1) },
      uMul: { value: 1 },
      uProgress: { value: 1 },
      uCenter: { value: new THREE.Vector3() },
      uZ: { value: 1 },
      uBoardAddColor: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    };
    if (kind === 'flow') {
      uniforms.uFlowMap = { value: opts.flowMap ?? null };
      uniforms.uSwitch = { value: opts.switchVal ?? 10 };
    }
    for (const [name, tex] of Object.entries(opts.textures ?? {})) uniforms[name] = { value: tex };
    for (const [name, v] of Object.entries(opts.vec4 ?? {})) {
      uniforms[name] = { value: new THREE.Vector4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0) };
    }
    super({
      uniforms,
      vertexShader,
      fragmentShader: header + CHUNKS[kind] + main,
      depthWrite: true,
    });
    this.kind = kind;
    this.name = `SceneMaterial(${kind})`;
  }

  /** 天空 flowmap 材質 */
  get isFlow(): boolean {
    return this.kind === 'flow';
  }

  /** 會隨時間變化（需要每幀更新 uTime） */
  get animated(): boolean {
    return this.kind !== 'default';
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

  /** CC_Time（秒） */
  set time(v: number) {
    this.uniforms.uTime.value = v;
  }

  /** 天空：u_Switch（變天） */
  set switchVal(v: number) {
    if (this.uniforms.uSwitch) this.uniforms.uSwitch.value = v;
  }

  /** vec4 uniform 的 x（原版 SetShaderVec4(name, v, 0, 0, 0)；例：墓地 Moon_Switch） */
  setScalar(name: string, v: number): void {
    const u = this.uniforms[name];
    if (u) (u.value as THREE.Vector4).x = v;
  }
}
