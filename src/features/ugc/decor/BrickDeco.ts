/**
 * 卡扣積木（SPEC-UGC §9.6.1）：原本的 7 件佔位方塊改成積木造型 + ABS 塑膠材質。
 *
 * - 一格（10 世界單位）= 一顆凸點的間距；凸點直徑 = 間距 × 0.6（實物 4.8 / 8）
 * - 高度每 1 格疊一層磚（層與層之間靠圓角形成接縫）；h < 1 = 一塊薄板；總高（含凸點）= h × 10
 * - 光跟花園珍藏同一套（MICROFACET_GLSL：GGX 高光、gardenEnvironment 環境反射），不用 three.js 的燈
 * 物件原點 = 佔地中心、貼地（z = 0），+Z 朝上。
 */
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DECO_GRID, decoFootprint, type DecoDefine } from '@game/ugc/DecoDefine';
import { ProcMaterial } from '@game/world/scenes/ProcMaterial';
import { MICROFACET_GLSL } from '@game/world/scenes/SurfaceLighting';
import { mergeAll, zUp } from '@game/world/scenes/sceneKit';
import type { DecoObjectOptions } from './DecoFactory';

const CELL = DECO_GRID.cell;
/** 磚身四周各縮多少（相鄰積木中間看得到縫） */
const INSET = 0.25;
/** 磚身圓角 */
const RADIUS = 0.45;
/** 凸點：半徑、高、頂緣圓角 */
const STUD_R = CELL * 0.3;
const STUD_H = 1.8;
const STUD_FILLET = 0.35;

/** 金屬積木（金色底板） */
const METAL_IDS = new Set(['plate_gold']);

// ---------------------------------------------------------------------------
// 材質：ABS 亮面塑膠 / 金屬漆
// ---------------------------------------------------------------------------

const PLASTIC_GLSL = /* glsl */ `${MICROFACET_GLSL}
uniform vec3 uTint;
uniform float uOpacity;
uniform float uMetal;
uniform float uRough;
vec4 shade() {
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(vec3(-0.45, -0.65, 1.0));
  vec3 rim = normalize(vec3(0.65, 0.5, 0.55));
  // 射出成型的細微起伏：只動粗糙度，顏色維持均勻
  float micro = vnoise3(vWorldPos * 6.0);
  float rough = clamp(uRough + (micro - 0.5) * 0.06, 0.08, 0.9);
  // 金屬金比塑膠黃深一點、偏橘
  vec3 base = uTint * mix(vec3(1.0), vec3(0.98, 0.8, 0.52), uMetal);
  float nl = dot(N, L);
  // 包覆光：ABS 有一點透光，暗面不會死黑；背光面再帶一點本色（次表面）
  float wrap = max((nl + 0.35) / 1.35, 0.0);
  vec3 diffuse = base * (vec3(0.36, 0.40, 0.46) + vec3(0.86, 0.79, 0.66) * wrap * 0.72);
  diffuse += base * base * max(-nl, 0.0) * 0.12;
  diffuse *= 1.0 - uMetal * 0.72;
  // 越靠近地面越暗
  float ao = mix(0.62, 1.0, smoothstep(0.0, 4.0, vWorldPos.z));
  vec3 F0 = mix(vec3(0.05), base, uMetal);
  vec3 c = diffuse * ao;
  c += ggxSpecular(N, V, L, F0, rough) * vec3(1.0, 0.95, 0.86) * 1.6;
  c += ggxSpecular(N, V, rim, F0, rough) * vec3(0.30, 0.45, 0.60) * 0.8;
  // 亮面塑膠表層：很銳利的一點反光（圓角、凸點頂緣最明顯）
  c += ggxSpecular(N, V, L, vec3(0.04), 0.09) * vec3(1.0, 0.97, 0.9) * 0.55;
  vec3 R = reflect(-V, N);
  vec3 env = gardenEnvironment(R, rough);
  // 金屬：環境偏暖、上亮下暗的對比拉大，才看得出是金屬而不是黃色塑膠
  env = mix(env, vec3(1.0, 0.86, 0.6) * (0.45 + 0.95 * smoothstep(-0.2, 0.9, R.z)), 0.55 * uMetal);
  c += env * schlickFresnel(F0, max(dot(N, V), 0.0)) * (1.0 - rough * 0.5) * mix(0.8, 1.5, uMetal);
  return vec4(c, uOpacity);
}`;

function plasticMaterial(def: DecoDefine, opts: DecoObjectOptions): ProcMaterial {
  const metal = METAL_IDS.has(def.id);
  const transparent = !!opts.ghost || !!opts.editing;
  return new ProcMaterial({
    name: `brick-${metal ? 'metal' : 'abs'}-${def.id}`,
    fragment: PLASTIC_GLSL,
    uniforms: {
      uTint: { value: new T.Color(def.color) },
      uOpacity: { value: opts.ghost ? 0.56 : 1 },
      uMetal: { value: metal ? 0.9 : 0 },
      uRough: { value: metal ? 0.26 : 0.2 },
    },
    transparent,
    depthWrite: !opts.ghost,
  });
}

// ---------------------------------------------------------------------------
// 造型
// ---------------------------------------------------------------------------

/** 凸點：車床曲面（側面 → 圓角頂緣 → 平頂，中央一圈淺淺的凸起圓環）；底部埋進磚身 */
function studGeometry(): T.BufferGeometry {
  const r = STUD_R;
  const h = STUD_H;
  const f = STUD_FILLET;
  const pts: T.Vector2[] = [new T.Vector2(r, -0.1), new T.Vector2(r, h - f)];
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    pts.push(new T.Vector2(r - f + f * Math.cos(a), h - f + f * Math.sin(a)));
  }
  pts.push(
    new T.Vector2(r * 0.64, h),
    new T.Vector2(r * 0.6, h + 0.07),
    new T.Vector2(r * 0.46, h + 0.07),
    new T.Vector2(r * 0.42, h),
    new T.Vector2(0, h),
  );
  return zUp(new T.LatheGeometry(pts, 28));
}

/** 一件積木的幾何（已合併）；rot 已套進佔地 */
function brickGeometry(def: DecoDefine, rot: 0 | 1): T.BufferGeometry {
  const f = decoFootprint(def, rot);
  const w = f.w * CELL - INSET * 2;
  const d = f.d * CELL - INSET * 2;
  const bodyH = Math.max(1, def.h * CELL - STUD_H);
  const layers = def.h >= 1 ? Math.max(1, Math.round(def.h)) : 1;
  const lh = bodyH / layers;
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < layers; i++) {
    parts.push(zUp(new RoundedBoxGeometry(w, lh, d, 3, Math.min(RADIUS, lh / 3))).translate(0, 0, lh * (i + 0.5)));
  }
  const stud = studGeometry();
  for (let x = 0; x < f.w; x++) {
    for (let y = 0; y < f.d; y++) {
      parts.push(stud.clone().translate((x + 0.5 - f.w / 2) * CELL, (y + 0.5 - f.d / 2) * CELL, bodyH));
    }
  }
  stud.dispose();
  return mergeAll(parts);
}

/** 底下一圈柔和的接觸陰影 */
function contactShadow(def: DecoDefine, rot: 0 | 1, opts: DecoObjectOptions): T.Mesh {
  const f = decoFootprint(def, rot);
  const shadow = new T.Mesh(
    new T.PlaneGeometry(f.w * CELL * 1.15, f.d * CELL * 1.15),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { opacity: { value: opts.ghost ? 0.12 : 0.32 } },
      vertexShader: 'varying vec2 vUvShadow;void main(){vUvShadow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 vUvShadow;uniform float opacity;void main(){vec2 p=vUvShadow*2.-1.;vec2 q=max(abs(p)-.72,0.)/.28;float a=1.-smoothstep(0.,1.,length(q));gl_FragColor=vec4(.02,.03,.04,a*opacity);}',
    }),
  );
  shadow.name = 'brick-contact-shadow';
  shadow.position.z = 0.035;
  shadow.renderOrder = opts.editing || opts.ghost ? 8 : 0;
  return shadow;
}

export function buildBrickDeco(def: DecoDefine, rot: 0 | 1, opts: DecoObjectOptions): T.Object3D {
  const mat = plasticMaterial(def, opts);
  const mesh = new T.Mesh(brickGeometry(def, rot), mat);
  mesh.name = mat.name;
  if (opts.ghost || opts.editing) mesh.renderOrder = 10;
  const root = new T.Group();
  root.add(contactShadow(def, rot, opts), mesh);
  return root;
}
