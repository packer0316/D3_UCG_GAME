/**
 * 功能開關清單（唯一的地方）。之後的抽卡：import { GachaFeature } ... 加進陣列即可。
 */
import type { GameFeature } from '@core/feature/Feature';
import type { GameContext } from '@game/GameContext';
import { DebugFeature } from '@features/debug/DebugFeature';

export function createFeatures(): GameFeature<GameContext>[] {
  const list: GameFeature<GameContext>[] = [];
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) list.push(new DebugFeature());
  return list;
}
