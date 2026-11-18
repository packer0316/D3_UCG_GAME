/**
 * UGC 介面共用的小工具：建立 DOM、數字格式、魚 / 場景 / 裝飾物的圖示。
 */
import { getFishDefine } from '@game/define/FishDefine';
import { SCENE_DEFINES } from '@game/define/SceneDefine';
import { FISH_RARITY, RARITY_NAME, SCENE_RARITY, isBossCard } from '@game/ugc/CardDefine';
import { getDecoDefine, type DecoDefine } from '@game/ugc/DecoDefine';
import type { Rarity } from '@game/ugc/UgcTypes';
import type { UIRoot } from '@ui/UIRoot';
import { cardArtwork } from './GachaArtwork';

type Child = Node | string | null | undefined | false;

/** 建立元素：el('div', 'cls a b', '文字' 或子節點…) */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** 千分位整數 */
export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** 倍率 / 百分比顯示 */
export const fmtMult = (m: number): string => `×${m.toFixed(1)}`;
export const fmtPct = (r: number): string => `${Math.round(r * 1000) / 10}%`;

export const fishName = (fishType: number): string => getFishDefine(fishType)?.name ?? `#${fishType}`;
export const sceneName = (sceneType: number): string => SCENE_DEFINES[sceneType]?.name ?? `場景 ${sceneType}`;

/** 稀有度標籤（N / R / SR / SSR） */
export function rarityTag(rarity: Rarity): HTMLSpanElement {
  const tag = el('span', `ugc-rarity r-${rarity}`, rarity);
  tag.title = RARITY_NAME[rarity];
  return tag;
}

/**
 * 魚的頭像（獎圈用的 Reward_common_D3_1.plist 圖，原圖 150 × 150）。
 * 圖集還沒載入或找不到影格 → 顯示名稱第一個字。
 */
export function fishIcon(ui: UIRoot, fishType: number, size: number): HTMLDivElement {
  const box = el('div', `ugc-icon r-${FISH_RARITY[fishType] ?? 'N'}`);
  box.style.width = box.style.height = `${size}px`;
  const img = el('div', 'ugc-icon-img');
  const frame = getFishDefine(fishType)?.reward.image;
  if (frame && ui.applyFrame(img, frame, size / 150)) box.append(img);
  else box.append(el('span', 'ugc-icon-text', fishName(fishType).slice(0, 1)));
  if (isBossCard(fishType)) box.append(el('span', 'ugc-icon-boss', 'BOSS'));
  box.title = fishName(fishType);
  return box;
}

/** Same source art as the summon / collection cards, including atlas crop coordinates. */
function thumbnail(kind: 'scene'|'deco', id: string|number): HTMLDivElement {
  const art=cardArtwork({kind,id});
  const frame=el('div','ugc-art-thumbnail'),img=el('img');
  img.src=`${import.meta.env.BASE_URL}res/gacha/${art.file}`;
  img.alt='';img.decoding='async';img.draggable=false;
  Object.assign(img.style,{width:`${art.columns*100}%`,height:`${art.rows*100}%`,left:`${-(art.index%art.columns)*100}%`,top:`${-Math.floor(art.index/art.columns)*100}%`});
  frame.append(img);return frame;
}

/** 場景色塊（寬高由 CSS 的 .ugc-scene 決定，或另外指定 class） */
export function sceneChip(sceneType: number, className = ''): HTMLDivElement {
  const chip = el('div', `ugc-scene ${className}`.trim(), thumbnail('scene',sceneType), el('span', 'ugc-scene-caption', sceneName(sceneType)));
  const rarity = SCENE_RARITY[sceneType];
  if (rarity) chip.dataset.rarity = rarity;
  return chip;
}

/** 裝潢卡圖與實際占地標記。 */
export function decoIcon(def: DecoDefine, size: number): HTMLDivElement {
  const box = el('div', `ugc-deco-icon r-${def.rarity}`);
  box.style.width = `${size}px`;box.style.height = `${size*1.5}px`;
  box.append(thumbnail('deco',def.id), el('span', 'ugc-deco-size', `${def.w*def.d} 格 · ${def.w}×${def.d}`));
  box.title = `${def.name}｜${def.w}×${def.d} 格${def.description ? `\n${def.description}` : ''}`;
  return box;
}

export const decoName = (id: string): string => getDecoDefine(id)?.name ?? id;
