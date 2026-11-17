import type { Action } from './Action';

/**
 * 執行 Action 的管理器（對應 cocos ActionManager）。
 * owner 用來批次停止（cocos node:stopAllActions()），tag 用來停止特定動作（stopActionByTag）。
 */
export interface ActionHandle {
  stop(): void;
  readonly done: boolean;
}

interface Running {
  action: Action;
  owner: object | null;
  tag: number | string | null;
  stopped: boolean;
  timeScale: () => number;
}

export class ActionManager {
  private running: Running[] = [];
  private paused = new Set<object>();

  run(
    action: Action,
    owner: object | null = null,
    opts: { tag?: number | string; timeScale?: () => number } = {},
  ): ActionHandle {
    const r: Running = {
      action,
      owner,
      tag: opts.tag ?? null,
      stopped: false,
      timeScale: opts.timeScale ?? (() => 1),
    };
    this.running.push(r);
    return {
      stop: () => {
        r.stopped = true;
      },
      get done() {
        return r.stopped || r.action.done;
      },
    };
  }

  stopAll(owner: object): void {
    for (const r of this.running) if (r.owner === owner) r.stopped = true;
  }

  stopByTag(owner: object, tag: number | string): void {
    for (const r of this.running) if (r.owner === owner && r.tag === tag) r.stopped = true;
  }

  hasTag(owner: object, tag: number | string): boolean {
    return this.running.some((r) => r.owner === owner && r.tag === tag && !r.stopped && !r.action.done);
  }

  pause(owner: object): void {
    this.paused.add(owner);
  }

  resume(owner: object): void {
    this.paused.delete(owner);
  }

  update(dt: number): void {
    // 新加入的 action 也在本幀執行（cocos 下一幀才跑，差異可忽略）
    const list = this.running;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.stopped || r.action.done) continue;
      if (r.owner && this.paused.has(r.owner)) continue;
      try {
        r.action.tick(dt * r.timeScale());
      } catch (err) {
        console.error('[ActionManager] action threw', err);
        r.stopped = true;
      }
    }
    this.running = this.running.filter((r) => !r.stopped && !r.action.done);
  }

  get count(): number {
    return this.running.length;
  }
}
