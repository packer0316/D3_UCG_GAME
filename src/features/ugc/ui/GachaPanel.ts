/** Cinematic summoning. The server remains the sole authority for costs, rolls and inventory. */
import type { GameContext } from '@game/GameContext';
import { RARITIES, RARITY_NAME, rarityRank } from '@game/ugc/CardDefine';
import { GACHA_COST, GACHA_POOL, GACHA_RARITY_WEIGHT, GACHA_TEN_GUARANTEE, gachaPoolOf, type GachaItem } from '@game/ugc/GachaDefine';
import type { GachaResult } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { SummonEffects } from '../fx/SummonEffects';
import { Panel } from './Panel';
import { el, fmt } from './dom';
import { CARD_FINISH, cardFinish, cardKind, cardName, createSummonCard, resultNote, revealCard } from './SummonCard';

type DrawPhase = 'idle' | 'requesting' | 'charging' | 'revealing' | 'complete';

export class GachaPanel {
  readonly panel: Panel;
  private readonly tickets = el('b', 'summon-ticket-count', '0');
  private readonly stage = el('div', 'summon-stage');
  private readonly status = el('div', 'summon-status');
  private readonly skip = el('button', 'summon-text-button summon-skip', '跳過演出');
  private readonly sound = el('button', 'summon-text-button', '音效：開');
  private readonly hint = el('span', 'summon-cost-hint');
  private readonly buttons: { times: number; btn: HTMLButtonElement }[] = [];
  private readonly effects: SummonEffects;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private phase: DrawPhase = 'idle';
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private results: GachaResult[] = [];
  private cards: HTMLButtonElement[] = [];
  private overlay: HTMLDivElement | null = null;
  private overlayReturn: HTMLElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private soundEnabled = true;
  private lastTimes = 10;
  private revealed = 0;

  constructor(private readonly ctx: GameContext, private readonly ugc: UgcClient) {
    this.panel = new Panel(ctx.ui, { title: '龍魂召喚', width: 1100, height: 608, className: 'summon-panel' });
    this.panel.root.classList.add('summon-backdrop');
    this.panel.win.setAttribute('role', 'dialog');
    this.panel.win.setAttribute('aria-modal', 'true');
    this.panel.win.setAttribute('aria-label', '龍魂召喚');
    this.panel.body.classList.add('summon-body');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const pool = el('button', 'summon-text-button', '卡池一覽 / 機率');
    pool.addEventListener('click', () => this.showPool());
    this.sound.setAttribute('aria-pressed', 'true');
    this.sound.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      this.sound.textContent = `音效：${this.soundEnabled ? '開' : '關'}`;
      this.sound.setAttribute('aria-pressed', String(this.soundEnabled));
    });
    this.skip.hidden = true;
    this.skip.addEventListener('click', () => this.finish());
    const masthead = el('div', 'summon-masthead',
      el('div', 'summon-brand', el('span', 'summon-eyebrow', 'DRAGON SOUL · THE ETERNAL COVENANT'), el('span', 'summon-season', '永恆契約')),
      el('div', 'summon-tools', this.sound, pool));
    const actions = el('div', 'summon-actions');
    for (const [times, title, subtitle] of [[1, '召喚一次', 'SINGLE SUMMON'], [10, '十連召喚', 'TENFOLD SUMMON']] as const) {
      const btn = el('button', `summon-draw${times === 10 ? ' primary' : ''}`,
        el('span', 'summon-draw-copy', el('small', '', subtitle), el('strong', '', title)),
        el('span', 'summon-draw-cost', el('i', 'summon-ticket-icon'), `× ${GACHA_COST[times]}`));
      btn.type = 'button';
      btn.setAttribute('aria-label', `${title}，消耗 ${GACHA_COST[times]} 張抽卡券`);
      btn.addEventListener('click', () => void this.draw(times));
      this.buttons.push({ times, btn }); actions.append(btn);
    }
    const footer = el('div', 'summon-footer',
      el('div', 'summon-wallet', el('span', 'summon-wallet-label', el('i', 'summon-ticket-icon'), '持有召喚券'), this.tickets, this.hint),
      el('div', 'summon-action-area', el('div', 'summon-guarantee', '✦', ` 十連召喚必得 ${GACHA_TEN_GUARANTEE} 稀有以上`), actions));
    const bottom = el('div', 'summon-bottom', el('span', '', '龍魂 · 領域 · 造物'), el('span', '', '緋紅與鎏金，皆為 SSR 傳說'));
    this.panel.body.append(masthead, this.stage, el('div', 'summon-progress', this.status, this.skip), footer, bottom);
    this.effects = new SummonEffects(this.panel.body);
    this.panel.onOpen = () => {
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.effects.start();
      if (this.phase === 'requesting') this.renderWaiting();
      else if (this.results.length) { this.renderResults(); this.finish(); }
      else this.showWelcome();
      this.refresh(); pool.focus({ preventScroll: true });
      for (const sound of ['sound/MG_4', 'sound/C_1', 'sound/C_2', 'sound/C_3']) void ctx.audio.load(sound);
    };
    this.panel.onClose = () => {
      this.closeOverlay();
      // Closing cancels presentation, not the authoritative request. Reopening keeps the receipt.
      if (this.phase !== 'requesting' && this.results.length) this.finish();
      this.clearTimers(); this.effects.stop();
      this.returnFocus?.focus({ preventScroll: true });
    };
    this.panel.onEscape = () => { if (!this.overlay) return false; this.closeOverlay(); return true; };
    this.panel.win.addEventListener('keydown', e => this.trapFocus(e));
    ctx.events.on('ugc:profile', () => this.refresh());
  }

  private get busy(): boolean { return this.phase === 'requesting' || this.phase === 'charging' || this.phase === 'revealing'; }

  private refresh(): void {
    const have = this.ugc.profile?.tickets ?? 0;
    this.tickets.textContent = fmt(have);
    for (const { times, btn } of this.buttons) {
      btn.disabled = this.busy || have < GACHA_COST[times];
      btn.title = this.busy ? '召喚進行中' : have < GACHA_COST[times] ? `還需要 ${GACHA_COST[times] - have} 張召喚券` : `消耗 ${GACHA_COST[times]} 張召喚券`;
    }
    this.hint.textContent = have < 1 ? '前往公有地或其他家園打龍，取得抽卡券' : have < 10 ? `再收集 ${10 - have} 張即可十連` : '契約已就緒，喚醒你的龍魂';
    this.panel.win.setAttribute('aria-busy', String(this.phase === 'requesting'));
  }

  private showWelcome(): void {
    this.phase = 'idle';
    this.panel.win.dataset.phase = 'idle';
    const fan = el('div', 'summon-fan');
    const showcase = [11, 14, 27, 17, 25].map(id => GACHA_POOL.find(x => x.kind === 'fish' && x.id === id)!);
    const cards = showcase.map((item, i) => {
      const card = createSummonCard(item, { onClick: () => this.inspect(item) });
      card.classList.add(`fan-${i}`); fan.append(card); return card;
    });
    this.stage.replaceChildren(el('div', 'summon-welcome',
      el('div', 'summon-hero-copy', el('div', 'summon-eyebrow', 'AWAKEN THE LEGEND'), el('h2', '', '以契約之名，', el('span', '', '喚醒沉睡的龍魂')),
        el('p', '', '每一張卡，都是未知世界的回響。')), fan,
      el('div', 'summon-palette', ...Object.entries(CARD_FINISH).map(([key, value]) => {
        const tag = el('span', '', el('i'), value.label); tag.dataset.finish = key; tag.style.setProperty('--card-rgb', value.color); return tag;
      }))));
    this.status.textContent = '點選卡片可鑑賞 · 完整卡池包含所有龍魂、領域與造物';
    this.effects.setCards(cards);
  }

  private renderWaiting(): void {
    this.panel.win.dataset.phase = 'requesting';
    this.stage.replaceChildren(el('div', 'summon-waiting', el('div', 'summon-sealed-card'), el('span', '', '契約正在連結…')));
    this.status.textContent = '正在確認召喚'; this.skip.hidden = true;
    this.effects.setCards([]); this.effects.setCharge(.65);
  }

  private async draw(times: number): Promise<void> {
    if (this.busy || !GACHA_COST[times] || (this.ugc.profile?.tickets ?? 0) < GACHA_COST[times]) return;
    this.closeOverlay(); this.clearTimers();
    this.lastTimes = times; this.phase = 'requesting';
    this.refresh(); this.renderWaiting(); this.play('sound/MG_4', .45);
    try {
      const ack = await this.ugc.draw(times);
      if (!ack.ok || !ack.results.length) {
        this.phase = this.results.length ? 'complete' : 'idle'; this.effects.setCharge(0);
        if (this.results.length) { this.renderResults(); this.finish(); } else this.showWelcome();
        this.status.textContent = ack.reason ?? '召喚未完成，請稍後再試';
        this.ctx.ui.toast(ack.reason ?? '召喚失敗'); return;
      }
      this.results = ack.results;
      if (!this.panel.isOpen) { this.phase = 'complete'; return; }
      this.beginReveal();
    } catch {
      this.phase = this.results.length ? 'complete' : 'idle'; this.effects.setCharge(0);
      if (this.results.length) { this.renderResults(); this.finish(); } else this.showWelcome();
      this.status.textContent = '連線中斷，請稍後確認收藏與券數';
      this.ctx.ui.toast('連線中斷，請稍後確認收藏與券數');
    } finally { this.refresh(); }
  }

  private renderResults(): void {
    this.revealed = 0;
    const grid = el('div', `summon-result-grid${this.results.length === 1 ? ' is-single' : ''}`);
    this.cards = this.results.map((result, i) => {
      const card = createSummonCard(result, { revealed: false, isNew: result.isNew, note: resultNote(result), onClick: () => {
        if (card.classList.contains('is-revealed') && !this.busy) this.inspect(result, resultNote(result));
      }});
      card.style.setProperty('--deal-index', String(i)); grid.append(card); return card;
    });
    this.stage.replaceChildren(grid); this.effects.setCards(this.cards);
  }

  private beginReveal(): void {
    this.phase = 'charging'; this.renderResults();
    this.panel.win.dataset.phase = 'charging'; this.status.textContent = '龍魂正在回應你的契約…';
    this.skip.hidden = false; this.skip.focus({ preventScroll: true }); this.effects.setCharge(1);
    if (this.reduced.matches) { this.finish(); return; }
    // The highest-rarity reveal comes last, without changing the server receipt order.
    const order = this.results.map((_, i) => i).sort((a, b) => rarityRank(this.results[a].rarity) - rarityRank(this.results[b].rarity));
    let at = this.results.length === 1 ? 1400 : 1800;
    this.later(() => { this.phase = 'revealing'; this.panel.win.dataset.phase = 'revealing'; this.effects.setCharge(.1); }, at - 300);
    for (const index of order) {
      const item = this.results[index];
      if (rarityRank(item.rarity) >= 2) this.later(() => {
        this.cards[index].classList.add('is-awakening'); this.effects.setCharge(.65);
        this.status.textContent = item.rarity === 'SSR' ? '傳說的氣息，正在甦醒…' : '史詩龍魂，回應契約…';
      }, at - 380);
      this.later(() => this.reveal(index), at);
      at += item.rarity === 'SSR' ? 1650 : item.rarity === 'SR' ? 1050 : 450;
    }
    this.later(() => this.finish(), at + 250);
  }

  private reveal(index: number): void {
    const item = this.results[index], card = this.cards[index];
    if (!item || !card) return;
    this.revealed++; revealCard(card, item);
    card.classList.remove('is-awakening'); card.classList.add('just-revealed');
    this.effects.burst(cardFinish(item), card); this.effects.setCharge(0);
    this.status.textContent = `${this.revealed} / ${this.results.length} · ${RARITY_NAME[item.rarity]} ${cardName(item)}`;
    if (item.rarity === 'SSR') {
      this.play('sound/C_3', .6);
      this.panel.win.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 340 });
      this.showLegend(item);
    } else this.play(item.rarity === 'SR' ? 'sound/C_2' : 'sound/C_1', item.rarity === 'SR' ? .45 : .23);
    this.later(() => card.classList.remove('just-revealed'), 1000);
  }

  private showLegend(item: GachaItem): void {
    this.stage.querySelector('.summon-spotlight')?.remove();
    this.stage.querySelector('.summon-legend')?.remove();
    const legend = el('div', 'summon-legend', el('small', '', cardFinish(item) === 'red' ? 'CRIMSON LEGEND' : 'LEGENDARY'), el('b', '', cardName(item)));
    legend.style.setProperty('--card-rgb', CARD_FINISH[cardFinish(item)].color);
    if (this.results.length > 1) {
      const portrait = createSummonCard(item);
      const spotlight = el('div', 'summon-spotlight', portrait, legend);
      spotlight.setAttribute('aria-hidden', 'true');
      spotlight.style.setProperty('--card-rgb', CARD_FINISH[cardFinish(item)].color);
      this.stage.append(spotlight);
      this.effects.setCards([portrait]); this.effects.burst(cardFinish(item), portrait);
      this.later(() => { spotlight.remove(); this.effects.setCards(this.cards); }, 1450);
    } else {
      this.stage.append(legend); this.later(() => legend.remove(), 1450);
    }
  }

  private finish(): void {
    if (this.phase === 'requesting' || !this.results.length) return;
    const focusSkip = document.activeElement === this.skip;
    this.clearTimers(); this.phase = 'complete'; this.panel.win.dataset.phase = 'complete';
    this.cards.forEach((card, i) => { revealCard(card, this.results[i]); card.classList.remove('is-awakening', 'just-revealed'); });
    this.stage.querySelectorAll('.summon-spotlight, .summon-legend').forEach(x => x.remove());
    this.skip.hidden = true; this.effects.setCharge(0); this.effects.setCards(this.cards);
    const fresh = this.results.filter(r => r.isNew).length;
    this.status.textContent = `召喚完成 · ${this.results.length} 張卡片${fresh ? ` · ${fresh} 張全新收藏` : ''} · 點選卡片可放大`;
    this.refresh();
    if (focusSkip) (this.buttons.find(b => b.times === this.lastTimes && !b.btn.disabled)?.btn ?? this.cards[0])?.focus({ preventScroll: true });
  }

  private play(name: string, volume: number): void {
    if (this.soundEnabled && this.panel.isOpen && !document.hidden) this.ctx.audio.play(name, { volume, minInterval: .12 });
  }
  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms); this.timers.add(timer);
  }
  private clearTimers(): void { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }

  private showOverlay(title: string, content: HTMLElement): void {
    if (!this.overlay) this.overlayReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.overlay?.remove();
    const close = el('button', 'summon-text-button', '返回召喚 ✕');
    close.addEventListener('click', () => this.closeOverlay());
    this.overlay = el('div', 'summon-overlay', el('div', 'summon-overlay-head', el('h3', '', title), close), content);
    this.overlay.setAttribute('role', 'dialog'); this.overlay.setAttribute('aria-label', title);
    this.panel.body.append(this.overlay); close.focus({ preventScroll: true });
  }

  private closeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null;
    if (this.overlayReturn?.isConnected && this.panel.isOpen) this.overlayReturn.focus({ preventScroll: true });
    this.overlayReturn = null;
  }

  private showPool(): void {
    const rates = el('div', 'summon-rates', ...RARITIES.map(r => el('div', `summon-rate rate-${r}`,
      el('span', '', `${r} ${RARITY_NAME[r]}`), el('strong', '', `${GACHA_RARITY_WEIGHT[r]}%`), el('small', '', `${gachaPoolOf(r).length} 種`))));
    const grid = el('div', 'summon-pool-grid'), tabs = el('div', 'summon-pool-tabs');
    const filters = [['all', '全部'], ['fish', '龍魂'], ['scene', '領域'], ['deco', '造物']] as const;
    const render = (kind: string) => {
      grid.replaceChildren(...GACHA_POOL.filter(item => kind === 'all' || item.kind === kind).map(item => createSummonCard(item, { compact: true, onClick: () => this.inspect(item, undefined, true) })));
      for (const tab of tabs.querySelectorAll('button')) { tab.classList.toggle('active', tab.dataset.kind === kind); tab.setAttribute('aria-pressed', String(tab.dataset.kind === kind)); }
    };
    for (const [kind, title] of filters) {
      const tab = el('button', 'summon-text-button', `${title} ${kind === 'all' ? GACHA_POOL.length : GACHA_POOL.filter(i => i.kind === kind).length}`);
      tab.dataset.kind = kind; tab.addEventListener('click', () => render(kind)); tabs.append(tab);
    }
    render('all');
    this.showOverlay('永恆契約 · 卡池一覽', el('div', 'summon-pool', rates,
      el('p', 'summon-pool-rules', '以上為單次基礎機率，同稀有度內各卡等機率。十連前九張若未取得 R 以上，最後一張保底 R 以上。緋紅與鎏金皆屬 SSR，紅色不另加機率。'), tabs, grid));
  }

  private inspect(item: GachaItem, note?: string, fromPool = false): void {
    const back = el('button', 'summon-text-button', fromPool ? '← 返回卡池' : '← 返回召喚');
    back.addEventListener('click', () => fromPool ? this.showPool() : this.closeOverlay());
    const description = item.kind === 'fish' ? '將龍魂放入家園，喚醒牠的力量。重複取得的龍魂會化為升級所需的碎片。' : item.kind === 'scene' ? '在家園中設定這片領域。重複的領域卡會自動轉換為金幣。' : '將這件造物擺放在家園中。每次召喚都會增加一件可用的裝飾物。';
    this.showOverlay('卡片鑑賞', el('div', 'summon-inspect', createSummonCard(item),
      el('div', 'summon-inspect-copy', el('div', 'summon-eyebrow', `${item.rarity} / ${cardKind(item)} / ${CARD_FINISH[cardFinish(item)].label}`),
        el('h2', '', cardName(item)), el('p', '', description), note && el('p', 'summon-inspect-note', note),
        cardFinish(item) === 'red' && el('p', 'summon-inspect-note', '特別緋紅卡面 · SSR 傳說'), back)));
  }

  private trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const scope = this.overlay ?? this.panel.win;
    const items = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), [tabindex="0"]')).filter(x => !x.hidden && x.getClientRects().length > 0);
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
}
