/**
 * 魚卡 / 收藏（SPEC-UGC §5、§7）：所有魚卡（未擁有的反灰）、擁有的場景與裝飾物；點魚卡看等級效果並升級。
 */
import type { GameContext } from '@game/GameContext';
import { CARD_FISH_TYPES, FISH_RARITY, RARITY_NAME, SCENE_RARITY, isBossCard } from '@game/ugc/CardDefine';
import { checkLevelUp, commissionRate, levelMultiplier, levelUpCost, ticketLevelFactor } from '@game/ugc/CultivateRule';
import { DECO_DEFINES } from '@game/ugc/DecoDefine';
import { MAX_LEVEL } from '@game/ugc/UgcDefine';
import { FISH_SCENE_LIMIT, isSkyScene } from '@game/define/SceneDefine';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, decoIcon, el, fishIcon, fishName, fmt, fmtMult, fmtPct, rarityTag, sceneChip } from './dom';

export class CardPanel {
  readonly panel: Panel;
  private readonly grid = el('div', 'ugc-card-grid');
  private readonly extras = el('div', 'ugc-card-extras');
  private readonly detail = el('div', 'ugc-card-detail');
  private selected: number = CARD_FISH_TYPES[0];

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '魚卡', width: 940, height: 580 });
    this.panel.body.append(el('div', 'ugc-cards', el('div', 'ugc-card-left', this.grid, this.extras), this.detail));
    this.panel.onOpen = () => this.render();
    ctx.events.on('ugc:profile', () => this.panel.isOpen && this.render());
  }

  private render(): void {
    const p = this.ugc.profile;
    if (!p) return;
    this.panel.setTitle(`魚卡（${Object.keys(p.fish).length} / ${CARD_FISH_TYPES.length}）`);

    clear(this.grid);
    for (const t of CARD_FISH_TYPES) {
      const card = p.fish[t];
      const tile = el(
        'button',
        `ugc-card${card ? '' : ' locked'}${t === this.selected ? ' on' : ''}`,
        fishIcon(this.ctx.ui, t, 62),
        el('span', 'ugc-card-name', fishName(t)),
        el('span', 'ugc-card-lv', card ? `Lv.${card.level}` : '未擁有'),
      );
      // 碎片夠升級 → 提示
      if (card && checkLevelUp(p, t).ok) tile.append(el('span', 'ugc-card-up', '可升級'));
      tile.addEventListener('click', () => {
        this.selected = t;
        this.render();
      });
      this.grid.append(tile);
    }

    clear(this.extras);
    const scenes = el('div', 'ugc-extra-row');
    for (const s of Object.keys(SCENE_RARITY).map(Number)) {
      const chip = sceneChip(s, p.scenes.includes(s) ? '' : 'locked');
      scenes.append(chip);
    }
    const decos = el('div', 'ugc-extra-row');
    for (const d of DECO_DEFINES) {
      const n = p.decos[d.id] ?? 0;
      const icon = decoIcon(d, 46);
      icon.classList.toggle('locked', n === 0);
      icon.append(el('span', 'ugc-deco-count', `×${n}`));
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
      el('div', 'ugc-detail-fish', fishIcon(this.ctx.ui, t, 110)),
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
    this.detail.append(
      el(
        'div',
        'ugc-kv-list',
        row('等級', `Lv.${level}`, next ? `Lv.${next}` : null),
        row('倍率', fmtMult(levelMultiplier(level)), next ? fmtMult(levelMultiplier(next)) : null),
        row('屋主抽成', fmtPct(commissionRate(level)), next ? fmtPct(commissionRate(next)) : null),
        row('訪客掉券', fmtMult(ticketLevelFactor(level)), next ? fmtMult(ticketLevelFactor(next)) : null),
      ),
      el('div', 'ugc-detail-desc', '倍率越高，中獎金額越高，也越難被打死。等級只在放進家園時生效。'),
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
    this.detail.append(
      el(
        'div',
        'ugc-cost',
        el('div', `ugc-cost-item${card.copies < cost.copies ? ' lack' : ''}`, el('span', '', '碎片'), el('b', '', `${card.copies} / ${cost.copies}`)),
        el('div', `ugc-cost-item${p.money < cost.gold ? ' lack' : ''}`, el('span', '', '金幣'), el('b', '', fmt(cost.gold))),
      ),
      btn,
    );
    if (!check.ok) this.detail.append(el('div', 'ugc-detail-warn', check.reason ?? ''));
  }
}
