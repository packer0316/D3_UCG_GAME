import { el } from './dom';
import type { MetricExplanation } from './RoomMetrics';

let nextTooltipId = 0;

/** 掛在面板上，避免被內層捲動容器裁掉；支援 hover、鍵盤 focus 與觸控點按。 */
export class MetricTooltip {
  private readonly tip = el('div', 'directory-stat-tooltip');
  private active: HTMLButtonElement | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly panel: HTMLElement) {
    this.tip.id = `room-metric-tooltip-${++nextTooltipId}`;
    this.tip.setAttribute('role', 'tooltip');
    this.tip.hidden = true;
    panel.append(this.tip);
    this.tip.addEventListener('pointerenter', () => clearTimeout(this.closeTimer));
    this.tip.addEventListener('pointerleave', () => this.scheduleHide());
    panel.addEventListener('scroll', event => { if (!this.tip.contains(event.target as Node)) this.hide(); }, true);
    panel.addEventListener('pointerdown', event => {
      if (!this.tip.contains(event.target as Node) && !this.active?.contains(event.target as Node)) this.hide();
    });
  }

  get visible(): boolean { return !this.tip.hidden; }

  bind(button: HTMLButtonElement, info: MetricExplanation): void {
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') this.show(button, info); });
    button.addEventListener('pointerleave', () => this.scheduleHide());
    button.addEventListener('focus', () => this.show(button, info));
    button.addEventListener('blur', () => this.hide());
    button.addEventListener('click', () => this.show(button, info));
  }

  hide(): void {
    clearTimeout(this.closeTimer);
    this.tip.hidden = true;
    this.active?.removeAttribute('aria-describedby');
    this.active = null;
  }

  private scheduleHide(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.hide(), 140);
  }

  private show(button: HTMLButtonElement, info: MetricExplanation): void {
    this.hide();
    this.active = button;
    this.tip.replaceChildren(el('div', 'directory-tooltip-title', info.title),
      el('div', 'directory-tooltip-formula', info.formula),
      el('ul', '', ...info.lines.map(line => el('li', '', line))),
      el('div', 'directory-tooltip-note', info.note));
    button.setAttribute('aria-describedby', this.tip.id);
    this.tip.hidden = false;
    const outer = this.panel.getBoundingClientRect(), target = button.getBoundingClientRect();
    const scale = outer.width / this.panel.offsetWidth;
    const width = this.tip.offsetWidth, height = this.tip.offsetHeight;
    const left = (target.left + target.width / 2 - outer.left) / scale - width / 2;
    const above = (target.top - outer.top) / scale - height - 8;
    const below = (target.bottom - outer.top) / scale + 8;
    this.tip.style.left = `${Math.max(10, Math.min(left, this.panel.clientWidth - width - 10))}px`;
    this.tip.style.top = `${Math.max(10, Math.min(above >= 10 ? above : below, this.panel.clientHeight - height - 10))}px`;
  }
}
