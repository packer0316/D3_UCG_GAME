/**
 * 抽卡（SPEC-UGC §6）：券數、單抽 / 十連、機率表；結果一張張翻出來。
 */
import type { GameContext } from '@game/GameContext';
import { RARITIES, RARITY_NAME } from '@game/ugc/CardDefine';
import { getDecoDefine } from '@game/ugc/DecoDefine';
import { GACHA_COST, GACHA_RARITY_WEIGHT, GACHA_TEN_GUARANTEE, gachaPoolOf } from '@game/ugc/GachaDefine';
import type { GachaResult } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, decoIcon, decoName, el, fishIcon, fishName, fmt, rarityTag, sceneChip, sceneName } from './dom';

export class GachaPanel {
  readonly panel: Panel;
  private readonly tickets = el('b', 'ugc-gacha-tickets', '0');
  private readonly results = el('div', 'ugc-gacha-results');
  private readonly buttons: { times: number; btn: HTMLButtonElement }[] = [];
  private busy = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '抽卡', width: 900, height: 560 });
    const actions = el('div', 'ugc-gacha-actions');
    for (const [times, label] of [
      [1, '單抽'],
      [10, '十連'],
    ] as const) {
      const btn = el('button', `ugc-btn ${times === 10 ? 'primary' : ''} wide`, label, el('span', 'ugc-btn-sub', `${GACHA_COST[times]} 張券`));
      btn.addEventListener('click', () => void this.draw(times));
      this.buttons.push({ times, btn });
      actions.append(btn);
    }

    const rates = el('div', 'ugc-gacha-rates');
    for (const r of RARITIES) {
      rates.append(
        el('div', 'ugc-rate', rarityTag(r), el('span', '', RARITY_NAME[r]), el('b', '', `${GACHA_RARITY_WEIGHT[r]}%`), el('span', 'ugc-rate-n', `${gachaPoolOf(r).length} 種`)),
      );
    }

    const left = el(
      'div',
      'ugc-gacha-left',
      el('div', 'ugc-gacha-have', el('span', '', '抽卡券'), this.tickets),
      actions,
      el('div', 'ugc-section-title', '機率'),
      rates,
      el(
        'div',
        'ugc-detail-desc',
        `十連保底至少一個 ${GACHA_TEN_GUARANTEE} 以上。抽到已有的龍變成碎片（升級用）；抽到已有的場景換成金幣。抽卡券要到公有地或別人的家園打龍才會掉。`,
      ),
    );
    this.panel.body.append(el('div', 'ugc-gacha', left, this.results));
    this.panel.onOpen = () => {
      this.showHint();
      this.refresh();
    };
    ctx.events.on('ugc:profile', () => this.refresh());
  }

  private refresh(): void {
    const have = this.ugc.profile?.tickets ?? 0;
    this.tickets.textContent = fmt(have);
    for (const { times, btn } of this.buttons) btn.disabled = this.busy || have < GACHA_COST[times];
  }

  private showHint(): void {
    clear(this.results);
    this.results.append(el('div', 'ugc-gacha-hint', '按「單抽」或「十連」開始抽卡'));
  }

  private async draw(times: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.refresh();
    const ack = await this.ugc.draw(times);
    this.busy = false;
    this.refresh();
    if (!ack.ok) {
      this.ctx.ui.toast(ack.reason ?? '抽卡失敗');
      return;
    }
    clear(this.results);
    ack.results.forEach((r, i) => {
      const card = this.resultCard(r);
      // 一張張翻出來
      card.style.animationDelay = `${i * 0.08}s`;
      this.results.append(card);
    });
  }

  private resultCard(r: GachaResult): HTMLDivElement {
    let icon: HTMLElement;
    let name: string;
    let note: string;
    if (r.kind === 'fish') {
      icon = fishIcon(this.ctx.ui, r.id as number, 78);
      name = fishName(r.id as number);
      note = r.isNew ? '新魚卡' : `碎片 +1（共 ${r.copies}）`;
    } else if (r.kind === 'scene') {
      icon = sceneChip(r.id as number, 'big');
      name = `場景：${sceneName(r.id as number)}`;
      note = r.isNew ? '新場景' : `已擁有 → 金幣 +${fmt(r.gold ?? 0)}`;
    } else {
      const def = getDecoDefine(r.id as string);
      icon = def ? decoIcon(def, 78) : el('div');
      name = decoName(r.id as string);
      note = `裝飾物 ×${r.count}`;
    }
    return el(
      'div',
      `ugc-result r-${r.rarity}${r.isNew ? ' new' : ''}`,
      rarityTag(r.rarity),
      r.isNew && el('span', 'ugc-result-new', 'NEW'),
      icon,
      el('div', 'ugc-result-name', name),
      el('div', 'ugc-result-note', note),
    );
  }
}
