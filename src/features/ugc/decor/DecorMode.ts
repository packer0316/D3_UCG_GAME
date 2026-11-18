/**
 * 裝潢模式（SPEC-UGC §9）：俯視相機 + 地面棋盤格，把擁有的裝飾物擺到格子上。
 *
 * 進入：不在家就先回家 → server 暫停魚群與輪替 → 換俯視相機、藏起砲台與戰鬥介面。
 * 操作：點物品列拿起 → 點格子放下；沒拿東西時點已擺放的物品 = 拿起來（移動）；
 *       R 旋轉、右鍵 / Esc 收回、「清空」全部收回。
 * 離開：「完成」送 server 驗證存檔；「取消」放棄這次的變更。
 * 擺放規則與 server 共用 game/ugc/DecoDefine（canPlaceDeco）。
 */
import * as THREE from 'three';
import type { PointerInfo } from '@engine/input/PointerRouter';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { CameraPresetId } from '@game/define/CameraDefine';
import {
  DECO_DEFINES,
  DECO_GRID,
  MAX_DECO_ITEMS,
  canPlaceDeco,
  countPlaced,
  decoFootprint,
  decoWorldRect,
  getDecoDefine,
  worldToCell,
} from '@game/ugc/DecoDefine';
import type { DecoPlacement } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { closeCurrentPanel } from '../ui/Panel';
import { clear, decoIcon, el } from '../ui/dom';
import type { DecoLayer } from './DecoLayer';
import { createDecoObject, disposeDecoObject } from './DecoFactory';

const COLOR_OK = 0x4cff7a;
const COLOR_BAD = 0xff4c4c;
const COLOR_PICK = 0xffd84c;
/** 按下到放開移動超過這個距離（設計像素）就不算點擊 */
const CLICK_SLOP = 10;

interface Hand {
  id: string;
  rot: 0 | 1;
}

export class DecorMode {
  active = false;
  private busy = false;
  private items: DecoPlacement[] = [];
  private hand: Hand | null = null;
  /** 游標所在的格子（可能在格線外） */
  private hover: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number } | null = null;

  // ---- 3D：棋盤格、格子高亮、手上物品的預覽
  private readonly root = new THREE.Group();
  private readonly highlight: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ghost: THREE.Object3D | null = null;
  private ghostKey = '';

  // ---- DOM：上方工具列、下方物品列
  private readonly dom: HTMLDivElement;
  private readonly hint = el('div', 'ugc-decor-hint');
  private readonly count = el('span', 'ugc-decor-count');
  private readonly palette = el('div', 'ugc-decor-palette');
  private readonly allFilter = el('button', 'ugc-decor-filter');
  private readonly ownedFilter = el('button', 'ugc-decor-filter');
  private paletteFilter: 'all' | 'owned' = 'all';
  private inventoryKey = '';

  /** 進入時被藏起來的圖層（離開時還原） */
  private hidden: THREE.Object3D[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
    private readonly layer: DecoLayer,
  ) {
    // 棋盤格
    const g = DECO_GRID;
    const w = g.cols * g.cell;
    const d = g.rows * g.cell;
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: createCheckerTexture(), transparent: true, depthTest: false, depthWrite: false }),
    );
    grid.position.set(g.originX + w / 2, g.originY + d / 2, 0);
    grid.renderOrder = 5;
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: COLOR_OK, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }),
    );
    this.highlight.renderOrder = 6;
    this.highlight.visible = false;
    this.root.add(grid, this.highlight);
    this.root.name = 'ugc_decor_mode';
    this.root.visible = false;
    ctx.layers.deco.add(this.root);

    // 介面
    const button = (text: string, cls: string, fn: () => void) => {
      const b = el('button', `ugc-btn ${cls}`.trim(), text);
      b.addEventListener('click', fn);
      return b;
    };
    const setFilter = (filter: 'all' | 'owned') => {
      this.paletteFilter = filter;
      this.renderPalette();
      this.palette.scrollLeft = 0;
    };
    this.allFilter.addEventListener('click', () => setFilter('all'));
    this.ownedFilter.addEventListener('click', () => setFilter('owned'));
    const scrollButton = (direction: -1 | 1) => {
      const b = el('button', 'ugc-decor-scroll', direction < 0 ? '‹' : '›');
      b.setAttribute('aria-label', direction < 0 ? '向左瀏覽造物' : '向右瀏覽造物');
      b.addEventListener('click', () => this.palette.scrollBy({ left: direction * this.palette.clientWidth * 0.8, behavior: 'smooth' }));
      return b;
    };
    this.dom = el(
      'div',
      'ugc-decor hidden',
      el(
        'div',
        'ugc-decor-bar ui-interactive',
        el('span', 'ugc-decor-title', '裝潢模式'),
        this.count,
        el('span', 'ugc-flex'),
        button('旋轉 (R)', '', () => this.rotate()),
        button('收回 (Esc)', '', () => this.putBack()),
        button('清空', '', () => this.clearAll()),
        button('取消', '', () => void this.leave(false)),
        button('完成', 'primary', () => void this.leave(true)),
      ),
      this.hint,
      el('div', 'ugc-decor-tray ui-interactive',
        el('div', 'ugc-decor-catalog-bar',
          this.allFilter, this.ownedFilter,
          el('span', 'ugc-decor-catalog-hint', '未擁有的造物可由抽卡取得'),
          scrollButton(-1), scrollButton(1),
        ),
        this.palette,
      ),
    );
    for (const node of this.dom.querySelectorAll('.ui-interactive')) node.addEventListener('pointerdown', (e) => e.stopPropagation());
    ctx.ui.layers.panel.appendChild(this.dom);
    ctx.events.on('ugc:profile', () => {
      if (!this.active || this.inventoryKey === JSON.stringify(this.ugc.profile?.decos ?? {})) return;
      if (this.hand && this.remaining(this.hand.id) <= 0) this.hand = null;
      this.refresh();
    });

    // 裝潢模式中，canvas 上的指標都歸這裡（優先於技能按鈕與射擊）
    ctx.input.add({
      priority: 1000,
      down: (p) => {
        if (!this.active) return false;
        this.downAt = { x: p.x, y: p.y };
        return true;
      },
      up: (p, cancelled) => this.onUp(p, cancelled),
    });
  }

  // ------------------------------------------------------------------
  // 進入 / 離開
  // ------------------------------------------------------------------

  async enter(): Promise<void> {
    if (this.active || this.busy) return;
    this.busy = true;
    try {
      if (!this.ugc.atHome) {
        const r = await this.ugc.goHome();
        if (!r.ok) return void this.ctx.ui.toast(r.reason ?? '回家失敗');
      }
      const ack = await this.ugc.setEditing(true);
      if (!ack.ok) return void this.ctx.ui.toast(ack.reason ?? '無法進入裝潢模式');
      this.start();
    } finally {
      this.busy = false;
    }
  }

  private start(): void {
    const { ctx } = this;
    closeCurrentPanel();
    this.active = true;
    this.items = (this.ugc.profile?.home.deco ?? []).map((d) => ({ ...d }));
    this.hand = null;
    this.hover = null;
    this.paletteFilter = 'all';
    this.palette.scrollLeft = 0;

    // 場上清空（server 已暫停魚群）、停止自動與鎖定
    ctx.services.get(Tokens.AIAutoSystem).stop();
    ctx.services.get(Tokens.SkillSystem).set('AutoShoot', false);
    ctx.services.get(Tokens.LockSystem).clear();
    ctx.services.get(Tokens.FishSystem).clearAll();
    ctx.services.get(Tokens.ShootingSystem).clearBullets();

    // 藏起砲台、子彈、魚與 overlay（技能按鈕、獎勵、命中特效）；戰鬥 HUD 由 CSS 藏
    const L = ctx.layers;
    this.hidden = [L.fish, L.bullet, L.cannon, L.reward, L.hitFx, L.ui].filter((o) => o.visible);
    for (const o of this.hidden) o.visible = false;
    ctx.ui.root.classList.add('ugc-decor-on');
    this.dom.classList.remove('hidden');

    ctx.services.get(Tokens.CameraControl).setOverride(CameraPresetId.Decor);
    this.root.visible = true;
    this.layer.setEditing(true);

    ctx.stage.canvas.addEventListener('pointermove', this.onHover);
    ctx.stage.canvas.addEventListener('pointerleave', this.onLeave);
    ctx.stage.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKey, true);
    ctx.events.emit('ugc:decor', { active: true });
    this.refresh();
  }

  /** save = true：送出配置（驗證失敗就留在裝潢模式）；false：放棄變更 */
  private async leave(save: boolean): Promise<void> {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      if (save) {
        const r = await this.ugc.saveDeco(this.items);
        if (!r.ok) return void this.ctx.ui.toast(r.reason ?? '儲存失敗');
        this.ctx.ui.toast('裝潢已儲存');
      }
      await this.ugc.setEditing(false);
      this.stop();
    } finally {
      this.busy = false;
    }
  }

  private stop(): void {
    const { ctx } = this;
    this.active = false;
    this.hand = null;
    this.setGhost(null);
    this.highlight.visible = false;
    this.root.visible = false;
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    ctx.ui.root.classList.remove('ugc-decor-on');
    this.dom.classList.add('hidden');
    ctx.stage.canvas.removeEventListener('pointermove', this.onHover);
    ctx.stage.canvas.removeEventListener('pointerleave', this.onLeave);
    ctx.stage.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKey, true);
    // 相機回到場景的預設；裝潢顯示回到房間資料（取消 = 原本的配置）
    ctx.services.get(Tokens.CameraControl).setOverride(null);
    this.layer.setEditing(false);
    ctx.events.emit('ugc:decor', { active: false });
  }

  // ------------------------------------------------------------------
  // 輸入
  // ------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyR') this.rotate();
    else if (e.key === 'Escape') this.putBack();
    else if (e.code !== 'Space') return;
    // 裝潢模式中這些鍵不要傳給戰鬥（空白鍵 = 自動）
    e.stopPropagation();
    e.preventDefault();
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onLeave = (): void => {
    this.hover = null;
    this.refreshPreview();
  };

  private readonly onHover = (e: PointerEvent): void => {
    const d = this.ctx.stage.clientToDesign(e.clientX, e.clientY);
    this.setHover(d.x, d.y);
  };

  private setHover(designX: number, designY: number): void {
    const g = this.ctx.stage.designToGround(designX, designY);
    const cell = g ? worldToCell(g.x, g.y) : null;
    if (cell?.x === this.hover?.x && cell?.y === this.hover?.y) return;
    this.hover = cell;
    this.refreshPreview();
  }

  private onUp(p: PointerInfo, cancelled: boolean): void {
    const down = this.downAt;
    this.downAt = null;
    if (!this.active || cancelled || !down) return;
    if (Math.hypot(p.x - down.x, p.y - down.y) > CLICK_SLOP) return;
    this.setHover(p.x, p.y);
    if (p.button === 2) this.putBack();
    else if (p.button === 0) this.click();
  }

  /** 點格子：手上有東西 → 放下；沒有 → 把那格的物品拿起來 */
  private click(): void {
    if (this.hand) {
      const c = this.candidate();
      if (!c || !this.canPlace(c)) return;
      this.items.push(c);
      if (this.remaining(c.id) <= 0) this.hand = null;
    } else {
      const i = this.itemAt(this.hover);
      if (i < 0) return;
      const [item] = this.items.splice(i, 1);
      this.hand = { id: item.id, rot: item.rot };
    }
    this.refresh();
  }

  private rotate(): void {
    if (!this.hand) return;
    this.hand.rot = this.hand.rot === 0 ? 1 : 0;
    this.refresh();
  }

  /** 手上的物品放回物品列 */
  private putBack(): void {
    if (!this.hand) return;
    this.hand = null;
    this.refresh();
  }

  private clearAll(): void {
    this.items = [];
    this.hand = null;
    this.refresh();
  }

  // ------------------------------------------------------------------
  // 規則
  // ------------------------------------------------------------------

  /** 這種物品還能擺幾個 = 擁有數 − 已擺放數 */
  private remaining(id: string): number {
    return (this.ugc.profile?.decos[id] ?? 0) - (countPlaced(this.items)[id] ?? 0);
  }

  /** 手上的物品放在游標位置時的擺放（游標在佔地的中間） */
  private candidate(): DecoPlacement | null {
    const def = this.hand && getDecoDefine(this.hand.id);
    if (!this.hand || !def || !this.hover) return null;
    const f = decoFootprint(def, this.hand.rot);
    return { id: def.id, x: this.hover.x - Math.floor((f.w - 1) / 2), y: this.hover.y - Math.floor((f.d - 1) / 2), rot: this.hand.rot };
  }

  private canPlace(c: DecoPlacement): boolean {
    return this.items.length < MAX_DECO_ITEMS && this.remaining(c.id) > 0 && canPlaceDeco(this.items, c);
  }

  /** 這一格上的物品（items 的索引；沒有 = -1） */
  private itemAt(cell: { x: number; y: number } | null): number {
    if (!cell) return -1;
    return this.items.findIndex((it) => {
      const def = getDecoDefine(it.id);
      if (!def) return false;
      const f = decoFootprint(def, it.rot);
      return cell.x >= it.x && cell.x < it.x + f.w && cell.y >= it.y && cell.y < it.y + f.d;
    });
  }

  // ------------------------------------------------------------------
  // 畫面
  // ------------------------------------------------------------------

  private refresh(): void {
    this.layer.show(this.items, true);
    this.renderPalette();
    this.refreshPreview();
    this.count.textContent = `已擺放 ${this.items.length} / ${MAX_DECO_ITEMS}`;
    const def = this.hand && getDecoDefine(this.hand.id);
    this.hint.textContent = def
      ? `「${def.name}」占 ${def.w*def.d} 格（${decoFootprint(def,this.hand!.rot).w}×${decoFootprint(def,this.hand!.rot).d}）　點格子放下 · R 旋轉 · 右鍵 / Esc 收回`
      : '點下方的物品拿起來擺放；點已經擺好的物品可以拿起來移動';
  }

  private renderPalette(): void {
    const scrollLeft = this.palette.scrollLeft;
    const focusedId = this.palette.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.decoId : undefined;
    clear(this.palette);
    const owned = this.ugc.profile?.decos ?? {};
    this.inventoryKey = JSON.stringify(owned);
    this.allFilter.textContent = `全部造物（${DECO_DEFINES.length}）`;
    this.ownedFilter.textContent = `已擁有（${DECO_DEFINES.filter((d) => (owned[d.id] ?? 0) > 0).length}）`;
    this.allFilter.setAttribute('aria-pressed', String(this.paletteFilter === 'all'));
    this.ownedFilter.setAttribute('aria-pressed', String(this.paletteFilter === 'owned'));
    let any = false;
    // 花園珍藏排前面，積木在後
    for (const def of [...DECO_DEFINES].sort((a,b)=>Number(b.model==='artisan')-Number(a.model==='artisan'))) {
      const total = owned[def.id] ?? 0;
      if (this.paletteFilter === 'owned' && total <= 0) continue;
      any = true;
      const left = this.remaining(def.id);
      const on = this.hand?.id === def.id;
      const locked = total <= 0;
      const tile = el(
        'button',
        `ugc-decor-item${on ? ' on' : ''}${locked ? ' unowned' : left <= 0 && !on ? ' empty' : ''}`,
        decoIcon(def, 54),
        el('span', 'ugc-card-name', def.name),
        el('span', 'ugc-card-lv', locked ? '未擁有 · 抽卡取得' : `剩 ${left} / ${total}`),
      );
      tile.dataset.decoId=def.id;
      tile.setAttribute('aria-pressed',String(on));
      tile.setAttribute('aria-disabled', String(left <= 0 && !on));
      tile.title=`${def.name} · ${def.w*def.d} 格（${def.w}×${def.d}）${def.description ? `\n${def.description}` : ''}`;
      tile.addEventListener('click', () => {
        if (locked) return void this.ctx.ui.toast(`尚未擁有「${def.name}」，可從抽卡取得`);
        if (on) this.hand = null;
        else if (left > 0) this.hand = { id: def.id, rot: 0 };
        else return void this.ctx.ui.toast(`「${def.name}」已經全部擺出去了`);
        this.refresh();
      });
      this.palette.append(tile);
      if (def.id === focusedId) tile.focus({ preventScroll: true });
    }
    if (!any) this.palette.append(el('div', 'ugc-decor-empty', '還沒有裝飾物，去抽卡取得'));
    this.palette.scrollLeft = scrollLeft;
  }

  private setGhost(hand: Hand | null): void {
    const key = hand ? `${hand.id}:${hand.rot}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    if (this.ghost) {
      this.root.remove(this.ghost);
      disposeDecoObject(this.ghost);
      this.ghost = null;
    }
    const def = hand && getDecoDefine(hand.id);
    if (hand && def) {
      this.ghost = createDecoObject(def, hand.rot, { ghost: true });
      this.root.add(this.ghost);
    }
  }

  /** 游標處的預覽：手上有東西 → 半透明物品 + 綠 / 紅格；沒有 → 可以拿起來的物品標黃 */
  private refreshPreview(): void {
    const c = this.candidate();
    this.setGhost(c ? this.hand : null);
    let rect: { x: number; y: number; w: number; d: number } | null = null;
    let color = COLOR_OK;
    if (c) {
      rect = decoWorldRect(c, getDecoDefine(c.id)!);
      color = this.canPlace(c) ? COLOR_OK : COLOR_BAD;
      this.ghost?.position.set(rect.x + rect.w / 2, rect.y + rect.d / 2, 0);
    } else if (!this.hand) {
      const item = this.items[this.itemAt(this.hover)];
      const def = item && getDecoDefine(item.id);
      if (item && def) {
        rect = decoWorldRect(item, def);
        color = COLOR_PICK;
      }
    }
    this.highlight.visible = !!rect;
    if (rect) {
      this.highlight.position.set(rect.x + rect.w / 2, rect.y + rect.d / 2, 0);
      this.highlight.scale.set(rect.w, rect.d, 1);
      this.highlight.material.color.setHex(color);
    }
  }
}

/** 棋盤格貼圖：兩色交錯 + 格線，半透明疊在地面上 */
function createCheckerTexture(): THREE.CanvasTexture {
  const { cols, rows } = DECO_GRID;
  const px = 32;
  const canvas = document.createElement('canvas');
  canvas.width = cols * px;
  canvas.height = rows * px;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(20, 40, 70, 0.28)';
      g.fillRect(x * px, y * px, px, px);
    }
  }
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  g.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    g.beginPath();
    g.moveTo(Math.min(x * px + 0.5, canvas.width - 0.5), 0);
    g.lineTo(Math.min(x * px + 0.5, canvas.width - 0.5), canvas.height);
    g.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    g.beginPath();
    g.moveTo(0, Math.min(y * px + 0.5, canvas.height - 0.5));
    g.lineTo(canvas.width, Math.min(y * px + 0.5, canvas.height - 0.5));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
