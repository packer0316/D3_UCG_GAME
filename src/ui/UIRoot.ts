/**
 * DOM UI 根節點：設計座標（高 640）的圖層，依 Stage.designScale 縮放，蓋在 canvas 上。
 * 根節點 pointer-events: none，只有互動元件吃事件 → 點在空白處仍會傳到 canvas（射擊）。
 *
 * 圖層：hud（戰鬥 HUD）、panel（功能面板，例如之後的抽卡）、popup、toast
 */
import type { Stage } from '@engine/stage/Stage';
import type { AssetManager } from '@engine/assets/AssetManager';
import './ui.css';

export type UILayerName = 'hud' | 'panel' | 'popup' | 'toast';

export class UIRoot {
  readonly root: HTMLDivElement;
  readonly design: HTMLDivElement;
  readonly layers: Record<UILayerName, HTMLDivElement>;
  private resizeFns: (() => void)[] = [];

  constructor(
    container: HTMLElement,
    private readonly stage: Stage,
    private readonly assets: AssetManager,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    this.design = document.createElement('div');
    this.design.className = 'ui-design';
    this.root.appendChild(this.design);
    const mk = (name: UILayerName) => {
      const d = document.createElement('div');
      d.className = `ui-layer ui-layer-${name}`;
      this.design.appendChild(d);
      return d;
    };
    this.layers = { hud: mk('hud'), panel: mk('panel'), popup: mk('popup'), toast: mk('toast') };
    container.appendChild(this.root);
    stage.onResize(() => this.layout());
    this.layout();
  }

  get width(): number {
    return this.stage.designWidth;
  }
  get height(): number {
    return this.stage.designHeight;
  }

  onResize(fn: () => void): void {
    this.resizeFns.push(fn);
  }

  private layout(): void {
    const s = this.stage;
    this.design.style.width = `${s.designWidth}px`;
    this.design.style.height = `${s.designHeight}px`;
    this.design.style.transform = `scale(${s.designScale})`;
    for (const fn of this.resizeFns) fn();
  }

  /** 把 atlas 影格設成元素背景（僅支援非旋轉影格） */
  applyFrame(el: HTMLElement, frameName: string, scale = 1): boolean {
    const r = this.assets.findFrame(frameName);
    if (!r || r.frame.rotated) return false;
    const { frame, atlas } = r;
    const src = (atlas.texture.image as HTMLImageElement).src;
    el.style.backgroundImage = `url("${src}")`;
    el.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
    el.style.backgroundSize = `${atlas.size.w * scale}px ${atlas.size.h * scale}px`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.width = `${frame.w * scale}px`;
    el.style.height = `${frame.h * scale}px`;
    return true;
  }

  toast(text: string, ms = 1500): void {
    const t = document.createElement('div');
    t.className = 'ui-toast';
    t.textContent = text;
    this.layers.toast.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}
