import type * as THREE from 'three';
import type { ActionManager } from '@core/tween/ActionManager';
import type { AssetManager } from '@engine/assets/AssetManager';
import type { AudioManager } from '@engine/audio/AudioManager';
import type { Stage } from '@engine/stage/Stage';
import { Sprite2D, type SpriteFrameRef } from '@engine/sprite2d/Sprite2D';

/** 2D overlay 表演共用的依賴 */
export interface OverlayDeps {
  assets: AssetManager;
  actions: ActionManager;
  audio: AudioManager;
  stage: Stage;
  layer: THREE.Group;
}

export function frameRef(assets: AssetManager, name: string): SpriteFrameRef | null {
  const r = assets.findFrame(name);
  if (!r) console.warn(`[Overlay] sprite frame not found: ${name}`);
  return r;
}

export function makeSprite(assets: AssetManager, name: string, opts: { additive?: boolean } = {}): Sprite2D | null {
  const ref = frameRef(assets, name);
  return ref ? new Sprite2D(ref, opts) : null;
}
