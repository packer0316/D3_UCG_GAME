/**
 * 3D 召喚券（SPEC-UGC §4.1）：金色票券的模型 / 材質，以及獎圈中間用的券圖。
 *
 * - 形狀：圓角長方形、左右各一個半圓缺口；擠出成有厚度、帶斜角的實體（ExtrudeGeometry）
 * - 正反面同一張畫布貼圖：左邊存根 ✦ 徽記、虛線撕線，右邊「召喚券」
 * - 材質：自己算光（場景沒有燈）＋高光＋一道掃過的光；側邊是金色
 * 模型原點 = 券的中心；平躺（正面朝上）= 沒有旋轉，正面法線 +Z。
 */
import * as THREE from 'three';
import type { Atlas } from '@engine/assets/AssetManager';
import type { SpriteFrameRef } from '@engine/sprite2d/Sprite2D';

/** 尺寸（世界單位）；厚度 = depth + 2 × bevel */
export const TICKET_SIZE = { w: 15, h: 8.4, depth: 0.32, bevel: 0.1 } as const;
/** 平躺時中心離地的高度 */
export const TICKET_REST_Z = TICKET_SIZE.depth / 2 + TICKET_SIZE.bevel;

/** 圓角 / 缺口半徑（相對於高） */
const CORNER = 0.1;
const NOTCH = 0.13;
/** 存根寬（相對於寬） */
const STUB = 0.3;

// ---------------------------------------------------------------------------
// 形狀
// ---------------------------------------------------------------------------

/** 3D 用（y 向上、以中心為原點） */
function ticketShape(w: number, h: number): THREE.Shape {
  const r = h * CORNER;
  const n = h * NOTCH;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, -n);
  // 缺口往內凹：從下（-90°）順時針經過 180° 到上（90°）
  s.absarc(x1, 0, n, -Math.PI / 2, Math.PI / 2, true);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, n);
  s.absarc(x0, 0, n, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** 畫布用（y 向下、左上為原點）；r / n = 圓角 / 缺口半徑（像素） */
function traceTicket(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, n: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h / 2 - n);
  g.arc(x + w, y + h / 2, n, -Math.PI / 2, Math.PI / 2, true);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + h / 2 + n);
  g.arc(x, y + h / 2, n, Math.PI / 2, -Math.PI / 2, true);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** 四角星 ✦ */
function traceStar(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

// ---------------------------------------------------------------------------
// 貼圖
// ---------------------------------------------------------------------------

const FACE_W = 512;
const FACE_H = Math.round((FACE_W * TICKET_SIZE.h) / TICKET_SIZE.w);

/** 券面（整張畫布 = 券的外框） */
function drawFace(): HTMLCanvasElement {
  const W = FACE_W;
  const H = FACE_H;
  const r = H * CORNER;
  const n = H * NOTCH;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;

  g.save();
  traceTicket(g, 0, 0, W, H, r, n);
  g.clip();
  // 金底
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#fff3c0');
  base.addColorStop(0.28, '#f6cc5c');
  base.addColorStop(0.55, '#dd9f2a');
  base.addColorStop(0.8, '#f4c955');
  base.addColorStop(1, '#c4831a');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // 細斜紋
  g.globalAlpha = 0.09;
  g.strokeStyle = '#6e4100';
  g.lineWidth = 2;
  for (let i = -H; i < W; i += 13) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 上半部打亮
  const sheen = g.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(255,255,240,0.35)');
  sheen.addColorStop(0.45, 'rgba(255,255,240,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);
  // 內框兩道
  const d1 = 13;
  traceTicket(g, d1, d1, W - d1 * 2, H - d1 * 2, r * 0.8, n);
  g.strokeStyle = '#8a540a';
  g.lineWidth = 4;
  g.stroke();
  const d2 = 20;
  traceTicket(g, d2, d2, W - d2 * 2, H - d2 * 2, r * 0.7, n);
  g.strokeStyle = 'rgba(255,247,214,0.85)';
  g.lineWidth = 2;
  g.stroke();
  // 存根撕線
  const sx = W * STUB;
  g.setLineDash([7, 8]);
  g.strokeStyle = 'rgba(105,58,0,0.7)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(sx, 24);
  g.lineTo(sx, H - 24);
  g.stroke();
  g.setLineDash([]);
  g.restore();

  // 外緣
  traceTicket(g, 1.5, 1.5, W - 3, H - 3, r, n);
  g.strokeStyle = '#7a4505';
  g.lineWidth = 3;
  g.stroke();

  // 存根徽記：圓環 + ✦
  const cx = W * STUB * 0.5;
  const cy = H / 2;
  g.beginPath();
  g.arc(cx, cy, H * 0.27, 0, Math.PI * 2);
  const disc = g.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, H * 0.27);
  disc.addColorStop(0, '#b8401f');
  disc.addColorStop(1, '#5a1405');
  g.fillStyle = disc;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#ffe9a6';
  g.stroke();
  traceStar(g, cx, cy, H * 0.2, H * 0.06);
  const star = g.createLinearGradient(cx, cy - H * 0.2, cx, cy + H * 0.2);
  star.addColorStop(0, '#fffbe6');
  star.addColorStop(1, '#f2c14e');
  g.fillStyle = star;
  g.fill();

  // 字
  const tx = W * (STUB + (1 - STUB) / 2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(H * 0.3)}px "Noto Serif TC", "Source Han Serif TC", "PMingLiU", "Songti TC", serif`;
  g.lineJoin = 'round';
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(255,246,212,0.95)';
  g.strokeText('召喚券', tx, H * 0.44);
  g.fillStyle = '#5f2600';
  g.fillText('召喚券', tx, H * 0.44);
  g.font = `700 ${Math.round(H * 0.085)}px Georgia, "Times New Roman", serif`;
  g.fillStyle = '#7a3c00';
  g.fillText('S U M M O N   T I C K E T', tx, H * 0.75);
  return canvas;
}

/** 金色光暈（徑向漸層） */
function drawGlow(): HTMLCanvasElement {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.25, 'rgba(255,205,90,0.65)');
  grad.addColorStop(0.6, 'rgba(255,170,40,0.18)');
  grad.addColorStop(1, 'rgba(255,160,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  // 不做色彩管理（同 AssetManager）
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// 材質
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float useMap;
uniform vec3 color;
uniform float opacity;
uniform float sweep;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vView);
  // 觀察空間的固定光：左上前方
  vec3 L = normalize(vec3(-0.35, 0.65, 0.7));
  vec4 base = useMap > 0.5 ? texture2D(map, vUv) : vec4(color, 1.0);
  float diff = 0.62 + 0.42 * max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 48.0);
  // 掃光：沿斜線移動的亮帶（只在券面）
  float band = useMap > 0.5 ? smoothstep(0.1, 0.0, abs(vUv.x * 0.8 + vUv.y * 0.35 - sweep)) : 0.0;
  // 金色高光（不要整片打白）
  vec3 c = base.rgb * diff + vec3(1.0, 0.86, 0.55) * (spec * 0.4 + band * 0.5);
  gl_FragColor = vec4(c, base.a * opacity);
}`;

export type TicketMaterial = THREE.ShaderMaterial & { uniforms: { sweep: { value: number }; opacity: { value: number } } };

function ticketMaterial(map: THREE.Texture | null, color: THREE.ColorRepresentation): TicketMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      useMap: { value: map ? 1 : 0 },
      color: { value: new THREE.Color(color) },
      opacity: { value: 1 },
      sweep: { value: -1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  }) as TicketMaterial;
}

// ---------------------------------------------------------------------------
// 共用資源（第一次用到才建）
// ---------------------------------------------------------------------------

interface Shared {
  geometry: THREE.ExtrudeGeometry;
  face: THREE.CanvasTexture;
  faceCanvas: HTMLCanvasElement;
  glow: THREE.CanvasTexture;
  edge: TicketMaterial;
  glowMaterial: THREE.SpriteMaterial;
  ringGeometry: THREE.RingGeometry;
  discGeometry: THREE.PlaneGeometry;
}

let shared: Shared | null = null;

function getShared(): Shared {
  if (shared) return shared;
  const { w, h, depth, bevel } = TICKET_SIZE;
  const geometry = new THREE.ExtrudeGeometry(ticketShape(w, h), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  // 上下兩面（group 0）的 UV 改成整張券面；底面朝 -Z，從背面看要左右相反
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const lids = geometry.groups.find((gr) => gr.materialIndex === 0);
  if (lids) {
    for (let i = lids.start; i < lids.start + lids.count; i++) {
      const u = (pos.getX(i) + w / 2) / w;
      uv.setXY(i, pos.getZ(i) < depth / 2 ? 1 - u : u, (pos.getY(i) + h / 2) / h);
    }
    uv.needsUpdate = true;
  }
  geometry.translate(0, 0, -depth / 2);

  const faceCanvas = drawFace();
  const glow = canvasTexture(drawGlow());
  shared = {
    geometry,
    face: canvasTexture(faceCanvas),
    faceCanvas,
    glow,
    edge: ticketMaterial(null, 0xd99c32),
    glowMaterial: new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    ringGeometry: new THREE.RingGeometry(0.72, 1, 48),
    discGeometry: new THREE.PlaneGeometry(2, 2),
  };
  return shared;
}

// ---------------------------------------------------------------------------
// 對外
// ---------------------------------------------------------------------------

/** 一張券：root（位置 / 旋轉 / 縮放）底下有券本體與光暈 */
export interface TicketView {
  root: THREE.Group;
  face: TicketMaterial;
  glow: THREE.Sprite;
  dispose(): void;
}

export function createTicket(): TicketView {
  const s = getShared();
  // 券面材質每張一份（各自的掃光進度）；側邊共用
  const face = ticketMaterial(s.face, 0xffffff);
  const body = new THREE.Mesh(s.geometry, [face, s.edge]);
  body.renderOrder = 2;
  body.frustumCulled = false;
  const glow = new THREE.Sprite(s.glowMaterial.clone());
  glow.scale.setScalar(TICKET_SIZE.w * 1.8);
  glow.renderOrder = 1;
  const root = new THREE.Group();
  root.add(glow, body);
  return {
    root,
    face,
    glow,
    dispose: () => {
      face.dispose();
      glow.material.dispose();
      root.removeFromParent();
    },
  };
}

/** 落地時地面的一圈金光（平放在 z = 0.05）＋柔光 */
export interface GroundFlash {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  disc: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  dispose(): void;
}

export function createGroundFlash(): GroundFlash {
  const s = getShared();
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide } as const;
  const ring = new THREE.Mesh(s.ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffd36a, ...add }));
  const disc = new THREE.Mesh(s.discGeometry, new THREE.MeshBasicMaterial({ map: s.glow, ...add }));
  ring.renderOrder = disc.renderOrder = 0;
  const root = new THREE.Group();
  root.add(disc, ring);
  return {
    root,
    ring,
    disc,
    dispose: () => {
      ring.material.dispose();
      disc.material.dispose();
      root.removeFromParent();
    },
  };
}

let iconFrame: SpriteFrameRef | null = null;

/** 獎圈中間的券圖（150 × 150，同魚頭像大小；券斜放＋光暈） */
export function ticketIconFrame(): SpriteFrameRef {
  if (iconFrame) return iconFrame;
  const S = 150;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  const halo = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  halo.addColorStop(0, 'rgba(255,236,160,0.9)');
  halo.addColorStop(0.5, 'rgba(255,190,60,0.35)');
  halo.addColorStop(1, 'rgba(255,170,40,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  // 斜放後約 118 寬，收在獎圈裡
  const fw = 108;
  const fh = (fw * FACE_H) / FACE_W;
  g.translate(S / 2, S / 2);
  g.rotate((-14 * Math.PI) / 180);
  g.shadowColor = 'rgba(60,25,0,0.55)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.drawImage(getShared().faceCanvas, -fw / 2, -fh / 2, fw, fh);

  const name = 'ugc_ticket_icon';
  const atlas: Atlas = {
    url: name,
    texture: canvasTexture(canvas),
    size: { w: S, h: S },
    frames: { [name]: { x: 0, y: 0, w: S, h: S, rotated: false, offsetX: 0, offsetY: 0, sourceW: S, sourceH: S } },
  };
  iconFrame = { atlas, frame: atlas.frames[name] };
  return iconFrame;
}
