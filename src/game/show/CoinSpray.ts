/**
 * 噴錢 — 翻譯自原版 FishBonus:PlayCoinShow + DropItemMgr:CreateCoinDrop / CreateCoinExplosion
 *
 * 模式（floatedOdds）：< 10 → Drop；≥ 10 → Explosion 1 圈；≥ 90 → 2 圈；≥ 10000 → 4 圈
 * Drop     ：數量 floor(max(1, min(floor(money/bet), 30)/2))；起點魚 + (±30, 0)
 *            Delay(0.1i) → 顯示 → JumpBy(0.6, h50) → JumpBy(0.4, h25) → MoveTo(dist/1500, 砲台)
 * Explosion：每圈 4/8/16/32 枚，半徑 30 + 45(ring-1)
 *            Delay(0.014) → 顯示 → Spawn( EaseIn(MoveBy 0.105, 極座標, 0.3), Seq(JumpBy 0.42 h50, JumpBy 0.21 h25) )
 *            → Delay(0.056i) → MoveTo(dist/2143, 砲台)
 * 第一枚抵達時在座位跳「+N」（JumpValueAtSeat）
 */
import { Act, Easing } from '@core/tween/Action';
import type { Sprite2D } from '@engine/sprite2d/Sprite2D';
import {
  COIN_DROP_SPEED,
  COIN_EXPLOSION_SPEED,
  COIN_FRAMES_OTHER,
  COIN_FRAMES_SELF,
  COIN_FRAME_TIME,
  COIN_RING_COUNTS,
  COIN_RING_RADIUS,
  COIN_SHOW_THRESHOLDS,
} from '../define/RewardDefine';
import { Sound } from '../define/SoundDefine';
import { frameRef, makeSprite, type OverlayDeps } from './OverlayDeps';
import { Tw } from './Tweens';

export interface CoinSprayParams {
  money: number;
  bet: number;
  floatedOdds: number;
  /** 魚的位置（設計座標） */
  from: { x: number; y: number };
  /** 砲台位置（設計座標） */
  to: { x: number; y: number };
  isSelf: boolean;
  /** 第一枚抵達時 */
  onFirstArrive?: () => void;
}

export function coinRings(floatedOdds: number): number {
  for (const t of COIN_SHOW_THRESHOLDS) if (floatedOdds >= t.odds) return t.rings;
  return 0;
}

export class CoinSpray {
  constructor(private readonly deps: OverlayDeps) {}

  play(p: CoinSprayParams): void {
    if (p.money <= 0) return;
    const rings = coinRings(p.floatedOdds);
    const distance = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
    if (rings === 0) this.drop(p, distance);
    else this.explosion(p, distance, rings);
  }

  private makeCoin(isSelf: boolean): Sprite2D | null {
    const frames = isSelf ? COIN_FRAMES_SELF : COIN_FRAMES_OTHER;
    const coin = makeSprite(this.deps.assets, frames[0]);
    if (!coin) return null;
    if (!isSelf) coin.opacity = 179 / 255;
    coin.visible = false;
    coin.renderOrder = 5;
    this.deps.layer.add(coin);
    // 0.07s / 幀循環
    const refs = frames.map((f) => frameRef(this.deps.assets, f));
    this.deps.actions.run(
      Act.forever(() =>
        Act.tween(frames.length * COIN_FRAME_TIME, () => (t) => {
          const r = refs[Math.min(frames.length - 1, Math.floor(t * frames.length))];
          if (r && coin.frame?.frame !== r.frame) coin.setFrame(r);
        }),
      ),
      coin,
    );
    return coin;
  }

  private recycle(coin: Sprite2D): void {
    this.deps.actions.stopAll(coin);
    coin.removeFromParent();
    coin.dispose();
  }

  private drop(p: CoinSprayParams, distance: number): void {
    const { actions, audio } = this.deps;
    audio.play(Sound.GET_STONE);
    const count = Math.floor(Math.max(1, Math.min(Math.floor(p.money / Math.max(1, p.bet)), 30) / 2));
    for (let i = 1; i <= count; i++) {
      const coin = this.makeCoin(p.isSelf);
      if (!coin) return;
      coin.position.set(p.from.x + (Math.random() * 60 - 30), p.from.y, 5);
      actions.run(
        Act.seq(
          Act.delay(0.1 * i),
          Tw.show(coin),
          Tw.jumpBy(coin, 0.6, 0, 0, 50, 1),
          Tw.jumpBy(coin, 0.4, 0, 0, 25, 1),
          Tw.moveTo(coin, distance / COIN_DROP_SPEED, p.to.x, p.to.y),
          Act.call(() => {
            if (i === 1) p.onFirstArrive?.();
            this.recycle(coin);
          }),
        ),
        coin,
      );
    }
  }

  private explosion(p: CoinSprayParams, distance: number, rings: number): void {
    const { actions, audio } = this.deps;
    audio.play(Sound.GET_STONE_RING);
    for (let ring = 1; ring <= rings; ring++) {
      const n = COIN_RING_COUNTS[ring - 1];
      const radius = COIN_RING_RADIUS(ring);
      for (let i = 1; i <= n; i++) {
        const coin = this.makeCoin(p.isSelf);
        if (!coin) return;
        coin.position.set(p.from.x, p.from.y, 5);
        // cc.pRotateByAngle((0,1), (0,0), 2π·i/n)：逆時針
        const a = (2 * Math.PI * i) / n;
        const px = -Math.sin(a) * radius;
        const py = Math.cos(a) * radius;
        actions.run(
          Act.seq(
            Act.delay(0.014),
            Tw.show(coin),
            Act.spawn(
              Tw.moveBy(coin, 0.105, px, py, 0, Easing.easeIn(0.3)),
              Act.seq(Tw.jumpBy(coin, 0.42, 0, 0, 50, 1), Tw.jumpBy(coin, 0.21, 0, 0, 25, 1)),
            ),
            Act.delay(0.056 * i),
            Tw.moveTo(coin, distance / COIN_EXPLOSION_SPEED, p.to.x, p.to.y),
            Act.call(() => {
              if (i === 1 && ring === 1) p.onFirstArrive?.();
              this.recycle(coin);
            }),
          ),
          coin,
        );
      }
    }
  }
}
