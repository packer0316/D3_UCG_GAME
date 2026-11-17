/** Shared, full-art collectible cards. Finishes are presentation only, never a fifth server rarity. */
import { FishType } from '@game/define/FishDefine';
import { RARITY_NAME } from '@game/ugc/CardDefine';
import type { GachaItem } from '@game/ugc/GachaDefine';
import type { GachaResult } from '@game/ugc/UgcTypes';
import { decoName, el, fishName, fmt, sceneName } from './dom';
import { cardArtwork } from './GachaArtwork';
import './summon.css';

export type CardFinish = 'white' | 'blue' | 'purple' | 'gold' | 'red';
export const CARD_FINISH: Record<CardFinish, { label: string; color: string; rgb: readonly [number, number, number] }> = {
  white: { label: '白銀', color: '208, 224, 236', rgb: [.75, .86, 1] },
  blue: { label: '蒼藍', color: '79, 173, 255', rgb: [.15, .48, 1] },
  purple: { label: '幻紫', color: '191, 124, 255', rgb: [.65, .25, 1] },
  gold: { label: '鎏金', color: '255, 203, 102', rgb: [1, .62, .18] },
  red: { label: '緋紅', color: '255, 89, 91', rgb: [1, .14, .17] },
};

/** Imperial / Azure dragons use the crimson SSR finish. All other SSR remain gold. */
export function cardFinish(item: GachaItem): CardFinish {
  if (item.rarity === 'SSR') return item.kind === 'fish' && (item.id === FishType.TRex || item.id === FishType.AzureDragon) ? 'red' : 'gold';
  return item.rarity === 'SR' ? 'purple' : item.rarity === 'R' ? 'blue' : 'white';
}

export const cardName = (item: GachaItem): string => item.kind === 'fish' ? fishName(Number(item.id)) : item.kind === 'scene' ? sceneName(Number(item.id)) : decoName(String(item.id));
export const cardKind = (item: GachaItem): string => item.kind === 'fish' ? '龍魂' : item.kind === 'scene' ? '領域' : '造物';
export const cardArt = (item: Pick<GachaItem, 'kind' | 'id'>): string => `${import.meta.env.BASE_URL}res/gacha/${cardArtwork(item).file}`;

export function resultNote(r: GachaResult): string {
  if (r.kind === 'fish') return r.isNew ? '龍魂已加入收藏' : `碎片 +1 · 累計 ${r.copies ?? 0}`;
  if (r.kind === 'scene') return r.isNew ? '全新領域已解鎖' : `重複轉換 · 金幣 +${fmt(r.gold ?? 0)}`;
  return `造物 +1 · 持有 ${r.count ?? 1}`;
}

export interface SummonCardOptions {
  revealed?: boolean;
  isNew?: boolean;
  note?: string;
  onClick?: () => void;
  compact?: boolean;
}

export function revealCard(card: HTMLButtonElement, item: GachaItem): void {
  card.classList.add('is-revealed');
  card.setAttribute('aria-label', `${RARITY_NAME[item.rarity]} ${cardName(item)}，查看卡片`);
}

export function createSummonCard(item: GachaItem, opts: SummonCardOptions = {}): HTMLButtonElement {
  const finish = cardFinish(item);
  const art = cardArtwork(item);
  const portrait = el('img', 'summon-card-portrait');
  portrait.src = cardArt(item);
  portrait.alt = '';
  portrait.draggable = false;
  portrait.decoding = 'async';
  const illustrated = art.file.startsWith('illustrations/');
  if (illustrated) {
    portrait.style.width = `${art.columns * 100}%`;
    portrait.style.height = `${art.rows * 100}%`;
    portrait.style.left = `${-(art.index % art.columns) * 100}%`;
    portrait.style.top = `${-Math.floor(art.index / art.columns) * 100}%`;
  }
  const fallback = el('span', 'summon-card-missing', cardName(item));
  portrait.addEventListener('error', () => { portrait.hidden = true; fallback.hidden = false; }, { once: true });
  fallback.hidden = true;
  const front = el('div', 'summon-card-face summon-card-front',
    el('div', `summon-card-art art-${item.kind}${illustrated ? ' art-illustrated' : ''}`, el('div', 'summon-card-scenery'), portrait, fallback),
    el('div', 'summon-card-engraving'),
    el('div', 'summon-card-top', el('span', 'summon-card-rank', item.rarity), opts.isNew && el('span', 'summon-card-new', 'NEW')),
    el('div', 'summon-card-caption', el('span', 'summon-card-kind', `${cardKind(item)} / ${CARD_FINISH[finish].label}`),
      el('strong', 'summon-card-name', cardName(item)), el('span', 'summon-card-stars', '✦'.repeat(['N', 'R', 'SR', 'SSR'].indexOf(item.rarity) + 1)),
      opts.note && el('small', 'summon-card-note', opts.note)),
    el('div', 'summon-card-foil'),
  );
  const card = el('button', `summon-card${opts.compact ? ' is-compact' : ''}`, el('div', 'summon-card-aura'),
    el('div', 'summon-card-tilt', el('div', 'summon-card-turn', el('div', 'summon-card-face summon-card-back'), front)));
  card.type = 'button';
  card.dataset.finish = finish;
  card.dataset.rarity = item.rarity;
  card.style.setProperty('--card-rgb', CARD_FINISH[finish].color);
  card.setAttribute('aria-label', '尚未揭曉的卡片');
  if (opts.revealed ?? true) revealCard(card, item);
  if (opts.onClick) card.addEventListener('click', opts.onClick);
  else card.tabIndex = -1;
  // CSS transforms keep the text sharp; no per-card renderer or animation loop.
  card.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 13}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 16}deg`);
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--shine-x', '35%'); card.style.setProperty('--shine-y', '25%');
  });
  return card;
}
