/** 服務 token：Feature 透過 ctx.services.get(Tokens.X) 取得系統 */
import { createToken } from '@core/services/ServiceRegistry';
import type { FishSystem } from './systems/FishSystem';
import type { ShootingSystem } from './systems/ShootingSystem';
import type { SeatSystem } from './systems/SeatSystem';
import type { RewardSystem } from './systems/RewardSystem';
import type { CameraShake } from './world/CameraShake';
import type { SkillSystem } from './systems/SkillSystem';
import type { LockSystem } from './systems/LockSystem';
import type { AIAutoSystem } from './systems/AIAutoSystem';
import type { SceneSystem } from './systems/SceneSystem';
import type { PlayField } from './world/PlayField';

export const Tokens = {
  AIAutoSystem: createToken<AIAutoSystem>('AIAutoSystem'),
  SkillSystem: createToken<SkillSystem>('SkillSystem'),
  LockSystem: createToken<LockSystem>('LockSystem'),
  FishSystem: createToken<FishSystem>('FishSystem'),
  ShootingSystem: createToken<ShootingSystem>('ShootingSystem'),
  SeatSystem: createToken<SeatSystem>('SeatSystem'),
  RewardSystem: createToken<RewardSystem>('RewardSystem'),
  CameraShake: createToken<CameraShake>('CameraShake'),
  SceneSystem: createToken<SceneSystem>('SceneSystem'),
  /** 場內範圍（子彈牆 / 自動選目標範圍），跟相機設定走 */
  PlayField: createToken<PlayField>('PlayField'),
  /** 假 server（只有本地開發時存在，debug 面板用） */
  FakeServer: createToken<unknown>('FakeServer'),
};
