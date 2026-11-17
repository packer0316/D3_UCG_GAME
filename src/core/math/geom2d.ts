/**
 * 2D 幾何（地面 XY 平面）：OBB 碰撞（SAT）、多邊形內外、線段 vs 多邊形邊。
 * 取代原版 Chipmunk 物理（子彈與魚都是 contact-test 的 box，沒有真實物理反應）。
 */
import type { Vec2 } from './cocos';

export interface OBB2 {
  cx: number;
  cy: number;
  /** 半寬（本地 X）、半高（本地 Y） */
  hw: number;
  hh: number;
  /** 本地 +X 軸在世界中的方向（單位向量） */
  ux: number;
  uy: number;
}

/** angle：three.js rotation.z（逆時針弧度） */
export function makeOBB(cx: number, cy: number, w: number, h: number, angle: number): OBB2 {
  return { cx, cy, hw: w / 2, hh: h / 2, ux: Math.cos(angle), uy: Math.sin(angle) };
}

function projectRadius(b: OBB2, ax: number, ay: number): number {
  // 本地 X = (ux,uy)，本地 Y = (-uy,ux)
  return b.hw * Math.abs(b.ux * ax + b.uy * ay) + b.hh * Math.abs(-b.uy * ax + b.ux * ay);
}

export function obbIntersects(a: OBB2, b: OBB2): boolean {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const axes: [number, number][] = [
    [a.ux, a.uy],
    [-a.uy, a.ux],
    [b.ux, b.uy],
    [-b.uy, b.ux],
  ];
  for (const [ax, ay] of axes) {
    const dist = Math.abs(dx * ax + dy * ay);
    if (dist > projectRadius(a, ax, ay) + projectRadius(b, ax, ay)) return false;
  }
  return true;
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface WallHit {
  /** 指向多邊形內側的法線 */
  nx: number;
  ny: number;
  /** 撞擊點 */
  x: number;
  y: number;
}

/**
 * 圓（子彈）是否碰到封閉多邊形的任一邊（牆），回傳內側法線。
 * 只回報「正朝牆移動」的碰撞（避免反彈後同一幀又判一次）。
 */
export function circleHitsPolygonEdge(
  p: Vec2,
  r: number,
  vel: Vec2,
  poly: readonly Vec2[],
): WallHit | null {
  // 判斷多邊形繞向，決定內側法線方向。Σ (x_prev − x_cur)(y_prev + y_cur) = 2 × 有號面積（逆時針為正）
  // （之前寫成 < 0，順時針的 WALL_POLYGON 法線變成朝外：牆內子彈穿牆不反彈、牆外子彈撞到牆反而被彈回去）
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y);
  const ccw = area > 0;
  let best: WallHit | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2));
    const cx = a.x + ex * t;
    const cy = a.y + ey * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const len = Math.sqrt(len2);
    // 邊的內側法線
    const nx = ccw ? -ey / len : ey / len;
    const ny = ccw ? ex / len : -ex / len;
    if (vel.x * nx + vel.y * ny >= 0) continue; // 正在離開牆
    if (d < bestDist) {
      bestDist = d;
      best = { nx, ny, x: cx, y: cy };
    }
  }
  return best;
}
