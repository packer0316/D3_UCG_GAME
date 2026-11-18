/** Art-direction atlases. Coordinates are independent of server rarity and probability. */
import type { GachaItem } from '@game/ugc/GachaDefine';
import { GARDEN_DECO_DEFINES } from '@game/ugc/DecoDefine';

export interface CardArtwork {
  file: string;
  columns: number;
  rows: number;
  index: number;
}

const sheet = (file: string, columns: number, rows: number, index: number): CardArtwork => ({ file: `illustrations/${file}.webp`, columns, rows, index });
const sceneOrder = [0, 1, 2, 4, 6, 15];
const decoOrder = ['cube_white', 'cube_red', 'cube_blue', 'bar_yellow', 'block_green', 'tower_purple', 'plate_gold'];
const epicOrder = [15, 16, 17, 22];
const sanctuaryArt: Record<number, string> = { 20: 'moon', 21: 'rose-castle', 22: 'tide-palace', 23: 'maple-shrine' };
const gardenArt = new Set(GARDEN_DECO_DEFINES.map(d => d.id));

export function cardArtwork(item: Pick<GachaItem, 'kind' | 'id'>): CardArtwork {
  const id = Number(item.id);
  if (item.kind === 'fish') {
    if (id >= 1 && id <= 6) return sheet('common-a-atlas', 3, 2, id - 1);
    if (id >= 7 && id <= 11) return sheet('common-b-atlas', 3, 2, id - 7);
    if (id >= 12 && id <= 14) return sheet('rare-atlas', 3, 1, id - 12);
    if (epicOrder.includes(id)) return sheet('epic-atlas', 2, 2, epicOrder.indexOf(id));
    if (id >= 23 && id <= 26) return sheet('legendary-atlas', 2, 2, id - 23);
    if (id === 27) return sheet('azure-dragon', 1, 1, 0);
  }
  if (item.kind === 'scene' && sceneOrder.includes(id)) return sheet('scene-atlas', 3, 2, sceneOrder.indexOf(id));
  if (item.kind === 'deco' && decoOrder.includes(String(item.id))) return sheet('deco-atlas', 4, 2, decoOrder.indexOf(String(item.id)));
  if (item.kind === 'scene' && sanctuaryArt[id]) return sheet(`scene-${sanctuaryArt[id]}`, 1, 1, 0);
  if (item.kind === 'deco' && gardenArt.has(String(item.id))) return sheet(`deco-${item.id}`, 1, 1, 0);
  return { file: `portraits/${item.kind}-${item.id}.webp`, columns: 1, rows: 1, index: 0 };
}
