/**
 * 一般死亡表演 — 翻譯自原版 FishKilledShow.lua KilledShowNormal（FishBase:PlayDeadShow）
 *
 *   stopAllActions（路徑停止）；Run 動畫 2 倍速 loop
 *   MoveBy(0.2, z+15) → ScaleBy(0.2, 1.1) → Spawn( MoveBy(0.2, z-15), FadeOut(0.3) ) → Delay(0.3) → 回收
 */
import { Act } from '@core/tween/Action';
import type { ActionManager } from '@core/tween/ActionManager';
import type { Fish } from '../world/Fish';
import { Tw } from './Tweens';

export class FishKilledShow {
  constructor(private readonly actions: ActionManager) {}

  play(fish: Fish, onEnd: () => void): void {
    fish.dying = true;
    fish.hittable = false;
    this.actions.stopAll(fish);
    fish.bleachRate = 0;
    fish.alpha = 1;
    fish.playRunAnimation(2);

    const fade = { opacity: 1 };
    const fadeOut = Act.tween(0.3, () => (t) => {
      fade.opacity = 1 - t;
      fish.alpha = fade.opacity;
    });
    this.actions.run(
      Act.seq(
        Tw.moveBy(fish.node, 0.2, 0, 0, 15),
        Tw.scaleBy(fish.node, 0.2, 1.1),
        Act.spawn(Tw.moveBy(fish.node, 0.2, 0, 0, -15), Act.call(() => this.actions.run(fadeOut, fish))),
        Act.delay(0.3),
        Act.call(onEnd),
      ),
      fish,
    );
  }
}
