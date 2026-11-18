/**
 * 家園面板（SPEC-UGC §8.1）：收益（領取抽成）、場景輪替表、每個場景格放哪些龍；回家 / 裝潢。
 * 編輯的是草稿，按「儲存」才送 server 驗證。
 */
import type { GameContext } from '@game/GameContext';
import { isFishAllowedInScene } from '@game/define/SceneDefine';
import { CARD_FISH_TYPES, isBossCard } from '@game/ugc/CardDefine';
import { countBoss, slotFishIssue, validateSlots } from '@game/ugc/HomeRule';
import { MAX_BOSS_PER_SLOT, MAX_SLOTS, SLOT_SECONDS } from '@game/ugc/UgcDefine';
import type { HomeSlot } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, el, fishIcon, fishName, fmt, sceneChip, sceneName } from './dom';
import { uiIcon } from './icons';

export class HomePanel {
  readonly panel: Panel;
  /** 按「裝潢」（由 UgcFeature 接到裝潢模式） */
  onDecorate: (() => void) | null = null;
  private readonly incomeRow = el('div', 'ugc-home-income');
  private readonly incomeValues = Array.from({ length: 5 }, () => el('strong', 'ugc-home-stat-value', '—'));
  private readonly claimBtn = el('button', 'ugc-btn gold', '領取收益');
  private readonly slotList = el('div', 'ugc-home-slots');
  private readonly addBtn = el('button', 'ugc-btn wide ugc-home-add', '＋ 新增場景');
  private readonly editor = el('div', 'ugc-home-editor');
  private readonly saveBtn = el('button', 'ugc-btn primary', '儲存設定');
  private readonly homeBtn = el('button', 'ugc-btn', '回家');
  private readonly decorBtn = el('button', 'ugc-btn', uiIcon('decor'), el('span', '', '進入裝潢'));
  private readonly resetBtn = el('button', 'ugc-home-reset', '復原變更');
  private readonly saveState = el('span', 'ugc-home-save-state');
  private readonly slotCount = el('span', 'ugc-home-section-count');
  private readonly main = el('div', 'ugc-home-main');
  private draft: HomeSlot[] = [];
  private selected = 0;
  private dirty = false;
  private saving = false;
  private claiming = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '我的家園', width: 980, height: 600, className: 'home-panel' });
    this.panel.win.querySelector('.ugc-panel-title')?.append(el('span', 'ugc-home-subtitle', '安排場景，打造你的領地'));
    this.decorBtn.addEventListener('click', async () => {
      if (this.saving || (this.dirty && !(await this.save()))) return;
      this.panel.close();
      this.onDecorate?.();
    });
    this.saveBtn.addEventListener('click', () => void this.save());
    this.homeBtn.addEventListener('click', async () => {
      if (this.saving || (this.dirty && !(await this.save()))) return;
      const r = await this.ugc.goHome();
      if (r.ok) this.panel.close();
      else ctx.ui.toast(r.reason ?? '回家失敗');
    });
    this.resetBtn.addEventListener('click', () => { this.loadDraft(); this.render(); });
    this.addBtn.dataset.homeFocus = 'add-slot';
    this.addBtn.addEventListener('click', () => this.add());
    this.claimBtn.addEventListener('click', () => void this.claim());
    ['家園人氣', '平均訪客', '每秒抽成', '累計收益'].forEach((label, i) => {
      this.incomeRow.append(el('div', 'ugc-home-stat', el('span', 'ugc-stat-label', label), this.incomeValues[i]));
    });
    this.incomeRow.append(el('div', 'ugc-home-claim',
      el('div', '', el('span', 'ugc-stat-label', '待領取收益'), this.incomeValues[4]), this.claimBtn,
    ));
    this.main.append(
      el('div', 'ugc-home-left',
        el('div', 'ugc-home-section-head', el('h3', '', '場景輪替'), this.slotCount),
        el('p', 'ugc-home-help', `每 ${SLOT_SECONDS} 秒切換 · 場景可重複`), this.addBtn, this.slotList,
      ), this.editor,
    );
    this.saveState.setAttribute('role', 'status');
    this.panel.body.append(
      el(
        'div',
        'ugc-home',
        this.incomeRow,
        this.main,
        el('div', 'ugc-home-actions',
          el('div', 'ugc-home-save-info', this.saveState, this.resetBtn),
          el('span', 'ugc-flex'), this.homeBtn, this.decorBtn, this.saveBtn,
        ),
      ),
    );
    this.panel.onOpen = () => {
      if (!this.dirty) this.loadDraft();
      this.render();
    };
    ctx.events.on('ugc:income', () => this.panel.isOpen && this.renderIncome());
    ctx.events.on('ugc:room', () => this.panel.isOpen && this.renderActions());
    ctx.events.on('ugc:profile', () => {
      if (!this.panel.isOpen) return;
      // 沒有未儲存的修改才跟著資產更新（例如剛存完）
      if (!this.dirty) this.loadDraft();
      this.render();
    });
  }

  private get owned() {
    const p = this.ugc.profile;
    return { fish: (t: number) => !!p?.fish[t], scene: (s: number) => !!p?.scenes.includes(s) };
  }

  private loadDraft(): void {
    const slots = this.ugc.profile?.home.slots ?? [];
    this.draft = slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] }));
    this.selected = Math.min(this.selected, Math.max(0, this.draft.length - 1));
    this.dirty = false;
  }

  private touch(): void {
    this.dirty = JSON.stringify(this.draft) !== JSON.stringify(this.ugc.profile?.home.slots ?? []);
    this.render();
  }

  private render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset.homeFocus;
    const scrollTop = this.editor.scrollTop;
    const slotScroll = this.slotList.scrollTop;
    this.renderIncome();
    this.renderSlots();
    this.renderEditor();
    this.renderActions();
    this.editor.scrollTop = scrollTop;
    this.slotList.scrollTop = slotScroll;
    if (focusKey) this.panel.body.querySelector<HTMLElement>(`[data-home-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  private renderActions(): void {
    this.saveBtn.disabled = !this.dirty || this.saving;
    this.saveBtn.textContent = this.saving ? '儲存中…' : '儲存設定';
    this.homeBtn.disabled = this.ugc.atHome || this.saving;
    this.homeBtn.textContent = this.ugc.atHome ? '已在家園' : this.dirty ? '儲存並回家' : '回到家園';
    this.decorBtn.disabled = this.saving;
    this.decorBtn.lastElementChild!.textContent = this.dirty ? '儲存並裝潢' : '進入裝潢';
    this.resetBtn.hidden = !this.dirty;
    this.resetBtn.disabled = this.saving;
    this.saveState.textContent = this.saving ? '正在儲存設定' : this.dirty ? '有尚未儲存的變更' : '設定已儲存';
    this.saveState.classList.toggle('dirty', this.dirty);
    this.main.inert = this.saving;
  }

  // ------------------------------------------------------------------
  // 收益
  // ------------------------------------------------------------------

  private renderIncome(): void {
    const income = this.ugc.income;
    if (!income) return;
    const values = [String(income.popularity), `${income.visitors} 人`, fmt(income.perSecond), fmt(income.totalEarned), fmt(income.pending)];
    values.forEach((value, i) => { this.incomeValues[i].textContent = value; });
    this.claimBtn.disabled = this.claiming || income.pending < 1;
    this.claimBtn.textContent = this.claiming ? '領取中…' : '領取收益';
  }

  private async claim(): Promise<void> {
    if (this.claiming || (this.ugc.income?.pending ?? 0) < 1) return;
    this.claiming = true;
    this.renderIncome();
    try {
      const amount = await this.ugc.claim();
      this.ctx.ui.toast(amount > 0 ? `領取抽成 +${fmt(amount)}` : '暫無可領取收益，請稍後再試');
    } finally {
      this.claiming = false;
      this.renderIncome();
    }
  }

  // ------------------------------------------------------------------
  // 輪替表
  // ------------------------------------------------------------------

  private renderSlots(): void {
    clear(this.slotList);
    this.slotCount.textContent = `${this.draft.length} / ${MAX_SLOTS}`;
    this.addBtn.disabled = this.draft.length >= MAX_SLOTS;
    this.addBtn.title = this.addBtn.disabled ? `最多 ${MAX_SLOTS} 個場景` : '新增一格場景輪替';
    this.draft.forEach((slot, i) => {
      const bosses = countBoss(slot.fishTypes);
      const mini = (text: string, title: string, enabled: boolean, fn: () => void) => {
        const b = el('button', 'ugc-mini', text);
        b.title = title;
        b.setAttribute('aria-label', `第 ${i + 1} 格${title}`);
        b.dataset.homeFocus = `slot-${i}-${title}`;
        b.disabled = !enabled;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        return b;
      };
      const select = el('button', 'ugc-home-slot-select',
        el('span', 'ugc-home-slot-art', sceneChip(slot.sceneType), el('span', 'ugc-home-slot-index', String(i + 1).padStart(2, '0')), el('span', 'ugc-home-slot-check', i === this.selected ? '✓' : '')),
        el('span', 'ugc-home-slot-copy', el('strong', '', sceneName(slot.sceneType)), el('span', 'ugc-home-slot-info', `${slot.fishTypes.length} 種龍 · Boss ${bosses}`)),
      );
      select.setAttribute('aria-label', `編輯第 ${i + 1} 格 ${sceneName(slot.sceneType)}`);
      select.title = `第 ${i + 1} 格 · ${sceneName(slot.sceneType)} · ${slot.fishTypes.length} 種龍`;
      select.setAttribute('aria-pressed', String(i === this.selected));
      select.dataset.homeFocus = `slot-${i}`;
      select.addEventListener('click', () => {
        this.selected = i;
        this.render();
        this.editor.scrollTop = 0;
      });
      const row = el('div', `ugc-home-slot${i === this.selected ? ' on' : ''}`, select,
        el('div', 'ugc-home-slot-bottom',
          mini('↑', '上移', i > 0, () => this.move(i, -1)),
          mini('↓', '下移', i < this.draft.length - 1, () => this.move(i, 1)),
          mini('×', '刪除', this.draft.length > 1, () => this.remove(i)),
        ),
      );
      this.slotList.append(row);
    });
  }

  private move(i: number, delta: number): void {
    const j = i + delta;
    [this.draft[i], this.draft[j]] = [this.draft[j], this.draft[i]];
    if (this.selected === i) this.selected = j;
    else if (this.selected === j) this.selected = i;
    this.touch();
  }

  private remove(i: number): void {
    this.draft.splice(i, 1);
    this.selected = Math.min(this.selected > i ? this.selected - 1 : this.selected, this.draft.length - 1);
    this.touch();
  }

  /** 新的一格：第一個擁有的場景 + 這個場景可以放的所有非 Boss 龍 */
  private add(): void {
    if (this.draft.length >= MAX_SLOTS || this.saving) return;
    const scene = this.ugc.profile?.scenes[0];
    if (scene === undefined) return;
    this.draft.push({ sceneType: scene, fishTypes: this.defaultFish(scene) });
    this.selected = this.draft.length - 1;
    this.touch();
    this.slotList.scrollTop = this.slotList.scrollHeight;
    this.editor.scrollTop = 0;
  }

  private defaultFish(sceneType: number): number[] {
    return CARD_FISH_TYPES.filter((t) => this.owned.fish(t) && !isBossCard(t) && isFishAllowedInScene(t, sceneType));
  }

  // ------------------------------------------------------------------
  // 場景格內容
  // ------------------------------------------------------------------

  private renderEditor(): void {
    clear(this.editor);
    const slot = this.draft[this.selected];
    const p = this.ugc.profile;
    if (!slot || !p) return;

    const scenes = el('div', 'ugc-home-scenes');
    for (const s of p.scenes) {
      const chip = el('button', `ugc-home-scene-choice${s === slot.sceneType ? ' on' : ''}`, sceneChip(s));
      chip.setAttribute('aria-label', `場景：${sceneName(s)}`);
      chip.setAttribute('aria-pressed', String(s === slot.sceneType));
      chip.dataset.homeFocus = `scene-${s}`;
      chip.addEventListener('click', () => this.setScene(slot, s));
      scenes.append(chip);
    }

    const bosses = countBoss(slot.fishTypes);
    const grid = el('div', 'ugc-pick-grid ugc-home-fish-grid');
    for (const t of CARD_FISH_TYPES) {
      if (!this.owned.fish(t)) continue;
      const on = slot.fishTypes.includes(t);
      const issue = on
        ? null
        : slotFishIssue(
            t,
            slot.sceneType,
            slot.fishTypes,
            this.owned.fish,
          );
      const tile = el(
        'button',
        `ugc-pick${on ? ' on' : ''}${issue ? ' disabled' : ''}`,
        fishIcon(this.ctx.ui, t, 50),
        el('span', 'ugc-card-name', fishName(t)),
        el('span', 'ugc-card-lv', issue ?? `Lv.${p.fish[t].level}`),
        el('span', 'ugc-home-pick-check', on ? '✓' : '+'),
      );
      tile.dataset.homeFocus = `fish-${t}`;
      tile.dataset.fishType = String(t);
      tile.setAttribute('aria-pressed', String(on));
      tile.setAttribute('aria-disabled', String(!!issue));
      tile.title = `${fishName(t)}${issue ? `：${issue}` : on ? ' · 點擊移除' : ' · 點擊加入'}`;
      tile.addEventListener('click', () => {
        if (issue) return void this.ctx.ui.toast(`${fishName(t)}：${issue}`);
        slot.fishTypes = on ? slot.fishTypes.filter((x) => x !== t) : [...slot.fishTypes, t].sort((a, b) => a - b);
        this.touch();
      });
      grid.append(tile);
    }

    const regular = this.defaultFish(slot.sceneType);
    const allRegular = regular.length > 0 && regular.every((t) => slot.fishTypes.includes(t));
    const bulk = el('button', 'ugc-home-text-button', allRegular ? '取消一般龍' : '一般龍全選');
    bulk.dataset.homeFocus = 'bulk-fish';
    bulk.disabled = !regular.length;
    bulk.addEventListener('click', () => {
      slot.fishTypes = allRegular
        ? slot.fishTypes.filter((t) => !regular.includes(t))
        : [...new Set([...slot.fishTypes, ...regular])].sort((a, b) => a - b);
      this.touch();
    });

    this.editor.append(
      el('div', 'ugc-home-section-head', el('h3', '', `第 ${this.selected + 1} 格 · 選擇場景`), el('span', 'ugc-home-help', '僅顯示已擁有')),
      scenes,
      el('div', 'ugc-home-section-head ugc-home-fish-head',
        el('h3', '', '放出的龍'),
        el('span', 'ugc-home-section-count', `${slot.fishTypes.length} 種 · Boss ${bosses} / ${MAX_BOSS_PER_SLOT}`),
        el('span', 'ugc-flex'), bulk,
      ),
      ...(slot.fishTypes.length === 0 ? [el('div', 'ugc-home-inline-warn', '請至少選擇 1 種龍，才能儲存這個場景。')] : []),
      grid,
    );
  }

  /** 換場景：新場景不能放的龍自動拿掉 */
  private setScene(slot: HomeSlot, sceneType: number): void {
    if (slot.sceneType === sceneType) return;
    slot.sceneType = sceneType;
    const kept = slot.fishTypes.filter((t) => isFishAllowedInScene(t, sceneType));
    if (kept.length !== slot.fishTypes.length) this.ctx.ui.toast(`${sceneName(sceneType)}不能放的龍已拿掉`);
    slot.fishTypes = kept.length ? kept : this.defaultFish(sceneType);
    this.touch();
  }

  private async save(): Promise<boolean> {
    if (this.saving) return false;
    const check = validateSlots(this.draft, this.owned.fish, this.owned.scene);
    if (!check.ok) { this.ctx.ui.toast(check.reason ?? '設定不合規則'); return false; }
    this.saving = true;
    this.renderActions();
    try {
      const r = await this.ugc.saveHome(this.draft.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] })));
      if (r.ok) {
        this.dirty = false;
        this.ctx.ui.toast('家園設定已儲存');
      } else {
        this.ctx.ui.toast(r.reason ?? '儲存失敗');
      }
      return r.ok;
    } finally {
      this.saving = false;
      this.renderActions();
    }
  }
}
