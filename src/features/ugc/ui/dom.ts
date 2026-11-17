/**
 * UGC 介面共用的小工具：建立 DOM、數字格式、魚 / 場景 / 裝飾物的圖示。
 */
import { getFishDefine } from '@game/define/FishDefine';
import { SCENE_DEFINES, SceneType } from '@game/define/SceneDefine';
import { FISH_RARITY, RARITY_NAME, SCENE_RARITY, isBossCard } from '@game/ugc/CardDefine';
import { getDecoDefine, type DecoDefine } from '@game/ugc/DecoDefine';
import type { Rarity } from '@game/ugc/UgcTypes';
import type { UIRoot } from '@ui/UIRoot';

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

/** 場景的代表色（沒有縮圖，用漸層色塊代替） */
const SCENE_COLORS: Record<number, [string, string]> = {
  [SceneType.Forest]: ['#5fae4e', '#1f5a2a'],
  [SceneType.Desert]: ['#e0b56a', '#8a5a1e'],
  [SceneType.Snow]: ['#9fd4f5', '#3a6fb0'],
  [SceneType.Boss_Sky_Dusk]: ['#f5a45a', '#7a3a8c'],
  [SceneType.ZB_Prison]: ['#7f8ea3', '#2c3644'],
  [SceneType.ZB_Cemetery]: ['#8a6bc0', '#2a1f48'],
};

/** 場景色塊（寬高由 CSS 的 .ugc-scene 決定，或另外指定 class） */
export function sceneChip(sceneType: number, className = ''): HTMLDivElement {
  const [a, b] = SCENE_COLORS[sceneType] ?? ['#888', '#444'];
  const chip = el('div', `ugc-scene ${className}`.trim(), el('span', '', sceneName(sceneType)));
  chip.style.background = `linear-gradient(160deg, ${a}, ${b})`;
  const rarity = SCENE_RARITY[sceneType];
  if (rarity) chip.dataset.rarity = rarity;
  return chip;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** 裝飾物圖示：佔位方塊的顏色 + 佔地格數 */
export function decoIcon(def: DecoDefine, size: number): HTMLDivElement {
  const box = el('div', `ugc-deco-icon r-${def.rarity}`);
  box.style.width = box.style.height = `${size}px`;
  const max = Math.max(def.w, def.d);
  const cube = el('div', 'ugc-deco-cube');
  cube.style.width = `${(def.w / max) * 70}%`;
  cube.style.height = `${(def.d / max) * 70}%`;
  cube.style.background = hex(def.color);
  box.append(cube, el('span', 'ugc-deco-size', `${def.w}×${def.d}`));
  box.title = def.name;
  return box;
}

export const decoName = (id: string): string => getDecoDefine(id)?.name ?? id;
