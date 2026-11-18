import { PLAYER_AVATAR_ATLAS } from '@game/ugc/PlayerAvatars';
import type { RoomHostProfile } from '@game/ugc/UgcTypes';
import type { UIRoot } from '@ui/UIRoot';
import { el, fishIcon } from './dom';

/** 共用一張合圖，列表與屋主介紹使用相同格號；保留自己的原有頭像。 */
export function playerAvatar(ui: UIRoot, host: RoomHostProfile, size: number): HTMLDivElement {
  const { columns, rows, file } = PLAYER_AVATAR_ATLAS;
  const index = host.avatarIndex;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= columns * rows) {
    const fallback = fishIcon(ui, host.portrait, size);
    fallback.classList.add('directory-avatar');
    return fallback;
  }
  const frame = el('div', 'directory-avatar directory-player-avatar');
  frame.style.width = frame.style.height = `${size}px`;
  const img = el('img');
  img.src = `${import.meta.env.BASE_URL}${file}`;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  Object.assign(img.style, {
    width: `${columns * 100}%`, height: `${rows * 100}%`,
    left: `${-(index % columns) * 100}%`, top: `${-Math.floor(index / columns) * 100}%`,
  });
  img.addEventListener('error', () => {
    frame.replaceChildren(fishIcon(ui, host.portrait, size));
  }, { once: true });
  frame.append(img);
  return frame;
}
