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

export class HomePanel {
  readonly panel: Panel;
  /** 按「裝潢」（由 UgcFeature 接到裝潢模式） */
  onDecorate: (() => void) | null = null;
  private readonly incomeRow = el('div', 'ugc-stats');
  private readonly slotList = el('div', 'ugc-home-slots');
  private readonly editor = el('div', 'ugc-home-editor');
  private readonly saveBtn = el('button', 'ugc-btn primary', '儲存設定');
  private readonly homeBtn = el('button', 'ugc-btn', '回家');
  private draft: HomeSlot[] = [];
  private selected = 0;
  private dirty = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '我的家園', width: 960, height: 600 });
    const decorBtn = el('button', 'ugc-btn', '裝潢');
    decorBtn.addEventListener('click', () => {
      if (this.dirty) return void ctx.ui.toast('請先儲存設定');
      this.panel.close();
      this.onDecorate?.();
    });
    this.saveBtn.addEventListener('click', () => void this.save());
    this.homeBtn.addEventListener('click', async () => {
      const r = await this.ugc.goHome();
      if (r.ok) this.panel.close();
      else ctx.ui.toast(r.reason ?? '回家失敗');
    });
    this.panel.body.append(
      el(
        'div',
        'ugc-home',
        this.incomeRow,
        el('div', 'ugc-home-main', el('div', 'ugc-home-left', el('div', 'ugc-section-title', `場景輪替（每格 ${SLOT_SECONDS} 秒，可重複）`), this.slotList), this.editor),
        el('div', 'ugc-home-actions', this.saveBtn, el('span', 'ugc-flex'), this.homeBtn, decorBtn),
      ),
    );
    this.panel.onOpen = () => {
      this.loadDraft();
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
    this.dirty = true;
    this.render();
  }

  private render(): void {
    this.renderIncome();
    this.renderSlots();
    this.renderEditor();
    this.renderActions();
  }

  private renderActions(): void {
    this.saveBtn.disabled = !this.dirty;
    this.homeBtn.disabled = this.ugc.atHome;
    this.homeBtn.textContent = this.ugc.atHome ? '已在家園' : '回家';
  }

  // ------------------------------------------------------------------
  // 收益
  // ------------------------------------------------------------------

  private renderIncome(): void {
    const income = this.ugc.income;
    clear(this.incomeRow);
    if (!income) return;
    const claim = el('button', 'ugc-btn gold', '領取');
    claim.disabled = income.pending < 1;
    claim.addEventListener('click', async () => {
      claim.disabled = true;
      const amount = await this.ugc.claim();
      if (amount > 0) this.ctx.ui.toast(`領取抽成 +${fmt(amount)}`);
    });
    const stat = (label: string, value: string) => el('div', 'ugc-stat', el('span', 'ugc-stat-label', label), el('span', 'ugc-stat-value', value));
    this.incomeRow.append(
      stat('人氣', String(income.popularity)),
      stat('平均訪客', `${income.visitors} 人`),
      stat('每秒抽成', fmt(income.perSecond)),
      stat('累計抽成', fmt(income.totalEarned)),
      el('div', 'ugc-stat claim', el('span', 'ugc-stat-label', '未領取'), el('span', 'ugc-stat-value gold', fmt(income.pending)), claim),
    );
  }

  // ------------------------------------------------------------------
  // 輪替表
  // ------------------------------------------------------------------

  private renderSlots(): void {
    clear(this.slotList);
    this.draft.forEach((slot, i) => {
      const bosses = countBoss(slot.fishTypes);
      const mini = (text: string, title: string, enabled: boolean, fn: () => void) => {
        const b = el('button', 'ugc-mini', text);
        b.title = title;
        b.disabled = !enabled;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        return b;
      };
      const row = el(
        'div',
        `ugc-home-slot${i === this.selected ? ' on' : ''}`,
        el('span', 'ugc-slot-no', String(i + 1)),
        sceneChip(slot.sceneType),
        el('span', 'ugc-home-slot-info', `龍 ${slot.fishTypes.length} 種${bosses ? `　Boss ${bosses}` : ''}`),
        mini('▲', '上移', i > 0, () => this.move(i, -1)),
        mini('▼', '下移', i < this.draft.length - 1, () => this.move(i, 1)),
        mini('✕', '刪除', this.draft.length > 1, () => this.remove(i)),
      );
      row.addEventListener('click', () => {
        this.selected = i;
        this.render();
      });
      this.slotList.append(row);
    });
    const add = el('button', 'ugc-btn wide', `＋ 新增場景格（${this.draft.length} / ${MAX_SLOTS}）`);
    add.disabled = this.draft.length >= MAX_SLOTS;
    add.addEventListener('click', () => this.add());
    this.slotList.append(add);
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
    this.selected = Math.min(this.selected, this.draft.length - 1);
    this.touch();
  }

  /** 新的一格：第一個擁有的場景 + 這個場景可以放的所有非 Boss 龍 */
  private add(): void {
    const scene = this.ugc.profile?.scenes[0];
    if (scene === undefined) return;
    this.draft.push({ sceneType: scene, fishTypes: this.defaultFish(scene) });
    this.selected = this.draft.length - 1;
    this.touch();
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

    const scenes = el('div', 'ugc-extra-row');
    for (const s of p.scenes) {
      const chip = sceneChip(s, `pick${s === slot.sceneType ? ' on' : ''}`);
      chip.addEventListener('click', () => this.setScene(slot, s));
      scenes.append(chip);
    }

    const bosses = countBoss(slot.fishTypes);
    const grid = el('div', 'ugc-pick-grid');
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
      );
      tile.addEventListener('click', () => {
        if (issue) return void this.ctx.ui.toast(`${fishName(t)}：${issue}`);
        slot.fishTypes = on ? slot.fishTypes.filter((x) => x !== t) : [...slot.fishTypes, t].sort((a, b) => a - b);
        this.touch();
      });
      grid.append(tile);
    }

    this.editor.append(
      el('div', 'ugc-section-title', `第 ${this.selected + 1} 格的場景`),
      scenes,
      el('div', 'ugc-section-title', `放出的龍（已選 ${slot.fishTypes.length} 種，Boss ${bosses} / ${MAX_BOSS_PER_SLOT}）`),
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

  private async save(): Promise<void> {
    const check = validateSlots(this.draft, this.owned.fish, this.owned.scene);
    if (!check.ok) return void this.ctx.ui.toast(check.reason ?? '設定不合規則');
    this.saveBtn.disabled = true;
    const r = await this.ugc.saveHome(this.draft);
    if (r.ok) {
      this.dirty = false;
      this.ctx.ui.toast('家園設定已儲存');
    } else {
      this.ctx.ui.toast(r.reason ?? '儲存失敗');
    }
    this.renderActions();
  }
}
