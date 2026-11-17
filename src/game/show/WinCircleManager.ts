/**
 * 獎圈管理 — 對照原版 WinCircleManagerBase / WinCircleManager / RewardLayerBase:update
 *
 * - 位置：座位 WinCircleAP（不在魚身上）+ 槽位偏移；同座位最多 6 個
 * - 該座位最後一個獎圈出現 1.5s 後，全部播 end 動畫
 * - 音效：Small/Middle/Big → C_1/C_2/C_3；Big 時相機震動
 */
import { WinCircleType } from '../define/FishDefine';
import {
  WIN_CIRCLE_CD_TIME,
  WIN_CIRCLE_MAX_PER_SEAT,
  WIN_CIRCLE_OTHER,
  WIN_CIRCLE_SELF,
  WIN_CIRCLE_SLOT_OFFSETS,
  WIN_CIRCLE_SOUND,
} from '../define/RewardDefine';
import type { OverlayDeps } from './OverlayDeps';
import { WinCircle, type WinCircleParams } from './WinCircle';

interface SeatCircles {
  slots: (WinCircle | null)[];
  timer: number;
}

export class WinCircleManager {
  private seats = new Map<number, SeatCircles>();

  constructor(
    private readonly deps: OverlayDeps,
    /** 座位的獎圈錨點（設計座標） */
    private readonly anchorOf: (seat: number) => { x: number; y: number },
    private readonly onBigCircle?: () => void,
  ) {}

  show(seat: number, params: WinCircleParams): void {
    let sc = this.seats.get(seat);
    if (!sc) {
      sc = { slots: new Array(WIN_CIRCLE_MAX_PER_SEAT).fill(null), timer: 0 };
      this.seats.set(seat, sc);
    }
    let slot = sc.slots.findIndex((c) => c === null);
    if (slot < 0) {
      // 滿了：最舊的立即結束
      sc.slots[0]?.end();
      sc.slots.shift();
      sc.slots.push(null);
      slot = WIN_CIRCLE_MAX_PER_SEAT - 1;
    }
    const circle = new WinCircle(this.deps, params);
    const look = params.isSelf ? WIN_CIRCLE_SELF : WIN_CIRCLE_OTHER;
    const a = this.anchorOf(seat);
    const off = WIN_CIRCLE_SLOT_OFFSETS[slot] ?? { x: 0, y: 0 };
    circle.root.position.set(a.x + off.x, a.y + off.y, 20 + slot);
    circle.root.scale.setScalar(look.scale);
    this.deps.layer.add(circle.root);
    sc.slots[slot] = circle;
    sc.timer = WIN_CIRCLE_CD_TIME;

    this.deps.audio.play(WIN_CIRCLE_SOUND[params.type]);
    if (params.type === WinCircleType.Big) this.onBigCircle?.();
  }

  update(dt: number): void {
    for (const sc of this.seats.values()) {
      if (sc.slots.every((s) => s === null)) continue;
      sc.timer -= dt;
      if (sc.timer > 0) continue;
      for (let i = 0; i < sc.slots.length; i++) {
        const c = sc.slots[i];
        if (!c) continue;
        sc.slots[i] = null;
        c.end();
      }
    }
  }
}
