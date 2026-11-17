/**
 * 極座標地形網格（SPEC §18.3）：以相機正下方為中心，沿 +Y（相機前方）展開的扇形。
 * 圈距依半徑等比放大、角度固定 → 在螢幕上的三角形密度大致固定，近處不浪費、遠山的稜線也夠細。
 * 世界座標 Z 朝上，高度由 height(x, y) 決定（戰鬥區由呼叫端的 height 函式回傳 0）。
 */
import * as THREE from 'three';
import { smoothstep } from './noise';

export interface PolarTerrainOptions {
  /** 扇形中心（世界 xy） */
  centerX: number;
  centerY: number;
  rMin: number;
  rMax: number;
  /** 相鄰兩圈半徑的比值（例 1.022） */
  ratio: number;
  /** 扇形半角（弧度，以 +Y 為 0） */
  halfAngle: number;
  /** 角度間距（弧度） */
  angleStep: number;
  height: (x: number, y: number) => number;
}

export function buildPolarTerrain(o: PolarTerrainOptions): THREE.BufferGeometry {
  const rings = Math.ceil(Math.log(o.rMax / o.rMin) / Math.log(o.ratio)) + 1;
  const cols = Math.ceil((o.halfAngle * 2) / o.angleStep) + 1;
  const pos = new Float32Array(rings * cols * 3);
  for (let j = 0; j < rings; j++) {
    const r = o.rMin * Math.pow(o.ratio, j);
    for (let i = 0; i < cols; i++) {
      const a = -o.halfAngle + (i / (cols - 1)) * o.halfAngle * 2;
      const x = o.centerX + Math.sin(a) * r;
      const y = o.centerY + Math.cos(a) * r;
      const k = (j * cols + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = o.height(x, y);
    }
  }
  const index = new Uint32Array((rings - 1) * (cols - 1) * 6);
  let n = 0;
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // 從上方看逆時針（法線朝 +Z）：角度往 +X 增加、半徑往外
      index[n++] = a;
      index[n++] = b;
      index[n++] = c;
      index[n++] = b;
      index[n++] = d;
      index[n++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 戰鬥區遮罩：0 = 戰鬥區內（地面必須是平的），往外平滑升到 1。
 * 戰鬥區 = 第二種相機的子彈牆（梯形：近端 y −59、遠端 y 380）再留一圈邊。
 */
export function playAreaMask(x: number, y: number, feather = 220): number {
  const side = Math.abs(x) - (300 + 0.42 * Math.max(y + 60, 0));
  const far = y - 470;
  return smoothstep(0, feather, Math.max(side, far));
}
