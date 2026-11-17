/** Cinematic summoning. The server remains the sole authority for costs, rolls and inventory. */
import type { GameContext } from '@game/GameContext';
import { RARITIES, RARITY_NAME } from '@game/ugc/CardDefine';
import { GACHA_COST, GACHA_POOL, GACHA_RARITY_WEIGHT, GACHA_TEN_GUARANTEE, gachaPoolOf, type GachaItem } from '@game/ugc/GachaDefine';
import type { GachaResult } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { SummonEffects } from '../fx/SummonEffects';
import { Panel } from './Panel';
import { el, fmt } from './dom';
import { CARD_FINISH, cardFinish, cardKind, cardName, createSummonCard, resultNote, revealCard } from './SummonCard';
import './summon-squeeze.css';

/** charging = 發牌中、ready = 牌發好了等玩家按、revealing = 翻牌中 */
type DrawPhase = 'idle' | 'requesting' | 'charging' | 'ready' | 'revealing' | 'complete';

/**
 * 紫卡（SR）以上的瞇牌節奏（ms，相對輪到這張的時間）：翻牌翻到一半會停住
 * peeks = 每段翻一點就停住的時間點、windup = 往回收一點蓄力、open = 啪地翻到正面、next = 翻開後多久輪下一張
 */
const SQUEEZE = {
  SR: { peeks: [400, 1080], windup: 1760, open: 1880, next: 820 },
  SSR: { peeks: [480, 1220, 2080], windup: 3050, open: 3170, next: 2150 },
} as const;
/** 一般卡（白 / 藍）依序連翻的間隔 */
const FLIP_STEP = { N: 260, R: 360 } as const;
const PEEKS = ['peek-1', 'peek-2', 'peek-3'];
/** 演出用的暫時 class（跳過 / 結束時全部清掉） */
const CARD_FX = ['is-squeezing', 'is-windup', 'is-snap', 'just-revealed', 'just-opened', ...PEEKS];

export class GachaPanel {
  readonly panel: Panel;
  private readonly tickets = el('b', 'summon-ticket-count', '0');
  private readonly stage = el('div', 'summon-stage');
  private readonly status = el('div', 'summon-status');
  private readonly skip = el('button', 'summon-text-button summon-skip', '跳過演出');
  /** 「點擊翻牌」提示（ready 時蓋在牌上；整個牌區也都可以點） */
  private readonly tapHint = el('button', 'summon-tap-hint');
  /** 發牌動畫還沒結束就按了：發完立刻開翻 */
  private flipQueued = false;
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
    this.tapHint.type = 'button';
    this.stage.addEventListener('click', () => this.startFlip());
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
      for (const sound of ['sound/MG_4', 'sound/C_1', 'sound/C_2', 'sound/C_3', 'sound/MG_2', 'sound/L_4']) void ctx.audio.load(sound);
    };
    this.panel.onClose = () => {
      this.closeOverlay();
      // 關閉只中斷演出，不取消 server 的抽卡。
      // 結果已經完整看過（complete）→ 清掉，下次打開回首頁；
      // 還沒看完（翻到一半就關、或結果在關閉期間才回來）→ 保留，下次打開先顯示一次，看過再關才回首頁。
      if (this.phase === 'complete') { this.results = []; this.cards = []; }
      else if (this.phase !== 'requesting' && this.results.length) this.finish();
      this.clearTimers(); this.effects.stop();
      this.returnFocus?.focus({ preventScroll: true });
    };
    this.panel.onEscape = () => { if (!this.overlay) return false; this.closeOverlay(); return true; };
    this.panel.win.addEventListener('keydown', e => this.trapFocus(e));
    ctx.events.on('ugc:profile', () => this.refresh());
  }

  private get busy(): boolean { return this.phase === 'requesting' || this.phase === 'charging' || this.phase === 'ready' || this.phase === 'revealing'; }

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
    this.phase = 'charging'; this.flipQueued = false; this.renderResults();
    this.panel.win.dataset.phase = 'charging'; this.status.textContent = '龍魂正在回應你的契約…';
    this.skip.hidden = false; this.skip.focus({ preventScroll: true }); this.effects.setCharge(1);
    if (this.reduced.matches) { this.finish(); return; }
    // 發牌動畫（summon-deal，十連最後一張約 1.7 秒）落定後，等玩家按一下才翻
    this.later(() => this.awaitFlip(), this.results.length === 1 ? 1350 : 1750);
  }

  /** 牌發好了：單抽按一下翻這張；十連按一下後依序自動翻完 */
  private awaitFlip(): void {
    this.phase = 'ready'; this.panel.win.dataset.phase = 'ready'; this.effects.setCharge(.45);
    if (this.flipQueued) { this.startFlip(); return; }
    const single = this.results.length === 1;
    this.tapHint.replaceChildren(el('b', '', single ? '點擊翻牌' : '點擊開始翻牌'), el('small', '', 'TAP TO REVEAL'));
    this.stage.append(this.tapHint);
    this.tapHint.focus({ preventScroll: true });
    this.status.textContent = single ? '點擊卡片翻開' : '按一下，十張依序自動翻開';
  }

  private startFlip(): void {
    if (this.phase === 'charging') { this.flipQueued = true; return; }
    if (this.phase !== 'ready') return;
    const hadFocus = document.activeElement === this.tapHint;
    this.tapHint.remove();
    if (hadFocus) this.skip.focus({ preventScroll: true });
    this.phase = 'revealing'; this.panel.win.dataset.phase = 'revealing'; this.effects.setCharge(.1);
    // 依格子順序翻：左上 → 右上，再左下 → 右下（DOM 順序即閱讀順序，窄畫面 3 / 2 欄也一樣）。
    // 白 / 藍卡噠噠噠連翻；輪到紫卡以上就停下來瞇牌。
    let at = 80;
    this.results.forEach((item, index) => {
      if (item.rarity !== 'SR' && item.rarity !== 'SSR') {
        this.later(() => this.reveal(index), at);
        at += FLIP_STEP[item.rarity];
        return;
      }
      const beat = SQUEEZE[item.rarity];
      this.later(() => this.beginSqueeze(index), at);
      beat.peeks.forEach((t, step) => this.later(() => this.peek(index, step), at + t));
      this.later(() => this.windup(index), at + beat.windup);
      this.later(() => this.reveal(index), at + beat.open);
      at += beat.open + beat.next;
    });
    this.later(() => this.finish(), at + 600);
  }

  private get grid(): HTMLElement | null { return this.stage.querySelector('.summon-result-grid'); }

  /** 瞇牌開始：其他卡壓暗、這張浮起，卡色光從卡底滲出 */
  private beginSqueeze(index: number): void {
    const item = this.results[index], card = this.cards[index];
    if (!item || !card) return;
    const ssr = item.rarity === 'SSR';
    this.keepVisible(card);
    card.classList.add('is-squeezing');
    this.grid?.classList.add('is-focusing');
    this.effects.aim(cardFinish(item), card); this.effects.setCharge(ssr ? .75 : .55);
    this.status.textContent = ssr ? '……！這股氣息是' : '……卡底透出了光';
    this.play('sound/L_4', ssr ? .5 : .35);
  }

  /** 翻一點就停住；越翻越多、越抖、光越亮 */
  private peek(index: number, step: number): void {
    const item = this.results[index], card = this.cards[index];
    if (!item || !card) return;
    const ssr = item.rarity === 'SSR';
    card.classList.remove(...PEEKS); card.classList.add(PEEKS[step]);
    this.effects.setCharge((ssr ? .8 : .6) + step * .12);
    const glow = `${CARD_FINISH[cardFinish(item)].label}的光芒，從卡底溢出…`;
    this.status.textContent = (ssr ? [glow, '傳說的氣息，正在甦醒…', '就是現在——'] : [glow, '史詩龍魂，回應契約…'])[step];
    this.play('sound/MG_2', .3 + step * .15);
  }

  /** 往回收一點蓄力、光一收（吸氣），下一拍啪地翻開 */
  private windup(index: number): void {
    const card = this.cards[index];
    if (!card) return;
    card.classList.remove(...PEEKS); card.classList.add('is-windup');
    this.effects.setCharge(0);
  }

  private reveal(index: number): void {
    const item = this.results[index], card = this.cards[index];
    if (!item || !card) return;
    const squeezed = card.classList.contains('is-squeezing');
    this.revealed++;
    if (squeezed) { card.classList.remove('is-squeezing', 'is-windup', ...PEEKS); card.classList.add('is-snap', 'just-opened'); }
    else { this.keepVisible(card); card.classList.add('just-revealed'); }
    revealCard(card, item);
    this.effects.burst(cardFinish(item), card); this.effects.setCharge(0);
    this.status.textContent = `${this.revealed} / ${this.results.length} · ${RARITY_NAME[item.rarity]} ${cardName(item)}`;
    if (item.rarity === 'SSR') {
      this.play('sound/C_3', .7); this.shake(6, 460);
      // 先讓人看到翻開的那一下，再拉中央特寫
      this.later(() => this.showLegend(item), squeezed ? 520 : 0);
    } else if (item.rarity === 'SR') { this.play('sound/C_2', .55); this.shake(3, 260); }
    else this.play('sound/C_1', item.rarity === 'R' ? .3 : .23);
    this.later(() => card.classList.remove('just-revealed', 'just-opened'), 1000);
    if (squeezed) this.later(() => this.grid?.classList.remove('is-focusing'), item.rarity === 'SSR' ? 2000 : 700);
  }

  private shake(px: number, ms: number): void {
    const at = (x: number, y: number) => ({ transform: `translate(${x}px,${y}px)` });
    this.panel.win.animate([at(0, 0), at(-px, px * .4), at(px, -px * .4), at(-px * .5, px * .2), at(0, 0)], { duration: ms, easing: 'ease-out' });
  }

  /** 窄畫面十連可捲動：輪到的卡捲進可視範圍 */
  private keepVisible(card: HTMLElement): void {
    const grid = this.grid;
    if (!grid || grid.scrollHeight <= grid.clientHeight + 1) return;
    const g = grid.getBoundingClientRect(), c = card.getBoundingClientRect();
    const k = grid.clientHeight / (g.height || 1); // 螢幕 px → 版面 px（UI 依 designScale 縮放）
    const pad = 14;
    if (c.top < g.top + pad) grid.scrollBy({ top: (c.top - g.top - pad) * k, behavior: 'smooth' });
    else if (c.bottom > g.bottom - pad) grid.scrollBy({ top: (c.bottom - g.bottom + pad) * k, behavior: 'smooth' });
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
    const focusSkip = document.activeElement === this.skip || document.activeElement === this.tapHint;
    this.tapHint.remove();
    this.clearTimers(); this.phase = 'complete'; this.panel.win.dataset.phase = 'complete';
    this.cards.forEach((card, i) => { revealCard(card, this.results[i]); card.classList.remove(...CARD_FX); });
    this.grid?.classList.remove('is-focusing');
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
