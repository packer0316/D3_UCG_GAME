/**
 * 仿 Cocos cc.Action 的時間軸系統，讓原版表演程式碼可以逐行翻譯：
 *
 *   cc.Sequence:create( cc.MoveBy:create(0.2, v), cc.DelayTime:create(0.3), cc.CallFunc:create(cb) )
 *   →  Act.seq( moveBy(node, 0.2, v), Act.delay(0.3), Act.call(cb) )
 *
 * 每個 Action 是一次性的有狀態物件（與 cocos 相同，要重複播放請重新建立）。
 * tick(dt) 回傳「沒用完的時間」，讓 Sequence 能在同一幀串接下一段（瞬間動作同幀執行）。
 */
export type Ease = (t: number) => number;

export abstract class Action {
  readonly duration: number;
  protected elapsed = 0;
  private started = false;
  done = false;

  constructor(duration: number) {
    this.duration = Math.max(0, duration);
  }

  /** cocos startWithTarget：此時才擷取起始值 */
  protected onStart(): void {}
  /** t: 0..1 */
  protected abstract onUpdate(t: number): void;

  tick(dt: number): number {
    if (this.done) return dt;
    if (!this.started) {
      this.started = true;
      this.onStart();
    }
    if (this.duration <= 0) {
      this.onUpdate(1);
      this.done = true;
      return dt;
    }
    const use = Math.min(dt, this.duration - this.elapsed);
    this.elapsed += use;
    this.onUpdate(Math.min(1, this.elapsed / this.duration));
    if (this.elapsed >= this.duration - 1e-9) {
      this.done = true;
      return dt - use;
    }
    return 0;
  }
}

/** 一般補間：onStart 時呼叫 setup，取得 (t)=>void 更新函式（可在此擷取起始值） */
export class TweenAction extends Action {
  private updater: ((t: number) => void) | null = null;
  constructor(
    duration: number,
    private readonly setup: () => (t: number) => void,
    private readonly ease?: Ease,
  ) {
    super(duration);
  }
  protected override onStart(): void {
    this.updater = this.setup();
  }
  protected onUpdate(t: number): void {
    this.updater?.(this.ease ? this.ease(t) : t);
  }
}

export class DelayAction extends Action {
  protected onUpdate(): void {}
}

export class CallAction extends Action {
  constructor(private readonly fn: () => void) {
    super(0);
  }
  protected onUpdate(): void {
    this.fn();
  }
}

export class SequenceAction extends Action {
  private index = 0;
  constructor(private readonly actions: Action[]) {
    super(actions.reduce((s, a) => s + a.duration, 0));
  }
  protected onUpdate(): void {}
  override tick(dt: number): number {
    if (this.done) return dt;
    let left = dt;
    while (this.index < this.actions.length) {
      left = this.actions[this.index].tick(left);
      if (!this.actions[this.index].done) return 0;
      this.index++;
    }
    this.done = true;
    return left;
  }
}

export class SpawnAction extends Action {
  constructor(private readonly actions: Action[]) {
    super(actions.reduce((m, a) => Math.max(m, a.duration), 0));
  }
  protected onUpdate(): void {}
  override tick(dt: number): number {
    if (this.done) return dt;
    let minLeft = dt;
    let allDone = true;
    for (const a of this.actions) {
      const left = a.tick(dt);
      if (!a.done) allDone = false;
      else minLeft = Math.min(minLeft, left);
    }
    if (allDone) {
      this.done = true;
      return minLeft;
    }
    return 0;
  }
}

/** 重複 n 次（n = Infinity 即 RepeatForever）；factory 每輪建立新的子 action */
export class RepeatAction extends Action {
  private current: Action;
  private count = 0;
  constructor(
    private readonly factory: () => Action,
    private readonly times: number,
  ) {
    const first = factory();
    super(Number.isFinite(times) ? first.duration * times : Number.POSITIVE_INFINITY);
    this.current = first;
  }
  protected onUpdate(): void {}
  override tick(dt: number): number {
    if (this.done) return dt;
    let left = dt;
    // 防止零長度子 action 造成無窮迴圈
    for (let guard = 0; guard < 1000; guard++) {
      left = this.current.tick(left);
      if (!this.current.done) return 0;
      this.count++;
      if (this.count >= this.times) {
        this.done = true;
        return left;
      }
      this.current = this.factory();
      if (left <= 0 && this.current.duration > 0) return 0;
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 常用 easing（對應 cocos）
// ---------------------------------------------------------------------------
export const Easing = {
  linear: (t: number) => t,
  /** cc.EaseIn(rate) */
  easeIn: (rate: number): Ease => (t) => Math.pow(t, rate),
  /** cc.EaseOut(rate) */
  easeOut: (rate: number): Ease => (t) => Math.pow(t, 1 / rate),
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// ---------------------------------------------------------------------------
// 工廠（語法糖）
// ---------------------------------------------------------------------------
export const Act = {
  seq: (...actions: (Action | null | undefined | false)[]) =>
    new SequenceAction(actions.filter((a): a is Action => !!a)),
  spawn: (...actions: (Action | null | undefined | false)[]) =>
    new SpawnAction(actions.filter((a): a is Action => !!a)),
  delay: (d: number) => new DelayAction(d),
  call: (fn: () => void) => new CallAction(fn),
  tween: (d: number, setup: () => (t: number) => void, ease?: Ease) => new TweenAction(d, setup, ease),
  repeat: (factory: () => Action, times: number) => new RepeatAction(factory, times),
  forever: (factory: () => Action) => new RepeatAction(factory, Number.POSITIVE_INFINITY),
};
