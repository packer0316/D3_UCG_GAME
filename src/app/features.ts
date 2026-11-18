/**
 * 功能開關清單（唯一的地方）。之後的抽卡：import { GachaFeature } ... 加進陣列即可。
 */
import type { GameFeature } from '@core/feature/Feature';
import type { GameContext } from '@game/GameContext';
import { DebugFeature } from '@features/debug/DebugFeature';
import { UgcFeature } from '@features/ugc/UgcFeature';

export function createFeatures(): GameFeature<GameContext>[] {
  // UGC 家園（房間 / 魚卡 / 抽卡 / 家園 / 裝潢；docs/SPEC-UGC.md）
  const list: GameFeature<GameContext>[] = [new UgcFeature()];
  // Debug 面板：開發模式、網址帶 ?debug，或建置時 VITE_DEBUG=1（Artifact 發佈版，網址無法加參數）
  const debug = import.meta.env.DEV || import.meta.env.VITE_DEBUG === '1' || new URLSearchParams(location.search).has('debug');
  if (debug) list.push(new DebugFeature());
  return list;
}
