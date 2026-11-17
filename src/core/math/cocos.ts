/**
 * Cocos2d-x 座標/角度換算（不依賴 three.js，回傳純數值）。
 *
 * Cocos `Node::setRotation3D(x,y,z)`：q = Rz(-z) · Ry(y) · Rx(x)（z 取負，順時針為正）
 * → three.js：object.rotation.set(rad(x), rad(y), -rad(z), 'ZYX')
 */
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** 回傳 three.js Euler 參數：[x, y, z, order] */
export function cocosEulerToThree(deg: Vec3): [number, number, number, 'ZYX'] {
  return [deg.x * DEG2RAD, deg.y * DEG2RAD, -deg.z * DEG2RAD, 'ZYX'];
}

/** 任何具有 rotation.set(x,y,z,order) 的物件（three Object3D） */
export function setCocosRotation(
  obj: { rotation: { set(x: number, y: number, z: number, order: 'ZYX'): unknown } },
  deg: Vec3,
): void {
  const [x, y, z, o] = cocosEulerToThree(deg);
  obj.rotation.set(x, y, z, o);
}

/**
 * cc.pGetAngle(a, b)：a 到 b 的有號夾角 = atan2(cross(a,b), dot(a,b))
 * 原版常用 pGetAngle(dir, (0,1)) → 自 +Y 順時針角度（弧度）= atan2(dir.x, dir.y)
 */
export function pGetAngle(a: Vec2, b: Vec2): number {
  const cross = a.x * b.y - a.y * b.x;
  const dot = a.x * b.x + a.y * b.y;
  return Math.atan2(cross, dot);
}

/** 自 +Y 順時針角度（度），與原版 CannonView / PathMove 相同 */
export function headingDeg(dir: Vec2): number {
  return Math.atan2(dir.x, dir.y) * RAD2DEG;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 千分位（原版 Helper:formatCurrency） */
export function formatCurrency(n: number): string {
  const neg = n < 0;
  const s = Math.floor(Math.abs(n)).toString();
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? '-' + out : out;
}
