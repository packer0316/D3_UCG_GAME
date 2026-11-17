/**
 * 自動（AIAuto）設定面板 — 原版 TMDCommon AIAutoSettingViewAdvance（csd）+ DT3 AIAutoSettingView.lua
 *
 * - 介面：直接載入原版 csd，以 DOM 建立（CsdDom）；設計尺寸 1400×640，水平置中
 * - 魚清單：AI_AUTO_FISH_LIST ∩ server 清單（依 server 順序），每列 4 格、可捲動（拖曳或滾輪）
 * - 點格子：已選 → 移除；未選 → 加到最後；序號 = 清單中的順序
 * - 條件列：勾選框 + −/+（長按加速）+ 點數值輸入；放開或輸入後自動勾選
 * - 確定：存檔 → 回呼 → 關閉；X：只關閉
 */
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { isFishSupported } from '@game/define/FishDefine';
import {
  AI_AUTO_FISH_LIST,
  AI_CELL_NODES,
  AI_CELLS_PER_ROW,
  AI_HOLD_LEVEL_UP_SEC,
  AI_HOLD_TICK_SEC,
  AI_OPTION_KEYS,
  AI_OPTIONS,
  AI_PANEL_CSD,
  AI_PANEL_DESIGN_WIDTH,
  AI_ROW_CSD,
  AI_ROW_SIZE,
  aiStorageKey,
  type AIAutoConfig,
  type AIAutoFish,
  type AIOptionKey,
} from '@game/define/AIAutoDefine';
import { CsdDom, paintFrame, setCsdPixelScale, type CsdDomNode } from './CsdDom';
import './aiAutoPanel.css';

interface SavedSetting {
  FSeq?: number[];
  ChBox?: number[];
  SAmount?: string;
  WinOdds?: string;
  CoinLess?: string;
  CoinMore?: string;
}

interface OptionRow {
  key: AIOptionKey;
  checkbox: CsdDomNode;
  minus: CsdDomNode;
  add: CsdDomNode;
  label: CsdDomNode;
  touch: CsdDomNode;
}

interface Cell {
  fish: AIAutoFish;
  bg: CsdDomNode;
  on: CsdDomNode;
  order: CsdDomNode;
}

export class AIAutoPanel {
  private modal!: HTMLDivElement;
  private dom: CsdDom | null = null;
  private content!: HTMLDivElement;
  private cells: Cell[] = [];
  private rows: OptionRow[] = [];
  /** 顯示中的魚（依 server 順序） */
  private shown: AIAutoFish[] = [];
  /** 已選魚種（優先順序） */
  private selected: number[] = [];
  private values: Record<AIOptionKey, number> = { LimitShoot: 3000, WinOdds: 10, CoinLess: 0, CoinMore: 0 };
  private checked: Record<AIOptionKey, boolean> = { LimitShoot: false, WinOdds: false, CoinLess: false, CoinMore: false };
  private chips = 0;
  private serverList: number[] | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly onConfirm: (config: AIAutoConfig) => void,
  ) {}

  async preload(): Promise<void> {
    await Promise.all([this.ctx.csd.load(AI_PANEL_CSD), this.ctx.csd.load(AI_ROW_CSD)]);
  }

  init(): void {
    const panelCsd = this.ctx.csd.get(AI_PANEL_CSD);
    if (!panelCsd) {
      console.error('[AIAutoPanel] csd not loaded');
      return;
    }
    const modal = document.createElement('div');
    modal.className = 'ai-auto-modal ui-interactive';
    modal.style.display = 'none';
    this.modal = modal;
    this.ctx.ui.layers.popup.appendChild(modal);
    // 擋住點擊，不傳到遊戲
    modal.addEventListener('pointerdown', (e) => e.stopPropagation());

    // 九宮格依實際螢幕倍率烘焙（UI 縮放 × 裝置像素比），避免模糊
    setCsdPixelScale(this.ctx.stage.designScale * (window.devicePixelRatio || 1));
    const dom = new CsdDom(this.ctx.csd, panelCsd);
    this.dom = dom;
    modal.appendChild(dom.root);
    dom.find('UI_Black')?.setVisible(false); // 背景改由 modal 鋪滿（寬螢幕也蓋得住）
    dom.find('Node_AutoUseEnergy')?.setVisible(false); // DT3：AUTO_USE_ENERGY_SHOT = false
    this.layout();
    this.ctx.stage.onResize(() => this.layout());

    this.buildFishList(dom);
    this.bindButtons(dom);
    this.bindOptions(dom);
    this.loadSetting();

    // server 可選清單（U2G_SMART_FILTER_LIST_REQ）
    this.ctx.net.on('G2U_SMART_FILTER_LIST_ACK', ({ fishIds }) => {
      this.serverList = fishIds;
      this.rebuildCells();
    });
    this.ctx.net.send('U2G_SMART_FILTER_LIST_REQ', {});
  }

  private layout(): void {
    if (!this.dom) return;
    this.dom.root.style.left = `${(this.ctx.stage.designWidth - AI_PANEL_DESIGN_WIDTH) / 2}px`;
  }

  get isOpen(): boolean {
    return !!this.modal && this.modal.style.display !== 'none';
  }

  /** 開啟（AIAutoSettingViewAdvance:Show）：籌碼兩列重設為目前籌碼 */
  open(): void {
    if (!this.dom) return;
    this.chips = this.ctx.services.get(Tokens.SeatSystem).displayMoney;
    this.values.CoinLess = this.chips;
    this.values.CoinMore = this.chips;
    this.refreshOptions();
    this.refreshCells();
    this.modal.style.display = '';
  }

  close(): void {
    if (this.modal) this.modal.style.display = 'none';
  }

  // ------------------------------------------------------------------
  // 魚清單（TableView）
  // ------------------------------------------------------------------

  private buildFishList(dom: CsdDom): void {
    const tv = dom.find('Fish_TV');
    if (!tv) return;
    const scroller = document.createElement('div');
    scroller.className = 'ai-auto-scroller';
    scroller.style.width = `${AI_ROW_SIZE.w}px`;
    scroller.style.height = `${tv.size.h}px`;
    const content = document.createElement('div');
    content.className = 'ai-auto-content';
    scroller.appendChild(content);
    tv.el.appendChild(scroller);
    this.content = content;
    this.bindDragScroll(scroller);
    this.rebuildCells();
  }

  /** 拖曳捲動（原版 TableView 可拖曳、可回彈）；拖動超過 10px 取消點擊 */
  private dragMoved = false;
  private bindDragScroll(el: HTMLDivElement): void {
    let startY = 0;
    let startTop = 0;
    let down = false;
    el.addEventListener('pointerdown', (e) => {
      down = true;
      this.dragMoved = false;
      startY = e.clientY;
      startTop = el.scrollTop;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dy = (e.clientY - startY) / this.ctx.stage.designScale;
      if (Math.abs(dy) > 10) this.dragMoved = true;
      if (this.dragMoved) el.scrollTop = startTop - dy;
    });
    window.addEventListener('pointerup', () => (down = false));
  }

  private rebuildCells(): void {
    const rowCsd = this.ctx.csd.get(AI_ROW_CSD);
    if (!rowCsd || !this.content) return;
    // 客戶端清單 ∩ server 清單，依 server 順序；server 未回應前顯示全部
    const byId = new Map(AI_AUTO_FISH_LIST.map((f) => [f.fishId, f]));
    this.shown = this.serverList
      ? this.serverList.map((id) => byId.get(id)).filter((f): f is AIAutoFish => !!f)
      : AI_AUTO_FISH_LIST.filter((f) => isFishSupported(f.fishId));
    // ResetFishData：已不在清單的已選魚移除
    const ids = new Set(this.shown.map((f) => f.fishId));
    this.selected = this.selected.filter((id) => ids.has(id));

    this.content.innerHTML = '';
    this.cells = [];
    const rowCount = Math.ceil(this.shown.length / AI_CELLS_PER_ROW);
    this.content.style.height = `${rowCount * AI_ROW_SIZE.h}px`;
    for (let r = 0; r < rowCount; r++) {
      const wrap = document.createElement('div');
      wrap.className = 'ai-auto-row';
      wrap.style.top = `${r * AI_ROW_SIZE.h}px`;
      const row = new CsdDom(this.ctx.csd, rowCsd);
      wrap.appendChild(row.root);
      this.content.appendChild(wrap);
      AI_CELL_NODES.forEach((name, c) => {
        const node = row.find(name);
        const fish = this.shown[r * AI_CELLS_PER_ROW + c];
        if (!node) return;
        if (!fish || !node.sub) {
          node.setVisible(false);
          return;
        }
        this.cells.push(this.buildCell(node.sub, fish));
      });
    }
    this.refreshCells();
  }

  private buildCell(cellDom: CsdDom, fish: AIAutoFish): Cell {
    const bg = cellDom.find('Image_fish')!;
    const on = cellDom.find('Image_fishOn')!;
    const name = cellDom.find('fish_text');
    const order = cellDom.find('Order_text')!;
    name?.setText(fish.name);
    // 頭像置中於 Image_fish（AIAutoSettingCellGroup:setFishDataData）
    const ref = this.ctx.csd.frameRef({ type: 'PlistSubImage', path: fish.image, plist: fish.plist });
    if (ref) {
      const w = ref.frame.sourceW * fish.scale;
      const h = ref.frame.sourceH * fish.scale;
      const p = document.createElement('div');
      p.className = 'ai-auto-portrait';
      Object.assign(p.style, {
        left: `${(bg.size.w - w) / 2}px`,
        bottom: `${(bg.size.h - h) / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
      });
      paintFrame(p, ref, w, h);
      bg.el.appendChild(p);
    }
    bg.el.classList.add('ui-interactive', 'ai-auto-cell');
    bg.el.addEventListener('click', () => {
      if (this.dragMoved) return;
      this.toggleFish(fish.fishId);
    });
    return { fish, bg, on, order };
  }

  private toggleFish(id: number): void {
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else this.selected.push(id);
    this.refreshCells();
  }

  private refreshCells(): void {
    for (const c of this.cells) {
      const idx = this.selected.indexOf(c.fish.fishId);
      c.on.setVisible(idx >= 0);
      c.order.setVisible(idx >= 0);
      if (idx >= 0) c.order.setText(String(idx + 1));
    }
  }

  // ------------------------------------------------------------------
  // 按鈕
  // ------------------------------------------------------------------

  private bindButton(node: CsdDomNode | undefined, action: () => void): void {
    if (!node) return;
    const el = node.el;
    el.classList.add('ui-interactive', 'ai-auto-btn');
    el.addEventListener('pointerdown', () => node.setPressed(true));
    el.addEventListener('pointerleave', () => node.setPressed(false));
    el.addEventListener('pointerup', () => node.setPressed(false));
    el.addEventListener('click', action);
  }

  private bindButtons(dom: CsdDom): void {
    const btn = (group: string) => {
      const g = dom.find(group);
      return g ? (dom.find(group, g) ?? g) : undefined;
    };
    // 全選：依顯示順序補上未選的（保留既有順序）
    this.bindButton(btn('Button_all'), () => {
      for (const f of this.shown) if (!this.selected.includes(f.fishId)) this.selected.push(f.fishId);
      this.refreshCells();
    });
    this.bindButton(btn('Button_reset'), () => {
      this.selected = [];
      this.refreshCells();
    });
    this.bindButton(btn('Button_confirm'), () => this.confirm());
    const frame = dom.find('ProjectNode_2')?.sub;
    this.bindButton(frame?.find('CloseButton'), () => this.close());
  }

  // ------------------------------------------------------------------
  // 條件列
  // ------------------------------------------------------------------

  private bindOptions(dom: CsdDom): void {
    for (const key of AI_OPTION_KEYS) {
      const checkbox = dom.find(`CheckBox_${key}`);
      const spinner = checkbox ? dom.find('spinner', checkbox) : undefined;
      if (!checkbox || !spinner) continue;
      const row: OptionRow = {
        key,
        checkbox,
        minus: dom.find('btn_minus', spinner)!,
        add: dom.find('btn_add', spinner)!,
        label: dom.find('txt_amount', spinner)!,
        touch: dom.find('Lo_label_value_touch', spinner)!,
      };
      this.rows.push(row);
      checkbox.el.addEventListener('click', (e) => {
        // spinner 與文字是勾選框的子節點：它們的點擊不切換勾選（原版文字是可觸控元件，會吃掉點擊）
        if ((e.target as Element).closest('[data-name="spinner"], [data-name="Label_desc"]')) return;
        this.checked[key] = !this.checked[key];
        this.refreshOptions();
      });
      this.bindHold(row, row.minus, -1);
      this.bindHold(row, row.add, +1);
      row.touch.el.classList.add('ui-interactive', 'ai-auto-value');
      row.touch.el.addEventListener('click', () => this.editValue(row));
    }
    this.refreshOptions();
  }

  private limits(key: AIOptionKey): [number, number] {
    const d = AI_OPTIONS[key];
    const v = (x: number | 'chips') => (x === 'chips' ? this.chips : x);
    return [v(d.min), v(d.max)];
  }

  private setValue(key: AIOptionKey, value: number, typed = false): void {
    const d = AI_OPTIONS[key];
    const [min, max] = typed ? [d.typeMin, d.typeMax] : this.limits(key);
    this.values[key] = Math.max(min, Math.min(max, Math.round(value)));
  }

  /** −/+：按下先走一步，長按依速度等級加速（AddAndMinusLabelGroupComponent） */
  private bindHold(row: OptionRow, btn: CsdDomNode, dir: 1 | -1): void {
    const d = AI_OPTIONS[row.key];
    let raf = 0;
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      btn.setPressed(false);
      // 放開後自動勾選該列
      this.checked[row.key] = true;
      this.refreshOptions();
    };
    btn.el.classList.add('ui-interactive', 'ai-auto-btn');
    btn.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPressed(true);
      this.setValue(row.key, this.values[row.key] + dir * d.step);
      this.refreshOptions();
      let level = 0;
      let held = 0;
      let levelTime = 0;
      let tick = 0;
      let last = performance.now();
      const loop = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        held += dt;
        levelTime += dt;
        tick += dt;
        if (level < AI_HOLD_LEVEL_UP_SEC.length - 1 && levelTime >= AI_HOLD_LEVEL_UP_SEC[level]) {
          level++;
          levelTime = 0;
        }
        const interval = AI_HOLD_TICK_SEC[level];
        if (held >= AI_HOLD_LEVEL_UP_SEC[0] || level > 0) {
          while (tick >= interval) {
            tick -= interval;
            this.setValue(row.key, this.values[row.key] + dir * d.holdSteps[level]);
            if (interval < 0.01) break; // 高速等級：每幀一次
          }
          this.refreshOptions();
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    btn.el.addEventListener('pointerup', stop);
    btn.el.addEventListener('pointerleave', stop);
  }

  /** 點數值直接輸入（EditBox，夾在固定範圍內） */
  private editValue(row: OptionRow): void {
    const d = AI_OPTIONS[row.key];
    const input = document.createElement('input');
    input.className = 'ai-auto-input';
    input.inputMode = 'numeric';
    input.maxLength = d.maxLength;
    input.value = String(this.values[row.key]);
    row.touch.el.appendChild(input);
    input.focus();
    input.select();
    const done = () => {
      const n = parseInt(input.value.replace(/\D/g, ''), 10);
      if (Number.isFinite(n)) {
        this.setValue(row.key, n, true);
        this.checked[row.key] = true;
      }
      input.remove();
      this.refreshOptions();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
    input.addEventListener('blur', done, { once: true });
  }

  private refreshOptions(): void {
    for (const r of this.rows) {
      r.checkbox.setChecked(this.checked[r.key]);
      r.label.setText(String(this.values[r.key])); // 原版不加千分位
    }
  }

  // ------------------------------------------------------------------
  // 存檔 / 確定
  // ------------------------------------------------------------------

  private get storageKey(): string {
    const seats = this.ctx.services.get(Tokens.SeatSystem);
    return aiStorageKey(seats.seats[seats.yourSeat]?.accountId ?? 0);
  }

  /** 只還原 FSeq / ChBox / SAmount / WinOdds（與原版相同，籌碼兩列不還原） */
  private loadSetting(): void {
    let s: SavedSetting | null = null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      s = raw ? (JSON.parse(raw) as SavedSetting) : null;
    } catch {
      s = null;
    }
    if (!s) return;
    if (Array.isArray(s.FSeq)) this.selected = s.FSeq.filter((n) => typeof n === 'number');
    if (Array.isArray(s.ChBox)) AI_OPTION_KEYS.forEach((k, i) => (this.checked[k] = s!.ChBox![i] === 1));
    const amount = Number(s.SAmount);
    this.values.LimitShoot = amount > 0 ? amount : 3000;
    const odds = Number(s.WinOdds);
    this.values.WinOdds = odds > 0 ? odds : 10;
    this.refreshOptions();
    this.refreshCells();
  }

  private saveSetting(): void {
    const s: SavedSetting = {
      FSeq: [...this.selected],
      ChBox: [...AI_OPTION_KEYS.map((k) => (this.checked[k] ? 1 : 0)), 0],
      SAmount: String(this.values.LimitShoot),
      WinOdds: String(this.values.WinOdds),
      CoinLess: String(this.values.CoinLess),
      CoinMore: String(this.values.CoinMore),
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(s));
    } catch {
      /* 無法存檔時忽略（隱私模式等） */
    }
  }

  private confirm(): void {
    this.saveSetting();
    const v = this.values;
    const c = this.checked;
    this.onConfirm({
      targetFishList: [...this.selected],
      limitShoot: c.LimitShoot ? v.LimitShoot : null,
      stopOverOdds: c.WinOdds ? v.WinOdds : null,
      stopLessCoin: c.CoinLess ? v.CoinLess : null,
      stopMoreCoin: c.CoinMore ? v.CoinMore : null,
    });
    this.close();
  }
}
