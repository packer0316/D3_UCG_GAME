/**
 * Cocos tweenfunc（cocostudio EasingData Type）對照。
 * -1 = 自訂貝茲（Points 控制點），0 = Linear，1..30 = Sine/Quad/Cubic/Quart/Quint/Expo/Circ/Elastic/Back/Bounce
 */
const PI = Math.PI;

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

const EASE: Record<number, (t: number) => number> = {
  0: (t) => t,
  1: (t) => -Math.cos(t * (PI / 2)) + 1,
  2: (t) => Math.sin(t * (PI / 2)),
  3: (t) => -0.5 * (Math.cos(PI * t) - 1),
  4: (t) => t * t,
  5: (t) => -t * (t - 2),
  6: (t) => (t *= 2) < 1 ? 0.5 * t * t : -0.5 * (--t * (t - 2) - 1),
  7: (t) => t * t * t,
  8: (t) => (t -= 1) * t * t + 1,
  9: (t) => (t *= 2) < 1 ? 0.5 * t * t * t : 0.5 * ((t -= 2) * t * t + 2),
  10: (t) => t * t * t * t,
  11: (t) => -((t -= 1) * t * t * t - 1),
  12: (t) => (t *= 2) < 1 ? 0.5 * t * t * t * t : -0.5 * ((t -= 2) * t * t * t - 2),
  13: (t) => t * t * t * t * t,
  14: (t) => (t -= 1) * t * t * t * t + 1,
  15: (t) => (t *= 2) < 1 ? 0.5 * t * t * t * t * t : 0.5 * ((t -= 2) * t * t * t * t + 2),
  16: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)) - 0.001),
  17: (t) => (t === 1 ? 1 : -Math.pow(2, -10 * t) + 1),
  18: (t) => {
    if (t === 0 || t === 1) return t;
    return (t *= 2) < 1 ? 0.5 * Math.pow(2, 10 * (t - 1)) : 0.5 * (-Math.pow(2, -10 * (t - 1)) + 2);
  },
  19: (t) => -1 * (Math.sqrt(1 - t * t) - 1),
  20: (t) => Math.sqrt(1 - (t -= 1) * t),
  21: (t) => (t *= 2) < 1 ? -0.5 * (Math.sqrt(1 - t * t) - 1) : 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1),
  22: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    return -Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - p / 4) * PI * 2) / p);
  },
  23: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * PI * 2) / p) + 1;
  },
  24: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.45;
    t = t * 2 - 1;
    return t < 0
      ? -0.5 * Math.pow(2, 10 * t) * Math.sin(((t - p / 4) * PI * 2) / p)
      : Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * PI * 2) / p) * 0.5 + 1;
  },
  25: (t) => {
    const s = 1.70158;
    return t * t * ((s + 1) * t - s);
  },
  26: (t) => {
    const s = 1.70158;
    return (t -= 1) * t * ((s + 1) * t + s) + 1;
  },
  27: (t) => {
    const s = 1.70158 * 1.525;
    return (t *= 2) < 1 ? 0.5 * (t * t * ((s + 1) * t - s)) : 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
  },
  28: (t) => 1 - bounceOut(1 - t),
  29: bounceOut,
  30: (t) => (t < 0.5 ? (1 - bounceOut(1 - t * 2)) * 0.5 : bounceOut(t * 2 - 1) * 0.5 + 0.5),
};

/** 自訂曲線：cocos tweenfunc::customEase（三次貝茲，取 y） */
function customEase(t: number, pts: number[]): number {
  if (pts.length < 8) return t;
  const u = 1 - t;
  return u * u * u * pts[1] + 3 * t * u * u * pts[3] + 3 * t * t * u * pts[5] + t * t * t * pts[7];
}

export function csdEase(type: number, t: number, pts?: number[]): number {
  if (type === -1) return customEase(t, pts ?? []);
  return (EASE[type] ?? EASE[0])(t);
}
