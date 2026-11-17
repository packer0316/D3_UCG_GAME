/**
 * 遊戲共用 context：所有 System / Feature 透過它取得引擎服務、事件、registry。
 */
import type * as THREE from 'three';
import type { EventBus } from '@core/events/EventBus';
import type { ServiceRegistry } from '@core/services/ServiceRegistry';
import type { ActionManager } from '@core/tween/ActionManager';
import type { Stage } from '@engine/stage/Stage';
import type { AssetManager } from '@engine/assets/AssetManager';
import type { EfkSystem } from '@engine/effekseer/EfkSystem';
import type { AudioManager } from '@engine/audio/AudioManager';
import type { NetClient } from '@net/NetClient';
import type { KillFloatOddsNotify, SeatData } from '@net/protocol';
import type { PathLibrary } from './path/PathTrack';
import type { FishDataFile, GroupDataMap } from './path/PathTypes';
import type { FishClassRegistry } from './world/FishClassRegistry';
import type { KillShowRegistry } from './show/KillShowRegistry';
import type { Fish } from './world/Fish';
import type { UIRoot } from '@ui/UIRoot';
import type { CsdLibrary } from '@engine/csd/CsdPlayer';
import type { PointerRouter } from '@engine/input/PointerRouter';
import type { SpecialBulletTypeId } from './define/BulletDefine';
import type { SkillButtonId } from './define/SkillDefine';
import type { BulletBehaviorRegistry } from './bullet/BulletTypes';

export interface GameEvents {
  'room:ready': { yourSeat: number; roomName: string; betList: number[] };
  'seat:update': { seat: number; data: SeatData | null };
  /** 顯示用餘額（含本地預扣） */
  'seat:money': { seat: number; money: number };
  'seat:bet': { seat: number; bet: number };
  'fish:spawn': { fish: Fish };
  'fish:remove': { serial: number };
  'fish:hit': { fish: Fish };
  'fish:kill': { notify: KillFloatOddsNotify; fish: Fish | null };
  'shoot:fire': { seat: number; bulletId: number };
  'shoot:auto': { enabled: boolean };
  'shoot:reject': { reason: string };
  'camera:shake': { times: number; delta: number };
  /** 金幣抵達座位（第一枚），用來跳「+N」 */
  'reward:coinArrive': { seat: number; money: number };
  /** 技能按鈕狀態改變 */
  'skill:change': { bulletType: SpecialBulletTypeId; auto: boolean; active: SkillButtonId[] };
  /** 鎖定目標改變 */
  'lock:change': { fish: Fish | null };
}

export interface GameLayers {
  /** 3D：場景 */
  bg: THREE.Group;
  /** 3D：魚 */
  fish: THREE.Group;
  /** 3D：子彈 */
  bullet: THREE.Group;
  /** 3D：砲台 */
  cannon: THREE.Group;
  /** 2D overlay：獎勵（跳字、金幣、獎圈） */
  reward: THREE.Group;
  /** 2D overlay：命中特效、準心、雷擊 / 雷射 */
  hitFx: THREE.Group;
  /** 2D overlay：最上層 UI（技能按鈕） */
  ui: THREE.Group;
}

export interface GameData {
  paths: PathLibrary;
  groups: GroupDataMap;
  fishData: FishDataFile;
}

export interface GameRegistries {
  fishClass: FishClassRegistry;
  killShow: KillShowRegistry;
  bullet: BulletBehaviorRegistry;
}

export interface GameContext {
  readonly events: EventBus<GameEvents>;
  readonly services: ServiceRegistry;
  readonly actions: ActionManager;
  readonly stage: Stage;
  readonly assets: AssetManager;
  readonly csd: CsdLibrary;
  readonly input: PointerRouter;
  readonly efk: EfkSystem;
  readonly audio: AudioManager;
  readonly net: NetClient;
  readonly layers: GameLayers;
  readonly data: GameData;
  readonly registries: GameRegistries;
  readonly ui: UIRoot;
}
