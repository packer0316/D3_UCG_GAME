/**
 * 相機震動 — 對照原版 DisplayLayer:ShockWorld
 *   MoveBy(0.05, (d,0,d)) → MoveBy(0.05, (-2d,0,-2d)) → MoveBy(0.05, (0,0,2d)) → MoveTo 原位；重複 times 次
 */
import { Act } from '@core/tween/Action';
import type { ActionManager } from '@core/tween/ActionManager';
import type { Stage } from '@engine/stage/Stage';
import { CAMERA_SHAKE_STEP } from '../define/DisplayDefine';

export class CameraShake {
  private readonly owner = {};

  constructor(
    private readonly stage: Stage,
    private readonly actions: ActionManager,
  ) {}

  shake(times: number, delta: number): void {
    const cam = this.stage.camera;
    const home = this.stage.cameraHome;
    this.actions.stopAll(this.owner);
    cam.position.copy(home);
    const step = CAMERA_SHAKE_STEP;
    const moveBy = (dx: number, dz: number) =>
      Act.tween(step, () => {
        const sx = cam.position.x;
        const sz = cam.position.z;
        return (t) => {
          cam.position.x = sx + dx * t;
          cam.position.z = sz + dz * t;
        };
      });
    const once = () =>
      Act.seq(
        moveBy(delta, delta),
        moveBy(-2 * delta, -2 * delta),
        moveBy(0, 2 * delta),
        Act.call(() => cam.position.copy(home)),
      );
    this.actions.run(Act.repeat(once, times), this.owner);
  }
}
