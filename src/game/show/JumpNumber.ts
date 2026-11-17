/**
 * 跳字「+N」— 翻譯自原版 DropItemMgr jumpWinPool（FishBonus:PlayJumpWinValShow / JumpValueAtSeat）
 *
 * self ：Delay 0.3 → MoveBy(0.5, (0,30)) → Delay 0.3 → Spawn(Delay 0.3, FadeOut 0.3)   共 1.4s
 * other：Spawn( Seq(Delay 0.3, MoveBy(0.5,(0,30)), Delay 0.3), FadeOut 0.8 )          共 1.1s
 */
import { Act } from '@core/tween/Action';
import { formatCurrency } from '@core/math/cocos';
import { BitmapText } from '@engine/sprite2d/BitmapText';
import { FONT_JUMP_OTHER, FONT_JUMP_SELF, JUMP_NUMBER } from '../define/RewardDefine';
import type { OverlayDeps } from './OverlayDeps';
import { Tw } from './Tweens';

export class JumpNumber {
  constructor(private readonly deps: OverlayDeps) {}

  /** pos：設計座標 */
  spawn(money: number, pos: { x: number; y: number }, isSelf: boolean): void {
    if (money <= 0) return;
    const font = this.deps.assets.peekFont(isSelf ? FONT_JUMP_SELF : FONT_JUMP_OTHER);
    if (!font) return;
    const label = new BitmapText(font, '+' + formatCurrency(money));
    label.position.set(pos.x, pos.y + JUMP_NUMBER.offsetY, 10);
    label.scale.setScalar(JUMP_NUMBER.scale);
    label.renderOrder = 7;
    this.deps.layer.add(label);
    const remove = Act.call(() => {
      label.removeFromParent();
      label.dispose();
    });
    const rise = () => Act.seq(Act.delay(0.3), Tw.moveBy(label, 0.5, 0, JUMP_NUMBER.rise), Act.delay(0.3));
    const action = isSelf
      ? Act.seq(rise(), Act.spawn(Act.delay(0.3), Tw.fadeOut(label, 0.3)), remove)
      : Act.seq(Act.spawn(rise(), Tw.fadeOut(label, 0.8)), remove);
    this.deps.actions.run(action, label);
  }
}
