/**
 * canvas 指標事件分派：依 priority 由高到低詢問，第一個在 down 回傳 true 的 handler 取得該指標，
 * 之後的 move / up 都交給它（overlay 按鈕優先，其餘交給射擊）。
 */
import type { Stage } from '../stage/Stage';

export interface PointerInfo {
  id: number;
  clientX: number;
  clientY: number;
  /** 設計座標（原點左下） */
  x: number;
  y: number;
  button: number;
}

export interface PointerHandler {
  readonly priority: number;
  /** 回傳 true = 取得此指標 */
  down(p: PointerInfo): boolean;
  move?(p: PointerInfo): void;
  up?(p: PointerInfo, cancelled: boolean): void;
}

export class PointerRouter {
  private handlers: PointerHandler[] = [];
  private captured = new Map<number, PointerHandler>();

  constructor(private readonly stage: Stage) {
    const canvas = stage.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      const p = this.info(e);
      for (const h of this.handlers) {
        if (h.down(p)) {
          this.captured.set(e.pointerId, h);
          canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const h = this.captured.get(e.pointerId);
      if (h) h.move?.(this.info(e));
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const h = this.captured.get(e.pointerId);
      if (!h) return;
      this.captured.delete(e.pointerId);
      h.up?.(this.info(e), cancelled);
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
  }

  private info(e: PointerEvent): PointerInfo {
    const d = this.stage.clientToDesign(e.clientX, e.clientY);
    return { id: e.pointerId, clientX: e.clientX, clientY: e.clientY, x: d.x, y: d.y, button: e.button };
  }

  add(h: PointerHandler): () => void {
    this.handlers.push(h);
    this.handlers.sort((a, b) => b.priority - a.priority);
    return () => {
      this.handlers = this.handlers.filter((x) => x !== h);
    };
  }
}
