/**
 * CPU 雜訊（地形高度、物件散佈用）：整數 hash 的 value noise，結果固定（不依賴 Math.random）。
 */

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 格點 hash → 0 ~ 1 */
export function hash2(ix: number, iy: number, seed = 0): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** value noise，0 ~ 1 */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** 分形雜訊，約 0 ~ 1 */
export function fbm(x: number, y: number, octaves = 5, seed = 0): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x, y, seed + i * 17);
    norm += amp;
    x = x * 2.03 + 17.3;
    y = y * 2.03 + 9.1;
    amp *= 0.5;
  }
  return sum / norm;
}

/** 稜線雜訊（山脊），約 0 ~ 1 */
export function ridged(x: number, y: number, octaves = 5, seed = 0): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(vnoise(x, y, seed + i * 31) * 2 - 1);
    n *= n;
    sum += amp * n * prev;
    norm += amp;
    prev = clamp(n * 1.6, 0, 1);
    x = x * 2.07 + 5.7;
    y = y * 2.07 + 13.3;
    amp *= 0.5;
  }
  return sum / norm;
}

/** 固定種子的亂數序列（散佈物件用） */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
