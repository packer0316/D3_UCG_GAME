/**
 * 月球場景（SPEC §18）：風格化的月球表面 + 星雲星空 + 地球升起，全部程式產生。
 *
 * 美術方向：跟遊戲其他場景一樣是手繪感，不走寫實 ——
 *   明亮的銀藍 / 淡紫月面、少量乾淨的隕石坑（亮邊、柔和的明暗，沒有黑硬陰影）、
 *   發光水晶、彩色星雲、地球與環狀行星、流星。
 *
 * 構圖（第二種相機）：
 *   戰鬥區 = 平的月面（隕石坑只有烘焙的法線與遮罩，沒有幾何起伏）
 *   戰鬥區後方（y > 480）= 水晶、月岩、右側月面基地、左側火箭
 *   遠景 = 層層山丘；天空帶 = 星雲、星星、地球、環狀行星
 */
import * as THREE from 'three';
import { bakeTexture } from './bake';
import {
  SCENE_CAMERA,
  registerProceduralScene,
  skyDirection,
  type ProceduralScene,
  type ProceduralSceneContext,
} from './ProceduralScene';
import { fbm, ridged, seededRandom, smoothstep } from './noise';
import { ADDITIVE, GLOW_FRAGMENT, Order, SceneKit, at, makeGlowMesh, makeMotes, makeRockGeometry, mergeAll, tint, zUp, type Glow } from './sceneKit';
import { buildPolarTerrain, playAreaMask } from './terrain';

// ------------------------------------------------------------------
// 設定
// ------------------------------------------------------------------

/** 主光：左後方（方位角以 +Y 為 0、往 +X 為正） */
const SUN_AZ = -112;
const SUN = new THREE.Vector3(...skyDirection(SUN_AZ, 32));
/** 影子方向（地面上，背向主光） */
const SHADOW_DIR = new THREE.Vector2(-SUN.x, -SUN.y).normalize();

/** 地球：正前方偏左、剛升到地平線上（半徑以角度表示） */
const EARTH = { az: -11, el: 2.7, radiusDeg: 3.3, distance: 12000 };
/** 環狀行星：右上方的小行星 */
const PLANET = { az: 14, el: 5.3, radiusDeg: 1.05, distance: 13000 };

/** 隕石坑貼圖一格的世界大小 */
const CRATER_TILE = 460;
/** 高度圖編碼：存 0.5 + h × HEIGHT_GAIN（h 以「一格貼圖」為單位） */
const HEIGHT_GAIN = 6;

/** 月面基地 / 火箭的位置（周圍地形整平） */
const BASE = { x: 300, y: 660 };
const ROCKET = { x: -300, y: 620 };
const PADS = [
  { ...BASE, r: 150 },
  { ...ROCKET, r: 80 },
];

/** 中景的環形丘（幾何）：r = 半徑、h = 高 */
const RING_HILLS = [
  { x: -640, y: 980, r: 250, h: 26 },
  { x: 780, y: 1300, r: 330, h: 34 },
  { x: -120, y: 1800, r: 430, h: 40 },
  { x: -1350, y: 1600, r: 520, h: 52 },
  { x: 1600, y: 2200, r: 600, h: 60 },
];

/** 水晶的顏色 */
const CRYSTAL_COLORS = [0x4fe8ff, 0xa97bff, 0xff7ad9, 0x6fffd2];

// ------------------------------------------------------------------
// 地形高度（CPU）
// ------------------------------------------------------------------

function moonHeight(x: number, y: number): number {
  const m = playAreaMask(x, y);
  if (m <= 0) return 0;
  const dx = x - SCENE_CAMERA.x;
  const dy = y - SCENE_CAMERA.y;
  const r = Math.hypot(dx, dy);
  const az = Math.atan2(dx, dy);

  // 緩和的起伏
  let h = (fbm(x * 0.0035, y * 0.0035, 3, 3) - 0.5) * 40;
  // 環形丘：一圈柔和的隆起、中間略低
  for (const c of RING_HILLS) {
    const d = Math.hypot(x - c.x, y - c.y) / c.r;
    if (d > 1.9) continue;
    h += Math.exp(-(((d - 1) / 0.22) ** 2)) * c.h;
    if (d < 1) h += (d * d - 1) * c.h * 0.5;
  }
  // 遠方的山；地球的方向留低一點
  const range = smoothstep(1300, 2600, r);
  const gap = 0.35 + 0.65 * smoothstep(0.05, 0.4, Math.abs(az - (EARTH.az * Math.PI) / 180));
  h += range * gap * (40 + 210 * ridged(x * 0.0011, y * 0.0011, 4, 21));
  // 最遠處墊高一圈，蓋住地形盡頭與地平線之間的縫
  h += smoothstep(7000, 9500, r) * 140;

  // 基地 / 火箭周圍整平
  let flat = 1;
  for (const p of PADS) flat = Math.min(flat, smoothstep(p.r * 0.55, p.r, Math.hypot(x - p.x, y - p.y)));
  return h * m * flat;
}

// ------------------------------------------------------------------
// 烘焙貼圖：風格化隕石坑（高度 → 法線）+ 坑緣 / 坑內遮罩
// ------------------------------------------------------------------

/**
 * 第一趟：RG = 高度（16 位元）、B = 坑緣遮罩、A = 坑內遮罩。
 * 坑的外形是手繪感的：平滑的淺盤 + 一圈乾淨的坑緣；每格最多一個、整個坑留在格子內（不互相重疊）。
 */
const CRATER_HEIGHT = /* glsl */ `
vec3 craterLayer(vec2 uv, float n, float seed, float rMin, float rMax, float density, float depth) {
  vec2 p = uv * n;
  vec2 ip = floor(p);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ip + vec2(float(i), float(j));
      vec2 cw = mod(c, n) + seed;
      float exists = step(hash12(cw * 1.37 + 3.1), density);
      float rad = mix(rMin, rMax, hash12(cw + 9.7));
      vec2 center = c + 0.5 + (hash22(cw) - 0.5) * (1.0 - 2.4 * rad);
      float d = length(p - center) / rad;
      float bowl = smoothstep(0.92, 0.40, d);
      float rim = exp(-pow((d - 0.96) / 0.10, 2.0));
      acc.x += exists * rad * (rim * 0.10 - bowl * depth) / n;
      acc.y = max(acc.y, exists * exp(-pow((d - 0.96) / 0.075, 2.0)));
      acc.z = max(acc.z, exists * smoothstep(0.92, 0.55, d));
    }
  }
  return acc;
}
vec4 bake(vec2 uv) {
  vec3 a = craterLayer(uv, 2.0, 5.0, 0.24, 0.40, 0.60, 0.16);
  vec3 b = craterLayer(uv, 5.0, 17.0, 0.18, 0.38, 0.40, 0.24);
  vec3 c = craterLayer(uv, 11.0, 29.0, 0.16, 0.36, 0.32, 0.28);
  float h = a.x + b.x + c.x + (pfbm(uv * 3.0, 3.0) - 0.5) * 0.014;
  return vec4(pack16(0.5 + h * ${HEIGHT_GAIN.toFixed(1)}), max(max(a.y, b.y), c.y), max(max(a.z, b.z), c.z));
}
`;

/** 第二趟：RG = 法線 xy（由高度圖的斜率）、B / A = 遮罩照抄 */
const CRATER_NORMAL = /* glsl */ `
uniform sampler2D uHeight;
uniform float uTexel;
float H(vec2 uv) {
  return (unpack16(texture2D(uHeight, uv).rg) - 0.5) / ${HEIGHT_GAIN.toFixed(1)};
}
vec4 bake(vec2 uv) {
  float e = uTexel * 1.5;
  vec2 slope = vec2(H(uv + vec2(e, 0.0)) - H(uv - vec2(e, 0.0)), H(uv + vec2(0.0, e)) - H(uv - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-slope, 1.0));
  vec4 src = texture2D(uHeight, uv);
  return vec4(n.xy * 0.5 + 0.5, src.b, src.a);
}
`;

function bakeCraters(renderer: THREE.WebGLRenderer, size: number): THREE.Texture {
  const height = bakeTexture(renderer, { size, fragment: CRATER_HEIGHT, data: true });
  const tex = bakeTexture(renderer, { size, fragment: CRATER_NORMAL, uniforms: { uHeight: { value: height }, uTexel: { value: 1 / size } } });
  height.dispose();
  return tex;
}

// ------------------------------------------------------------------
// Shader
// ------------------------------------------------------------------

/**
 * 風格化受光：把「朝向主光的程度」壓成柔和的兩階（暗面偏藍紫、亮面偏白），再加迎光的亮邊。
 * 暗面只是比亮面深一點，不會變黑。
 */
const GLSL_TOON = /* glsl */ `
uniform vec3 uSun;
vec3 toonLight(vec3 base, vec3 N) {
  float l = dot(N, uSun) * 0.5 + 0.5;
  float band = smoothstep(0.38, 0.72, l);
  vec3 c = base * mix(vec3(0.70, 0.74, 0.98), vec3(1.10, 1.08, 1.06), band);
  return c + vec3(0.90, 0.97, 1.0) * 0.26 * smoothstep(0.80, 0.97, l);
}
// 遠方泛著星雲的光：左邊偏紫、右邊偏青
vec3 spaceHaze(vec3 col, float strength) {
  float d = length(vViewPos);
  float haze = 1.0 - exp(-d / 2600.0);
  vec3 hazeCol = mix(vec3(0.52, 0.44, 0.90), vec3(0.38, 0.72, 0.95), smoothstep(-0.6, 0.6, (vWorldPos.x - cameraPosition.x) / d));
  return mix(col, hazeCol, haze * strength);
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform sampler2D uCrater;
${GLSL_TOON}
vec4 shade() {
  vec2 w = vWorldPos.xy;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float dist = length(vViewPos);
  // 山坡（幾何起伏）上不畫隕石坑；太遠也淡掉
  float steep = smoothstep(0.985, 0.80, vNormal.z);
  float detail = (1.0 - steep) * smoothstep(2600.0, 700.0, dist);
  vec4 c1 = texture2D(uCrater, w / ${CRATER_TILE.toFixed(1)});
  vec4 c2 = texture2D(uCrater, w / ${(CRATER_TILE * 0.27).toFixed(1)} + vec2(0.37, 0.61));
  // 第二層是小坑：只留淡淡的起伏與圈，避免大坑裡面又一堆圈
  vec2 bump = ((c1.xy - 0.5) * 2.0 + (c2.xy - 0.5) * 0.6) * detail;
  vec3 N = normalize(vec3(vNormal.xy + bump * 1.4, vNormal.z));
  float rim = max(c1.z, c2.z * 0.4) * detail;
  float bowl = max(c1.w, c2.w * 0.45) * detail;

  // 手繪感的底色：銀藍 / 淡紫大色塊
  float m1 = fbm(w * 0.0032 + 3.0);
  float m2 = fbm(w * 0.011 + 11.0);
  vec3 base = mix(vec3(0.62, 0.69, 0.92), vec3(0.54, 0.60, 0.88), smoothstep(0.32, 0.68, m1));
  base = mix(base, vec3(0.76, 0.74, 0.96), smoothstep(0.52, 0.78, m2) * 0.55);
  base = mix(base, vec3(0.46, 0.52, 0.84), bowl * 0.8);
  // 山：山腳深藍、越高越亮（頂端帶粉紫）
  vec3 hill = mix(vec3(0.40, 0.44, 0.78), vec3(0.84, 0.78, 0.98), smoothstep(10.0, 230.0, vWorldPos.z));
  base = mix(base, hill, steep);

  vec3 col = toonLight(base, N);
  col += vec3(0.85, 0.95, 1.0) * rim * 0.28;
  // 山的輪廓光
  float fres = pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 3.0);
  col += vec3(0.55, 0.75, 1.0) * fres * steep * 0.5;

  // 星塵：地上零星的閃光
  vec2 sp = w * 0.33;
  vec2 ip = floor(sp);
  float h = hash12(ip);
  float tw = pow(0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 60.0), 10.0);
  float sd = length(fract(sp) - 0.5 - (hash22(ip + 3.0) - 0.5) * 0.6);
  col += vec3(0.85, 0.96, 1.0) * step(0.94, h) * smoothstep(0.16, 0.0, sd) * tw * smoothstep(900.0, 200.0, dist);

  return vec4(spaceHaze(col, 0.62), 1.0);
}
`;

const ROCK_FRAGMENT = /* glsl */ `
${GLSL_TOON}
vec4 shade() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 base = mix(vec3(0.50, 0.54, 0.84), vec3(0.70, 0.70, 0.94), smoothstep(-0.2, 0.9, N.z)) * vColor;
  vec3 col = toonLight(base, N);
  col += vec3(0.6, 0.8, 1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.35;
  return vec4(spaceHaze(col, 0.55), 1.0);
}
`;

/** 貼在地上的柔和影子（藍紫色，不是黑的） */
const SHADOW_FRAGMENT = /* glsl */ `
vec4 shade() {
  vec2 q = (vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, length(q)) * (1.0 - 0.4 * vUv.x);
  return vec4(vec3(0.22, 0.25, 0.58), a * 0.42);
}
`;

/** 水晶：頂點色 = 顏色；每個切面明暗不同、邊緣發亮、緩慢脈動 */
const CRYSTAL_FRAGMENT = /* glsl */ `
vec4 shade() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float facet = dot(N, normalize(vec3(-0.5, -0.6, 0.6))) * 0.5 + 0.5;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  float pulse = 0.86 + 0.14 * sin(uTime * 1.6 + vWorldPos.x * 0.03 + vWorldPos.y * 0.02);
  vec3 deep = vColor * 0.62;
  vec3 bright = mix(vColor, vec3(1.0), 0.6);
  vec3 c = mix(deep, bright, clamp(vUv.y * 0.55 + facet * 0.6, 0.0, 1.0));
  c += vec3(1.0) * fres * 0.5;
  return vec4(c * pulse * 1.12, 1.0);
}
`;

/** 基地 / 火箭外殼：頂點色 = 底色；uv 畫面板接縫 */
const HULL_FRAGMENT = /* glsl */ `
${GLSL_TOON}
vec4 shade() {
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 cell = vUv * vec2(10.0, 6.0);
  vec2 g = fract(cell);
  float seam = smoothstep(0.0, 0.05, g.x) * smoothstep(0.0, 0.05, g.y);
  vec3 base = vColor * (0.88 + 0.12 * seam);
  vec3 col = toonLight(base, N);
  col += vec3(0.6, 0.8, 1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.3;
  return vec4(spaceHaze(col, 0.4), 1.0);
}
`;

/** 自發光（窗戶、燈條）：頂點色 = 顏色，略微呼吸 */
const EMISSIVE_FRAGMENT = /* glsl */ `
vec4 shade() {
  float breath = 0.9 + 0.1 * sin(uTime * 1.3 + vWorldPos.x * 0.05);
  return vec4(vColor * breath, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
// 一層星星：方向乘上 scale 後落在哪個格子，每格最多一顆；cross > 0 加十字星芒
vec3 starLayer(vec3 dir, float scale, float density, float size, float cross) {
  vec3 p = dir * scale;
  vec3 ip = floor(p);
  vec3 h = hash33(ip);
  vec3 q = p - (ip + 0.5 + (hash33(ip + 7.3) - 0.5) * 0.6);
  float d = length(q);
  float bright = 0.25 + 0.75 * pow(h.y, 5.0);
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + h.z * 3.0) + h.y * 40.0);
  vec3 tint = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.82, 0.92), smoothstep(0.5, 1.0, h.z));
  float core = smoothstep(size, 0.0, d);
  float rays = cross * bright * (exp(-abs(q.x) * 34.0) * exp(-abs(q.z) * 5.0) + exp(-abs(q.z) * 34.0) * exp(-abs(q.x) * 5.0)) * step(abs(q.y), 0.5);
  return tint * (core + rays) * bright * twinkle * step(h.x, density);
}
// 流星：每個 slot 大約每 9 秒一顆，從天空帶斜斜劃過（ae = 方位角、仰角，弧度）
float meteor(vec2 ae, float slot) {
  float t = uTime * 0.11 + slot * 0.37;
  float life = fract(t) / 0.14;
  if (life > 1.0) return 0.0;
  vec2 s = vec2(floor(t), slot * 17.0);
  vec2 start = vec2(mix(-0.42, 0.42, hash12(s)), mix(0.075, 0.125, hash12(s + 1.7)));
  vec2 v = normalize(vec2(mix(-1.0, -0.5, hash12(s + 4.1)), -0.2));
  if (hash12(s + 9.3) > 0.5) v.x = -v.x;
  vec2 d = ae - (start + v * 0.30 * life);
  float along = dot(d, -v);
  float across = length(d + v * along);
  float a = step(0.0, along) * smoothstep(0.075, 0.0, along) * smoothstep(0.0028, 0.0, across);
  return a * sin(life * 3.14159);
}
vec4 shade() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  float el = asin(clamp(dir.z, -1.0, 1.0));
  vec3 col = mix(vec3(0.07, 0.05, 0.20), vec3(0.02, 0.02, 0.10), smoothstep(0.0, 0.5, el));

  // 星雲：洋紅、青兩團大色塊 + 橘色亮心
  float n1 = fbm3(dir * 3.2 + vec3(1.7, 0.0, 4.2));
  float n3 = fbm3(dir * 2.4 + vec3(9.0, 2.0, 5.0));
  float n2 = fbm3(dir * 6.5 + vec3(n1 * 2.0, 3.1, n3));
  col += vec3(0.80, 0.22, 0.78) * smoothstep(0.42, 0.78, n1) * 0.60;
  col += vec3(0.15, 0.58, 0.90) * smoothstep(0.45, 0.80, n3) * 0.55;
  col += vec3(1.0, 0.58, 0.32) * smoothstep(0.60, 0.90, n2) * smoothstep(0.50, 0.80, n1) * 0.40;
  col *= 0.75 + 0.5 * n2;
  // 地平線一圈柔光
  col += vec3(0.34, 0.40, 0.85) * exp(-max(el, 0.0) * 14.0) * 0.6;

  col += starLayer(dir, 70.0, 0.10, 0.20, 1.0) * 1.7;
  col += starLayer(dir, 190.0, 0.32, 0.34, 0.0) * 1.0;
  col += starLayer(dir, 420.0, 0.50, 0.42, 0.0) * 0.6;

  vec2 ae = vec2(atan(dir.x, dir.y), el);
  col += vec3(0.9, 0.97, 1.0) * (meteor(ae, 1.0) + meteor(ae, 2.0)) * 1.6;
  return vec4(col, 1.0);
}
`;

const EARTH_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
vec3 onSphere(float lon, float lat) {
  return vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
}
vec4 shade() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float lat = (vUv.y - 0.5) * 3.14159265;
  float lon = vUv.x * 6.2831853 + uTime * 0.012;
  vec3 p = onSphere(lon, lat);

  // 海陸（顏色鮮明、邊界乾淨）
  float cont = fbm3(p * 2.1 + vec3(3.7, 1.3, 5.1)) + 0.30 * fbm3(p * 5.0 + 9.0) - 0.15;
  float land = smoothstep(0.50, 0.53, cont);
  float polar = smoothstep(0.82, 0.90, abs(p.y) + (fbm3(p * 6.0) - 0.5) * 0.10);
  vec3 ocean = mix(vec3(0.06, 0.30, 0.82), vec3(0.16, 0.60, 0.96), smoothstep(0.40, 0.50, cont));
  float dry = fbm3(p * 3.5 + 20.0) + (1.0 - abs(p.y)) * 0.15 - 0.1;
  vec3 ground = mix(vec3(0.26, 0.74, 0.36), vec3(0.88, 0.78, 0.46), smoothstep(0.45, 0.62, dry));
  vec3 surf = mix(mix(ocean, ground, land), vec3(0.96, 0.98, 1.0), polar);

  // 雲：比地表轉得快一點，帶旋渦
  vec3 pc = onSphere(lon + uTime * 0.008, lat);
  float warp = fbm3(pc * 3.0 + 4.0);
  float clouds = smoothstep(0.50, 0.62, fbm3(pc * 4.5 + vec3(warp * 1.8, 0.0, warp * 1.3)));
  surf = mix(surf, vec3(1.0), clouds * 0.95);

  // 日夜
  float ndl = dot(N, uSun);
  float day = smoothstep(-0.10, 0.22, ndl);
  vec3 lit = surf * (0.42 + 0.78 * smoothstep(-0.1, 0.9, ndl));
  float city = land * (1.0 - polar) * smoothstep(0.62, 0.8, vnoise3(p * 40.0)) * smoothstep(0.5, 0.6, fbm3(p * 9.0 + 2.0));
  vec3 night = vec3(0.03, 0.05, 0.16) + vec3(1.0, 0.8, 0.45) * city * (1.0 - clouds);
  vec3 col = mix(night, lit, day);

  // 大氣：邊緣一圈亮青色
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  col += vec3(0.35, 0.75, 1.0) * rim * (0.30 + 0.90 * day);
  return vec4(col, 1.0);
}
`;

/** 星球外圍的光暈（比星球大一圈的球，畫背面、加色）：uColor = 顏色 */
const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uColor;
vec4 shade() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  // 背面：外緣 dot = 0，往星球邊緣方向越來越負
  float f = clamp(-dot(N, V) / 0.42, 0.0, 1.0);
  float day = smoothstep(-0.45, 0.45, dot(N, uSun));
  float a = pow(f, 1.8) * (0.25 + 0.75 * day);
  return vec4(uColor * a * 1.3, a);
}
`;

/** 環狀行星：橫條紋的氣體行星 */
const PLANET_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
vec4 shade() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float lat = vUv.y + (fbm(vec2(vUv.x * 14.0 + uTime * 0.01, vUv.y * 5.0)) - 0.5) * 0.06;
  float bands = sin(lat * 34.0) * 0.5 + 0.5;
  vec3 surf = mix(vec3(0.98, 0.72, 0.52), vec3(1.0, 0.90, 0.74), bands);
  surf = mix(surf, vec3(0.95, 0.55, 0.62), smoothstep(0.55, 0.9, sin(lat * 11.0 + 1.0) * 0.5 + 0.5) * 0.5);
  float ndl = dot(N, uSun);
  vec3 col = surf * (0.38 + 0.8 * smoothstep(-0.2, 0.9, ndl));
  col += vec3(1.0, 0.8, 0.7) * pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.4;
  return vec4(col, 1.0);
}
`;

/** 行星環：依半徑畫出深淺相間的環帶 */
const RING_FRAGMENT = /* glsl */ `
uniform float uInner;
vec4 shade() {
  float r = length(vUv - 0.5) * 2.0;
  float t = (r - uInner) / (1.0 - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float bands = 0.55 + 0.45 * sin(t * 46.0) * sin(t * 13.0 + 1.0);
  float gap = smoothstep(0.02, 0.0, abs(t - 0.56)) ;
  float a = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t) * bands * (1.0 - gap) * 0.85;
  vec3 col = mix(vec3(1.0, 0.86, 0.70), vec3(0.96, 0.66, 0.74), t);
  return vec4(col, a);
}
`;

// ------------------------------------------------------------------
// 幾何
// ------------------------------------------------------------------

/** 水晶：六角尖柱（每個切面各自的法線） */
function makeShardGeometry(): THREE.BufferGeometry {
  const profile = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.42, 0.64), new THREE.Vector2(0.001, 1)];
  const geo = zUp(new THREE.LatheGeometry(profile, 6)).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------
// 月面基地 / 火箭
// ------------------------------------------------------------------

const WHITE = 0xf2f5fb;
const GREY = 0xa8b2c8;
const DARK = 0x4a5270;
const RED = 0xf0584a;
const TEAL = 0x35c4d8;
const PANEL = 0x3566d8;
const WARM = 0xffe2a8;
const CYAN_LIGHT = 0x9af4ff;

function buildBase(hull: THREE.BufferGeometry[], lights: THREE.BufferGeometry[], glows: Glow[], blink: Glow[]): void {
  const { x: bx, y: by } = BASE;

  // 圓頂：半球 + 底座環 + 一圈窗
  const dome = (dx: number, dy: number, r: number) => {
    hull.push(at(tint(zUp(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)), WHITE), bx + dx, by + dy, 0));
    hull.push(at(tint(zUp(new THREE.CylinderGeometry(r * 1.04, r * 1.1, 6, 40)), TEAL), bx + dx, by + dy, 3));
    const windows = Math.round(r / 3.4);
    for (let i = 0; i < windows; i++) {
      const a = (i / windows) * Math.PI * 2;
      const w = tint(new THREE.BoxGeometry(r * 0.2, 1.4, r * 0.15), WARM);
      w.rotateZ(a + Math.PI / 2);
      lights.push(at(w, bx + dx + Math.cos(a) * r * 0.945, by + dy + Math.sin(a) * r * 0.945, r * 0.33));
    }
    glows.push({ x: bx + dx, y: by + dy - r * 0.9, z: r * 0.35, size: r * 1.8, color: 0x9a6a2c });
  };
  dome(0, 0, 42);
  dome(-80, 36, 28);
  dome(72, 46, 24);

  // 連通管
  const tube = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = tint(new THREE.CylinderGeometry(4.5, 4.5, len, 14), GREY);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2);
    hull.push(at(g, bx + (x0 + x1) / 2, by + (y0 + y1) / 2, 4));
  };
  tube(-32, 14, -60, 27);
  tube(34, 20, 56, 36);

  // 天線塔：柱 + 橫桿，頂端紅燈閃爍
  const mx = bx + 122;
  const my = by - 6;
  hull.push(at(tint(zUp(new THREE.CylinderGeometry(0.9, 1.8, 96, 8)), GREY), mx, my, 48));
  for (const z of [30, 55, 78]) hull.push(at(tint(new THREE.BoxGeometry(18 - z * 0.12, 0.8, 0.8), GREY), mx, my, z));
  blink.push({ x: mx, y: my, z: 97, size: 18, color: 0xff4a3a });

  // 碟型天線：碗口朝向地球（球的下半球冠 = 開口朝上的碗，再轉向）
  const dx = bx - 132;
  const dy = by - 24;
  hull.push(at(tint(zUp(new THREE.CylinderGeometry(1.6, 2.6, 18, 10)), GREY), dx, dy, 9));
  const dish = tint(new THREE.SphereGeometry(24, 32, 10, 0, Math.PI * 2, Math.PI - 0.62, 0.62), WHITE);
  dish.translate(0, 24, 0);
  // 本地 +Y（碗口方向）→ 朝向地球的方位、仰角約 35°
  dish.rotateX(Math.PI / 2 - 0.95);
  dish.rotateZ((-EARTH.az * Math.PI) / 180);
  hull.push(at(dish, dx, dy, 20));

  // 太陽能板：三組，面向主光
  for (const [px, py] of [
    [-44, -96],
    [16, -104],
    [76, -96],
  ]) {
    hull.push(at(tint(zUp(new THREE.CylinderGeometry(0.8, 0.8, 12, 6)), GREY), bx + px, by + py, 6));
    const panel = tint(new THREE.BoxGeometry(46, 1, 17), PANEL);
    panel.rotateX(-0.55);
    panel.rotateZ(((SUN_AZ + 180) * Math.PI) / 180);
    hull.push(at(panel, bx + px, by + py, 16));
  }

  // 停機坪邊燈
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glows.push({ x: bx + Math.cos(a) * 118, y: by - 24 + Math.sin(a) * 66, z: 2, size: 9, color: 0x45c8ff });
  }
}

/** 復古火箭：白色機身、紅色鼻錐與尾翼、發光舷窗 */
function buildRocket(hull: THREE.BufferGeometry[], lights: THREE.BufferGeometry[], glows: Glow[]): void {
  const { x, y } = ROCKET;
  const S = 1.7;
  const put = (g: THREE.BufferGeometry, dz: number, list = hull) => list.push(at(g.scale(S, S, S), x, y, dz * S));
  put(tint(zUp(new THREE.CylinderGeometry(6.2, 8.4, 34, 24)), WHITE), 25);
  put(tint(zUp(new THREE.ConeGeometry(6.2, 15, 24)), RED), 49.5);
  put(tint(zUp(new THREE.CylinderGeometry(8.5, 8.9, 4, 24)), RED), 10);
  put(tint(zUp(new THREE.CylinderGeometry(3.6, 6, 5, 16, 1, true)), DARK), 5.5);
  // 三片尾翼（也是腳）：三角形薄片，從機身往外、往下張開
  const finShape = new THREE.Shape([new THREE.Vector2(0, 2), new THREE.Vector2(11, -1), new THREE.Vector2(11, 3), new THREE.Vector2(0, 20)]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const fin = tint(new THREE.ExtrudeGeometry(finShape, { depth: 1.4, bevelEnabled: false }), RED);
    // Shape 的 X = 往外、Y = 往上 → 立起來（Y → Z），厚度置中，移到機身外緣，再繞 Z 轉到各自的方位
    fin.translate(0, 0, -0.7);
    fin.rotateX(Math.PI / 2);
    fin.translate(7.2, 0, 0);
    fin.rotateZ(a);
    hull.push(at(fin.scale(S, S, S), x, y, 1.2 * S));
  }
  // 舷窗（面向相機）
  const port = tint(new THREE.CylinderGeometry(2.7, 2.7, 0.8, 20), CYAN_LIGHT);
  port.translate(0, -7.2, 30);
  lights.push(at(port.scale(S, S, S), x, y, 0));
  const frame = tint(new THREE.TorusGeometry(3.1, 0.6, 8, 20).rotateX(Math.PI / 2), GREY);
  frame.translate(0, -7.3, 30);
  hull.push(at(frame.scale(S, S, S), x, y, 0));
  glows.push({ x, y: y - 16, z: 30 * S, size: 26, color: 0x2a88a8 });
  glows.push({ x, y: y - 6, z: 4, size: 46, color: 0x9a5a22 });
}

// ------------------------------------------------------------------
// 場景
// ------------------------------------------------------------------

function buildMoonScene(ctx: ProceduralSceneContext): ProceduralScene {
  const kit = new SceneKit();
  const add = kit.add.bind(kit);
  const material = kit.material.bind(kit);
  const sun = { value: SUN };
  const cam = new THREE.Vector3(SCENE_CAMERA.x, SCENE_CAMERA.y, SCENE_CAMERA.z);
  const additive = ADDITIVE;
  const rnd = seededRandom(20260717);
  const dummy = new THREE.Object3D();

  // ---- 天空（最先畫、不寫深度）
  add(
    new THREE.Mesh(
      new THREE.SphereGeometry(16000, 48, 24),
      material({ name: 'moon-sky', fragment: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false }),
    ),
    Order.sky,
  );

  // ---- 星球 + 光暈
  const body = (def: { az: number; el: number; radiusDeg: number; distance: number }, fragment: string, haloColor: number, haloScale: number) => {
    const pos = cam.clone().addScaledVector(new THREE.Vector3(...skyDirection(def.az, def.el)), def.distance);
    const r = def.distance * Math.tan((def.radiusDeg * Math.PI) / 180);
    const mesh = add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), material({ name: 'planet', fragment, uniforms: { uSun: sun } })), -2);
    mesh.position.copy(pos);
    const halo = add(
      new THREE.Mesh(
        new THREE.SphereGeometry(r * haloScale, 48, 24),
        material({ name: 'planet-halo', fragment: HALO_FRAGMENT, uniforms: { uSun: sun, uColor: { value: new THREE.Color(haloColor) } }, side: THREE.BackSide, ...additive }),
      ),
      -2,
    );
    halo.position.copy(pos);
    return { mesh, pos, r };
  };
  // 地球：自轉軸傾斜（球的極軸是本地 Y）
  body(EARTH, EARTH_FRAGMENT, 0x4aa8ff, 1.1).mesh.rotation.set(1.25, 0.3, 0.4);
  // 環狀行星
  const planet = body(PLANET, PLANET_FRAGMENT, 0xffa070, 1.08);
  // 環面：略朝向相機（看得到環的上面）再往一邊傾斜；行星的極軸跟環面垂直
  const ringTilt = new THREE.Euler(0.38, 0.45, 0);
  planet.mesh.geometry.rotateX(Math.PI / 2);
  planet.mesh.rotation.copy(ringTilt);
  const inner = 1.35 / 2.3;
  const ring = add(
    new THREE.Mesh(
      new THREE.RingGeometry(planet.r * 1.35, planet.r * 2.3, 96),
      material({ name: 'planet-ring', fragment: RING_FRAGMENT, uniforms: { uInner: { value: inner } }, side: THREE.DoubleSide, transparent: true, depthWrite: false }),
    ),
    -2,
  );
  ring.position.copy(planet.pos);
  ring.rotation.copy(ringTilt);

  // ---- 月面
  const craters = bakeCraters(ctx.renderer, 1024);
  const terrain = buildPolarTerrain({
    centerX: 0,
    centerY: -200,
    rMin: 40,
    rMax: 9500,
    ratio: 1.021,
    halfAngle: (78 * Math.PI) / 180,
    angleStep: (0.4 * Math.PI) / 180,
    height: moonHeight,
  });
  add(new THREE.Mesh(terrain, material({ name: 'moon-ground', fragment: GROUND_FRAGMENT, uniforms: { uSun: sun, uCrater: { value: craters } } })), -1);

  /** 戰鬥區之外、看得到的位置（y = 往前的距離範圍） */
  const scatter = (near: number, far: number): { x: number; y: number } | null => {
    for (let tries = 0; tries < 40; tries++) {
      const az = (rnd() - 0.5) * 2 * 0.62;
      const r = near * Math.pow(far / near, rnd());
      const x = SCENE_CAMERA.x + Math.sin(az) * r;
      const y = SCENE_CAMERA.y + Math.cos(az) * r;
      if (playAreaMask(x, y) < 0.2) continue;
      if (PADS.some((p) => Math.hypot(x - p.x, y - p.y) < p.r * 0.8)) continue;
      return { x, y };
    }
    return null;
  };

  // ---- 月岩 + 柔和的影子
  const rocks: { x: number; y: number; s: number; yaw: number; variant: number; shade: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const p = scatter(680, 2600);
    if (!p) continue;
    const r = Math.hypot(p.x - SCENE_CAMERA.x, p.y - SCENE_CAMERA.y);
    rocks.push({ ...p, s: (4 + 14 * Math.pow(rnd(), 2.2)) * (0.6 + r / 1100), yaw: rnd() * Math.PI * 2, variant: Math.floor(rnd() * 3), shade: 0.9 + rnd() * 0.2 });
  }
  const rockMat = material({ name: 'moon-rock', fragment: ROCK_FRAGMENT, uniforms: { uSun: sun } });
  for (let v = 0; v < 3; v++) {
    const list = rocks.filter((k) => k.variant === v);
    const mesh = add(new THREE.InstancedMesh(makeRockGeometry(101 + v * 37), rockMat, list.length), -1);
    list.forEach((k, i) => {
      dummy.position.set(k.x, k.y, moonHeight(k.x, k.y) - 0.15 * k.s);
      dummy.rotation.set(0, 0, k.yaw);
      dummy.scale.setScalar(k.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(k.shade, k.shade, k.shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  const shadowMesh = add(
    new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material({ name: 'moon-shadow', fragment: SHADOW_FRAGMENT, transparent: true, depthWrite: false }), rocks.length),
    -1,
  );
  const shadowYaw = Math.atan2(SHADOW_DIR.y, SHADOW_DIR.x);
  rocks.forEach((k, i) => {
    const len = k.s * 2.4;
    dummy.position.set(k.x + SHADOW_DIR.x * len * 0.4, k.y + SHADOW_DIR.y * len * 0.4, moonHeight(k.x, k.y) + 0.3);
    dummy.rotation.set(0, 0, shadowYaw);
    dummy.scale.set(len, k.s * 1.9, 1);
    dummy.updateMatrix();
    shadowMesh.setMatrixAt(i, dummy.matrix);
  });
  shadowMesh.instanceMatrix.needsUpdate = true;

  // ---- 發光水晶：一叢一叢，主晶 + 周圍的小晶；附光暈與地上的光池
  const clusters: { x: number; y: number; h: number; color: number }[] = [
    { x: -150, y: 540, h: 62, color: CRYSTAL_COLORS[0] },
    { x: 120, y: 520, h: 44, color: CRYSTAL_COLORS[1] },
    { x: -470, y: 800, h: 84, color: CRYSTAL_COLORS[2] },
    { x: 20, y: 900, h: 70, color: CRYSTAL_COLORS[0] },
    { x: 560, y: 900, h: 96, color: CRYSTAL_COLORS[3] },
  ];
  for (let i = 0; i < 16; i++) {
    const p = scatter(720, 2400);
    if (!p || clusters.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 150)) continue;
    const r = Math.hypot(p.x - SCENE_CAMERA.x, p.y - SCENE_CAMERA.y);
    clusters.push({ ...p, h: (34 + rnd() * 50) * (0.7 + r / 1400), color: CRYSTAL_COLORS[Math.floor(rnd() * CRYSTAL_COLORS.length)] });
  }
  const shards: { m: THREE.Matrix4; color: THREE.Color }[] = [];
  const halos: Glow[] = [];
  const pools: Glow[] = [];
  for (const c of clusters) {
    const z = moonHeight(c.x, c.y);
    const color = new THREE.Color(c.color);
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const main = i === 0;
      const a = rnd() * Math.PI * 2;
      const off = main ? 0 : c.h * (0.16 + rnd() * 0.22);
      const h = main ? c.h : c.h * (0.3 + rnd() * 0.42);
      dummy.position.set(c.x + Math.cos(a) * off, c.y + Math.sin(a) * off, z - h * 0.04);
      // 往外傾斜
      const tilt = main ? rnd() * 0.12 : 0.18 + rnd() * 0.42;
      dummy.rotation.set(Math.sin(a) * tilt, -Math.cos(a) * tilt, rnd() * Math.PI);
      dummy.scale.set(h * 0.3, h * 0.3, h);
      dummy.updateMatrix();
      shards.push({ m: dummy.matrix.clone(), color: color.clone().offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.12) });
    }
    halos.push({ x: c.x, y: c.y, z: z + c.h * 0.5, size: c.h * 2.6, color: color.clone().multiplyScalar(0.42).getHex() });
    pools.push({ x: c.x, y: c.y, z: z + 0.5, size: c.h * 3.4, color: color.clone().multiplyScalar(0.5).getHex() });
  }
  const shardMesh = add(new THREE.InstancedMesh(makeShardGeometry(), material({ name: 'moon-crystal', fragment: CRYSTAL_FRAGMENT }), shards.length), -1);
  shards.forEach((s, i) => {
    shardMesh.setMatrixAt(i, s.m);
    shardMesh.setColorAt(i, s.color);
  });
  shardMesh.instanceMatrix.needsUpdate = true;
  const glowMat = (name: string, blinkRate: number) => material({ name, fragment: GLOW_FRAGMENT, vertexColors: true, uniforms: { uBlink: { value: blinkRate } }, ...additive });
  add(makeGlowMesh(pools, glowMat('moon-crystal-pool', 0), true), -1);
  add(makeGlowMesh(halos, glowMat('moon-crystal-halo', 0)), -1);

  // ---- 月面基地 + 火箭
  const hull: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  const glows: Glow[] = [];
  const blink: Glow[] = [];
  buildBase(hull, lights, glows, blink);
  buildRocket(hull, lights, glows);
  add(
    new THREE.Mesh(mergeAll(hull), material({ name: 'moon-hull', fragment: HULL_FRAGMENT, uniforms: { uSun: sun }, vertexColors: true, side: THREE.DoubleSide })),
    -1,
  );
  add(new THREE.Mesh(mergeAll(lights), material({ name: 'moon-lights', fragment: EMISSIVE_FRAGMENT, vertexColors: true })), -1);
  add(makeGlowMesh(glows, glowMat('moon-glow', 0)), -1);
  add(makeGlowMesh(blink, glowMat('moon-blink', 0.7)), -1);

  // ---- 漂浮的光點
  const viewH = { value: 720 };
  const motes = Array.from({ length: 220 }, () => ({
    x: (rnd() - 0.5) * 1000,
    y: -60 + rnd() * 1100,
    z: 4 + rnd() * 120,
    color: new THREE.Color(rnd() < 0.5 ? 0xffffff : CRYSTAL_COLORS[Math.floor(rnd() * CRYSTAL_COLORS.length)]).multiplyScalar(0.7),
  }));
  makeMotes(kit, 'moon-dust', motes, viewH, rnd);

  return {
    root: kit.root,
    materials: kit.materials,
    update: () => {
      viewH.value = ctx.renderer.domElement.height;
    },
  };
}

registerProceduralScene('moon', buildMoonScene);
