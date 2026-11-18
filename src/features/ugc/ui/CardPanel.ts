/**
 * 魚卡 / 收藏（SPEC-UGC §5、§7）：所有魚卡（未擁有的反灰）、擁有的場景與裝飾物；點魚卡看等級效果並升級。
 * 魚卡區上方「一鍵升級」（§7.1）：確認框列出每張卡的升級與總花費，確定後一次送出。
 */
import type { GameContext } from '@game/GameContext';
import { CARD_FISH_TYPES, CARD_ORIGINAL_ODDS, FISH_RARITY, RARITY_NAME, SCENE_RARITY, isBossCard } from '@game/ugc/CardDefine';
import {
  MULT_MAX,
  MULT_MIN,
  checkLevelUp,
  commissionRate,
  fishMultiplier,
  hasFixedOdds,
  levelMultiplier,
  levelUpCost,
  nextBreakthrough,
  planLevelUpAll,
  ticketLevelFactor,
} from '@game/ugc/CultivateRule';
import { DECO_DEFINES } from '@game/ugc/DecoDefine';
import { MAX_LEVEL } from '@game/ugc/UgcDefine';
import type { LevelUpAllPlan } from '@game/ugc/UgcTypes';
import { FISH_SCENE_LIMIT, isSkyScene } from '@game/define/SceneDefine';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, el, fishName, fmt, fmtMult, fmtOdds, fmtPct, rarityTag } from './dom';
import { createSummonCard } from './SummonCard';

export class CardPanel {
  readonly panel: Panel;
  private readonly upInfo = el('span', 'ugc-card-toolbar-info');
  private readonly upAllBtn = el('button', 'ugc-btn primary', '一鍵升級');
  private readonly grid = el('div', 'ugc-card-grid');
  private readonly extras = el('div', 'ugc-card-extras');
  private readonly detail = el('div', 'ugc-card-detail');
  private selected: number = CARD_FISH_TYPES[0];
  /** 一鍵升級的確認框（開著時才有） */
  private confirm: HTMLDivElement | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '魚卡', width: 940, height: 580, className: 'collection-panel' });
    const toolbar = el('div', 'ugc-card-toolbar', this.upInfo, this.upAllBtn);
    this.upAllBtn.addEventListener('click', () => this.openConfirm());
    this.panel.body.append(el('div', 'ugc-cards', el('div', 'ugc-card-left', toolbar, this.grid, this.extras), this.detail));
    this.panel.onOpen = () => this.render();
    this.panel.onClose = () => this.closeConfirm();
    this.panel.onEscape = () => {
      if (!this.confirm) return false;
      this.closeConfirm();
      return true;
    };
    ctx.events.on('ugc:profile', () => this.panel.isOpen && this.render());
  }

  private render(): void {
    const p = this.ugc.profile;
    if (!p) return;
    this.panel.setTitle(`魚卡（${Object.keys(p.fish).length} / ${CARD_FISH_TYPES.length}）`);

    const plan = planLevelUpAll(p);
    this.upInfo.textContent = plan.levels ? `可升級 ${plan.upgrades.length} 張 · 共 ${plan.levels} 級` : '沒有可升級的魚卡';
    this.upAllBtn.disabled = !plan.levels;

    clear(this.grid);
    for (const t of CARD_FISH_TYPES) {
      const card = p.fish[t];
      const tile = createSummonCard({ kind: 'fish', id: t, rarity: FISH_RARITY[t] }, {
        compact: true, note: card ? `Lv.${card.level} · 碎片 ${card.copies}` : '未擁有',
        onClick: () => { this.selected = t; this.render(); },
      });
      tile.classList.add('collection-card');
      tile.classList.toggle('locked', !card);
      tile.classList.toggle('on', t === this.selected);
      // 碎片夠升級 → 提示
      if (card && checkLevelUp(p, t).ok) tile.append(el('span', 'ugc-card-up', '可升級'));
      this.grid.append(tile);
    }

    clear(this.extras);
    const scenes = el('div', 'ugc-extra-row');
    for (const s of Object.keys(SCENE_RARITY).map(Number)) {
      const chip = createSummonCard({ kind: 'scene', id: s, rarity: SCENE_RARITY[s] }, { compact: true, note: p.scenes.includes(s) ? '已解鎖' : '未擁有' });
      chip.classList.toggle('locked', !p.scenes.includes(s));
      scenes.append(chip);
    }
    const decos = el('div', 'ugc-extra-row');
    for (const d of DECO_DEFINES) {
      const n = p.decos[d.id] ?? 0;
      const icon = createSummonCard({ kind: 'deco', id: d.id, rarity: d.rarity }, { compact: true, note: `${d.w*d.d} 格 · ${d.w}×${d.d} · 持有 ×${n}` });
      icon.title=`${d.name}${d.description ? `\n${d.description}` : ''}\n占地 ${d.w}×${d.d}，可旋轉擺放`;
      icon.classList.toggle('locked', n === 0);
      decos.append(icon);
    }
    this.extras.append(
      el('div', 'ugc-section-title', `場景（${p.scenes.length} / ${Object.keys(SCENE_RARITY).length}）`),
      scenes,
      el('div', 'ugc-section-title', '裝飾物'),
      decos,
    );

    this.renderDetail();
  }

  private renderDetail(): void {
    const p = this.ugc.profile;
    clear(this.detail);
    if (!p) return;
    const t = this.selected;
    const rarity = FISH_RARITY[t];
    const card = p.fish[t];
    const level = card?.level ?? 1;

    const limit = FISH_SCENE_LIMIT[t];
    const where = !limit ? '任何場景' : limit.every((s) => isSkyScene(s)) ? '只能放在天空場景' : '只能放在地面場景';
    this.detail.append(
      el('div', 'ugc-detail-fish', createSummonCard({ kind: 'fish', id: t, rarity })),
      el('div', 'ugc-detail-title', fishName(t)),
      el('div', 'ugc-detail-tags', rarityTag(rarity), el('span', '', RARITY_NAME[rarity]), isBossCard(t) && el('span', 'ugc-tag-boss', 'Boss'), el('span', '', where)),
    );

    if (!card) {
      this.detail.append(el('div', 'ugc-detail-desc', '尚未擁有。到公有地或別人的家園打龍，掉落抽卡券後去抽卡取得。'));
      return;
    }

    const next = level < MAX_LEVEL ? level + 1 : null;
    const row = (label: string, now: string, after: string | null) =>
      el('div', 'ugc-kv', el('span', 'ugc-kv-k', label), el('span', 'ugc-kv-v', now), after !== null && el('span', 'ugc-kv-next', `→ ${after}`));
    // 倍率 / 賠率（SPEC-UGC §7）：原倍率 < 10 固定；賠率 = 說明頁原倍率 × 倍率
    const fixed = hasFixedOdds(t);
    const orig = CARD_ORIGINAL_ODDS[t];
    const odds = (lv: number) => `${fmtOdds(orig!.odds * fishMultiplier(t, lv))} 倍`;
    this.detail.append(
      el(
        'div',
        'ugc-kv-list',
        row('等級', `Lv.${level} / ${MAX_LEVEL}`, next ? `Lv.${next}` : null),
        fixed
          ? row('倍率', '×1（固定）', null)
          : row('倍率', fmtMult(levelMultiplier(level), 3), next ? fmtMult(levelMultiplier(next), 3) : null),
        orig && row(orig.max ? '最高賠率' : '賠率', odds(level), next && !fixed ? odds(next) : null),
        row('屋主抽成', fmtPct(commissionRate(level), 2), next ? fmtPct(commissionRate(next), 2) : null),
        row('訪客掉券', fmtMult(ticketLevelFactor(level), 3), next ? fmtMult(ticketLevelFactor(next), 3) : null),
      ),
      el(
        'div',
        'ugc-detail-desc',
        fixed
          ? `原倍率 ${orig!.odds} 倍（低於 10 倍），倍率固定；升級提高抽成、掉券與人氣。等級只在放進家園時生效。`
          : `家園的倍率 = 原倍率的 ${fmtMult(MULT_MIN, 1)} ~ ${fmtMult(MULT_MAX, 1)}（公有地 ×1）。倍率越高，中獎金額越高，也越難被打死。等級只在放進家園時生效。`,
      ),
    );

    const cost = levelUpCost(rarity, level);
    if (!cost) {
      this.detail.append(el('div', 'ugc-detail-max', '已達最高等級'));
      return;
    }
    const check = checkLevelUp(p, t);
    const btn = el('button', 'ugc-btn primary wide', '升級');
    btn.disabled = !check.ok;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await this.ugc.levelUp(t);
      this.ctx.ui.toast(r.ok ? `${fishName(t)} 升到 Lv.${level + 1}` : (r.reason ?? '升級失敗'));
      // 成功後 server 會送新的資產 → ugc:profile 重畫；失敗才需要自己恢復按鈕
      if (!r.ok) btn.disabled = false;
    });
    // 突破級要碎片；其他等級只要金幣，提示下次突破
    const nb = cost.copies ? null : nextBreakthrough(rarity, level);
    const copiesItem = cost.copies
      ? el('div', `ugc-cost-item${card.copies < cost.copies ? ' lack' : ''}`, el('span', '', '突破碎片'), el('b', '', `${card.copies} / ${cost.copies}`))
      : el('div', 'ugc-cost-item', el('span', '', `碎片 ${card.copies}`), el('b', '', nb ? `Lv.${nb.level} 突破需 ${nb.copies}` : '不需要'));
    this.detail.append(
      el(
        'div',
        'ugc-cost',
        copiesItem,
        el('div', `ugc-cost-item${p.money < cost.gold ? ' lack' : ''}`, el('span', '', '金幣'), el('b', '', fmt(cost.gold))),
      ),
      btn,
    );
    if (!check.ok) this.detail.append(el('div', 'ugc-detail-warn', check.reason ?? ''));
  }

  // ------------------------------------------------------------------
  // 一鍵升級（§7.1）
  // ------------------------------------------------------------------

  private openConfirm(): void {
    const p = this.ugc.profile;
    if (!p || this.confirm) return;
    // 金幣跟著座位餘額更新（沒有事件），按下時重算
    const plan = planLevelUpAll(p);
    if (!plan.levels) {
      this.ctx.ui.toast('沒有可升級的魚卡');
      this.render();
      return;
    }

    const list = el('div', 'ugc-confirm-list');
    for (const u of plan.upgrades) {
      list.append(
        el(
          'div',
          'ugc-confirm-row',
          rarityTag(FISH_RARITY[u.fishType]),
          el('span', 'ugc-confirm-name', fishName(u.fishType)),
          el('span', 'ugc-confirm-lv', `Lv.${u.from} → `, el('b', '', `Lv.${u.to}`)),
          el('span', 'ugc-confirm-gold', fmt(u.gold)),
        ),
      );
    }
    const cancel = el('button', 'ugc-btn', '取消');
    const ok = el('button', 'ugc-btn primary', '確定升級');
    cancel.addEventListener('click', () => this.closeConfirm());
    ok.addEventListener('click', () => this.submitLevelUpAll(plan, ok, cancel));

    const sum = (label: string, value: string, cls = '') => el('div', `ugc-confirm-sum-item ${cls}`.trim(), el('span', '', label), el('b', '', value));
    const box = el(
      'div',
      'ugc-confirm-box',
      el('div', 'ugc-confirm-title', '一鍵升級'),
      el('div', 'ugc-confirm-sub', `${plan.upgrades.length} 張魚卡 · 共升 ${plan.levels} 級`),
      list,
      el(
        'div',
        'ugc-confirm-sum',
        sum('碎片', `−${fmt(plan.copies)}`),
        sum('金幣', `−${fmt(plan.gold)}`, 'cost'),
        sum('升級後剩餘金幣', fmt(p.money - plan.gold)),
      ),
      el('div', 'ugc-confirm-actions', cancel, ok),
    );
    this.confirm = el('div', 'ugc-confirm', box);
    // 點框外 = 取消
    this.confirm.addEventListener('pointerdown', (e) => {
      if (e.target === this.confirm) this.closeConfirm();
    });
    this.panel.win.append(this.confirm);
    ok.focus();
  }

  private closeConfirm(): void {
    this.confirm?.remove();
    this.confirm = null;
  }

  private async submitLevelUpAll(plan: LevelUpAllPlan, ok: HTMLButtonElement, cancel: HTMLButtonElement): Promise<void> {
    ok.disabled = cancel.disabled = true;
    // 預算 = 確認框的總花費：server 不會花得比這更多
    const r = await this.ugc.levelUpAll(plan.gold);
    this.closeConfirm();
    this.ctx.ui.toast(
      r.ok ? `一鍵升級：${r.upgrades.length} 張魚卡共升 ${r.levels} 級，花費 ${fmt(r.gold)} 金幣` : (r.reason ?? '升級失敗'),
    );
    // 成功後 server 會送新的資產 → ugc:profile 重畫
  }
}
