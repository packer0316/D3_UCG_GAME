/**
 * UGC 面板共用外框：遮罩（擋住射擊）+ 置中的視窗（標題列、關閉鈕）。
 * 同時只開一個面板；Esc 或點遮罩關閉；開著的時候空白鍵不會觸發「自動」。
 */
import type { UIRoot } from '@ui/UIRoot';
import { el } from './dom';

export interface PanelOptions {
  title: string;
  /** 設計座標的寬高（畫面比較窄時會自動縮小） */
  width: number;
  height: number;
  className?: string;
}

let current: Panel | null = null;

export class Panel {
  readonly root: HTMLDivElement;
  readonly win: HTMLDivElement;
  readonly body: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private opened = false;
  /** 每次打開時呼叫（重新整理內容） */
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(
    private readonly ui: UIRoot,
    private readonly opts: PanelOptions,
  ) {
    this.titleEl = el('div', 'ugc-panel-title', opts.title);
    const close = el('button', 'ugc-panel-close', '✕');
    close.title = '關閉（Esc）';
    close.addEventListener('click', () => this.close());
    this.body = el('div', 'ugc-panel-body');
    this.win = el('div', `ugc-panel ${opts.className ?? ''}`.trim(), el('div', 'ugc-panel-head', this.titleEl, close), this.body);
    this.root = el('div', 'ugc-backdrop ui-interactive hidden', this.win);
    // 點遮罩（不是視窗）關閉
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    ui.layers.panel.appendChild(this.root);
    ui.onResize(() => this.layout());
    this.layout();
  }

  private layout(): void {
    this.win.style.width = `${Math.min(this.opts.width, this.ui.width - 32)}px`;
    this.win.style.height = `${Math.min(this.opts.height, this.ui.height - 32)}px`;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    } else if (e.code === 'Space') {
      // 面板開著時空白鍵不要觸發「自動」
      e.stopPropagation();
    }
  };

  setTitle(text: string): void {
    this.titleEl.textContent = text;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) return;
    current?.close();
    current = this;
    this.opened = true;
    this.root.classList.remove('hidden');
    window.addEventListener('keydown', this.onKey, true);
    this.onOpen?.();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    if (current === this) current = null;
    this.root.classList.add('hidden');
    window.removeEventListener('keydown', this.onKey, true);
    this.onClose?.();
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }
}

/** 關掉目前開著的面板（進入裝潢模式、換房時用） */
export function closeCurrentPanel(): void {
  current?.close();
}
