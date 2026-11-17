/**
 * 子彈設定 — 翻譯自原版 Define/BulletDefine.lua（SpecialBulletType / SpecialBulletDefine / BulletData）、
 * DT3_Define.lua、CashSystem.lua
 */
import type { EfkSetting } from '@engine/effekseer/EfkSystem';

/** 原版 fishG.SpecialBulletType（同時是 U2G_SHOOT_REQ.bulletType） */
export const SpecialBulletType = {
  None: 0, // 一般子彈
  Lock: 1, // 鎖定
  Focus: 2, // 集中高倍炮（榴彈砲）
  Spread: 3, // 脈衝炮（雷擊）
  Advanced: 4, // 進化脈衝炮（紫雷擊）
  LaserLock: 5, // 鎖定雷射（巡光炮）
} as const;
export type SpecialBulletTypeId = (typeof SpecialBulletType)[keyof typeof SpecialBulletType];

export type CannonSkinId = 'Normal' | 'Grenade' | 'Plasma' | 'PlasmaPurple' | 'Laser';

export interface SpecialBulletDefine {
  costRate: number;
  isLockFish: boolean;
  bulletId: number;
  shootCD: number;
  cannonSkin: CannonSkinId;
  /** 低於此賠率的魚不能被選為目標 */
  limitOdds?: number;
  sound: string;
}

/** SpecialBulletDefine（BulletDefine.lua:50-114） */
export const SPECIAL_BULLETS: Record<SpecialBulletTypeId, SpecialBulletDefine> = {
  [SpecialBulletType.None]: { costRate: 1, isLockFish: false, bulletId: 1, shootCD: 0.12, cannonSkin: 'Normal', sound: 'sound/MG_3' },
  [SpecialBulletType.Lock]: { costRate: 1, isLockFish: true, bulletId: 2, shootCD: 0.1, cannonSkin: 'Normal', sound: 'sound/MG_3' },
  [SpecialBulletType.Focus]: { costRate: 5, isLockFish: true, bulletId: 3, shootCD: 0.25, cannonSkin: 'Grenade', limitOdds: 6, sound: 'sound/MG_4' },
  [SpecialBulletType.Spread]: { costRate: 15, isLockFish: true, bulletId: 4, shootCD: 0.4, cannonSkin: 'Plasma', sound: 'sound/MG_5' },
  [SpecialBulletType.Advanced]: { costRate: 20, isLockFish: true, bulletId: 5, shootCD: 0.4, cannonSkin: 'PlasmaPurple', sound: 'sound/MG_5' },
  [SpecialBulletType.LaserLock]: { costRate: 30, isLockFish: true, bulletId: 6, shootCD: 0.4, cannonSkin: 'Laser', limitOdds: 16, sound: 'sound/MG_6' },
};

export type BulletKind = 'normal' | 'track' | 'lightning' | 'laser';

export interface BulletHitFxDefine {
  /** csd 路徑（.csd，實際載入 .csd.json） */
  csd: string;
  /** 原版在 3D 中的 SpriteScale（世界單位 / csd 像素） */
  scale: number;
}

/**
 * BulletData（BulletDefine.lua:136-311）
 * 一般子彈節點結構（BulletSprite_Efk.lua）：node（scale = nodeScale）→ sprite（z = groundDist、rot spriteRot）→ EFK
 */
export interface BulletDefine {
  id: number;
  kind: BulletKind;
  efk?: EfkSetting;
  /** csd 子彈（雷擊 / 雷射） */
  csd?: string;
  nodeScale: number;
  groundDist: number;
  spriteRot: { x: number; y: number; z: number };
  /** 世界單位 / 秒（雷射為 px / 秒） */
  speed: number;
  /** 碰撞盒邊長（乘 nodeScale 前） */
  colliderSize: number;
  maxBounceTimes: number;
  hitFx?: BulletHitFxDefine;
  /** 雷擊：擴散範圍 */
  range?: number;
  /** 雷擊：延遲比例時間 */
  duration?: number;
}

export const BULLET_DATA: Record<number, BulletDefine> = {
  1: {
    id: 1,
    kind: 'normal',
    efk: { file: 'Effekseer/Fireball.efk', duration: -1, maxConcurrent: 64 },
    nodeScale: 0.5,
    groundDist: 2,
    spriteRot: { x: 90, y: 0, z: 0 },
    speed: 170,
    colliderSize: 10 * 0.5,
    maxBounceTimes: 3,
    hitFx: { csd: 'DinosaurExport/DT_resource/Fire_Normal_Hit.csd', scale: 0.1 },
  },
  2: {
    id: 2,
    kind: 'track',
    efk: { file: 'Effekseer/Fireball.efk', duration: -1, maxConcurrent: 64 },
    nodeScale: 0.5,
    groundDist: 2,
    spriteRot: { x: 90, y: 0, z: 0 },
    speed: 150,
    colliderSize: 1,
    maxBounceTimes: 99999,
    hitFx: { csd: 'DinosaurExport/DT_resource/Fire_Normal_Hit.csd', scale: 0.2 },
  },
  3: {
    id: 3,
    kind: 'track',
    efk: { file: 'Effekseer_dt3/Bullet/Weapon_Big_Bomb.efk', rotation: { x: 45, y: 0, z: 0 }, duration: -1, maxConcurrent: 32 },
    nodeScale: 1,
    groundDist: 2,
    spriteRot: { x: 90, y: 0, z: 0 },
    speed: 200,
    colliderSize: 1,
    maxBounceTimes: 99999,
    hitFx: { csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_B_Hit.csd', scale: 0.12 },
  },
  4: {
    id: 4,
    kind: 'lightning',
    csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_C_Bullet.csd',
    nodeScale: 0.5 * 0.5, // 原版 CSD 子彈 sprite 與 node 各乘一次
    groundDist: 0,
    spriteRot: { x: 0, y: 0, z: 0 },
    speed: 500,
    colliderSize: 70,
    maxBounceTimes: 99999,
    hitFx: { csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_C_Hit.csd', scale: 0.1 },
    range: 60,
    duration: 0.3,
  },
  5: {
    id: 5,
    kind: 'lightning',
    csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_C_Bullet_purple.csd',
    nodeScale: 0.5 * 0.5,
    groundDist: 0,
    spriteRot: { x: 0, y: 0, z: 0 },
    speed: 500,
    colliderSize: 70,
    maxBounceTimes: 99999,
    hitFx: { csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_C_Hit_purple.csd', scale: 0.1 },
    range: 60,
    duration: 0.3,
  },
  6: {
    id: 6,
    kind: 'laser',
    csd: 'DinosaurExport/Bullet_dt3/dt3_cannon_E_laser.csd',
    nodeScale: 0.85,
    groundDist: 0,
    spriteRot: { x: 0, y: 0, z: 0 },
    speed: 1000,
    colliderSize: 70,
    maxBounceTimes: 99999,
  },
};

/** 舊名相容：一般子彈 */
export const BULLET_NORMAL = BULLET_DATA[1];

/** 雷射光束（LockShootEffectData[1]） */
export const LASER_BEAM = { length: 250, loopTimes: 3, idleTimeout: 0.5 };

/** 追蹤彈拋物線（BulletPathMove3dTrack） */
export const TRACK_ARC = { heightRate: 50, riseTimeRate: 0.5, minTime: 0.1 };

/** 雷擊：額外命中數 random(2, 5)，總數 = +1 */
export const LIGHTNING_EXTRA_HITS: [number, number] = [2, 5];

/** 子彈最長存活（DT3_Define BlankTime） */
export const BULLET_BLANK_TIME = 35;
/** 每秒檢查牆外子彈 */
export const BULLET_OUTSIDE_CHECK_INTERVAL = 1;
/** 存活不到此秒數不會因反彈次數消失 */
export const BULLET_MIN_LIFE_BEFORE_BLANK = 0.5;
/** 同時存在上限（原版有定義但沒生效） */
export const BULLET_MAX_COUNT = 30;
