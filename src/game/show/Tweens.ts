/**
 * cc.Action 對應的 Tween 工廠（作用在 THREE.Object3D / 有 opacity 的物件）。
 *
 * MoveBy / JumpBy / MoveTo 採「增量」套用（每幀加上本動作位移的差值），
 * 等同 Cocos CC_ENABLE_STACKABLE_ACTIONS：Spawn 裡多個位移動作會相加（噴錢的 Explosion 依賴這個行為）。
 */
import type * as THREE from 'three';
import { Act, type Ease } from '@core/tween/Action';

type XYZ = { x: number; y: number; z: number };

/** 增量位移：f(t) 回傳本動作在 t 時的總位移 */
function incremental(obj: { position: XYZ }, d: number, f: (t: number) => XYZ, ease?: Ease) {
  return Act.tween(
    d,
    () => {
      let prev = { x: 0, y: 0, z: 0 };
      return (t) => {
        const cur = f(t);
        obj.position.x += cur.x - prev.x;
        obj.position.y += cur.y - prev.y;
        obj.position.z += cur.z - prev.z;
        prev = cur;
      };
    },
    ease,
  );
}

export const Tw = {
  /** cc.MoveBy */
  moveBy: (obj: { position: XYZ }, d: number, dx: number, dy: number, dz = 0, ease?: Ease) =>
    incremental(obj, d, (t) => ({ x: dx * t, y: dy * t, z: dz * t }), ease),

  /** cc.MoveTo（起點在動作開始時擷取，2D：只動 x,y） */
  moveTo: (obj: { position: XYZ }, d: number, x: number, y: number, ease?: Ease) => {
    let dx = 0;
    let dy = 0;
    return Act.seq(
      Act.call(() => {
        dx = x - obj.position.x;
        dy = y - obj.position.y;
      }),
      incremental(obj, d, (t) => ({ x: dx * t, y: dy * t, z: 0 }), ease),
    );
  },

  /** cc.JumpBy(duration, delta, height, jumps) */
  jumpBy: (obj: { position: XYZ }, d: number, dx: number, dy: number, height: number, jumps: number) =>
    incremental(obj, d, (t) => {
      const frac = (t * jumps) % 1;
      // t=1 時 frac=0（落地）
      const h = t >= 1 ? 0 : height * 4 * frac * (1 - frac);
      return { x: dx * t, y: dy * t + h, z: 0 };
    }),

  /** cc.ScaleBy（等比） */
  scaleBy: (obj: THREE.Object3D, d: number, s: number, ease?: Ease) =>
    Act.tween(
      d,
      () => {
        const sx = obj.scale.x;
        const sy = obj.scale.y;
        const sz = obj.scale.z;
        return (t) => {
          const k = 1 + (s - 1) * t;
          obj.scale.set(sx * k, sy * k, sz * k);
        };
      },
      ease,
    ),

  /** cc.ScaleTo（2D：x,y） */
  scaleTo: (obj: THREE.Object3D, d: number, sx: number, sy = sx, ease?: Ease) =>
    Act.tween(
      d,
      () => {
        const x0 = obj.scale.x;
        const y0 = obj.scale.y;
        return (t) => obj.scale.set(x0 + (sx - x0) * t, y0 + (sy - y0) * t, 1);
      },
      ease,
    ),

  /** cc.RotateTo（2D，度，cocos 順時針為正） */
  rotateTo: (obj: THREE.Object3D, d: number, deg: number, ease?: Ease) =>
    Act.tween(
      d,
      () => {
        const r0 = obj.rotation.z;
        const r1 = (-deg * Math.PI) / 180;
        return (t) => {
          obj.rotation.z = r0 + (r1 - r0) * t;
        };
      },
      ease,
    ),

  /** cc.FadeTo（opacity 0..1） */
  fadeTo: (target: { opacity: number }, d: number, to: number, ease?: Ease) =>
    Act.tween(
      d,
      () => {
        const from = target.opacity;
        return (t) => {
          target.opacity = from + (to - from) * t;
        };
      },
      ease,
    ),

  fadeOut: (target: { opacity: number }, d: number) => Tw.fadeTo(target, d, 0),
  fadeIn: (target: { opacity: number }, d: number) => Tw.fadeTo(target, d, 1),

  /** cc.ToggleVisibility / setVisible */
  show: (obj: { visible: boolean }, v = true) => Act.call(() => (obj.visible = v)),
};
