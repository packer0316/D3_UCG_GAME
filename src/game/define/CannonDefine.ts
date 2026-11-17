/**
 * 砲台設定 — 翻譯自原版 Define/CannonDefine.lua（CannonSkinDefine：A / B / C / C+D / E）
 * 與 Cannon/CannonView.lua、CannonSkinNormal.lua 的常數。
 */
import type { EfkSetting } from '@engine/effekseer/EfkSystem';
import type { CannonSkinId } from './BulletDefine';
import type { AnimRange } from './FishDefine';

export interface CannonEfk {
  efk: EfkSetting;
  bone: string;
  /** 原版 Condition(fireCount, fireFactor) */
  condition?: (fireCount: number, fireFactor: number) => boolean;
}

export interface CannonAttachedObject {
  model: string;
  bone: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  idle: AnimRange;
}

export interface CannonSkinDefine {
  id: CannonSkinId;
  model: string;
  /** 換貼圖（ReplaceTexture） */
  texture?: string;
  spriteRot: { x: number; y: number; z: number };
  gunPointBone: string;
  shaderImg: { normalMap: string; matCap: string; fireTexture: string };
  /** 過熱上限 */
  overHopUpperBound: number;
  animations: Record<'Idle' | 'Atk' | 'LockedAtk', AnimRange>;
  atkEfk: CannonEfk[];
  coolDownEfk: CannonEfk;
  coolDownTime: number;
  attached?: CannonAttachedObject[];
}

const SKIN = 'Models/Character/MountSkin/';
const SHADER = SKIN + 'shader/';
const GUN = 'GunFire';
const at = (y = 2) => ({ x: 0, y, z: 0 });

const smokeEnd: CannonEfk = {
  efk: { file: 'Effekseer_dt3/Cannon/gunfire_smokeEnd.efk', position: at(), scale: 1.5, duration: 2.0 },
  bone: GUN,
};

export const CANNON_SKINS: Record<CannonSkinId, CannonSkinDefine> = {
  Normal: {
    id: 'Normal',
    model: SKIN + 'dt3_cannon_A.c3b',
    spriteRot: { x: 90, y: 0, z: 0 },
    gunPointBone: GUN,
    shaderImg: { normalMap: SHADER + 'dt3_cannon_A_Normal.jpg', matCap: SHADER + 'Matcap_Street9_A.jpg', fireTexture: SHADER + 'fire_A.png' },
    overHopUpperBound: 1.0,
    animations: { Idle: { start: 0, end: 15 }, Atk: { start: 15, end: 19 }, LockedAtk: { start: 30, end: 34 } },
    atkEfk: [
      { efk: { file: 'Effekseer_dt3/Cannon/gunfire_A.efk', position: at(), scale: 0.5, duration: 0.6 }, bone: GUN },
      {
        efk: { file: 'Effekseer_dt3/Cannon/gunfire_sparkSmoke.efk', position: at(), scale: 0.75, duration: 1.0 },
        bone: GUN,
        condition: (c, f) => c !== 0 && c % 5 === 0 && f > 0.8,
      },
    ],
    coolDownEfk: smokeEnd,
    coolDownTime: 0.32,
  },
  Grenade: {
    id: 'Grenade',
    model: SKIN + 'dt3_cannon_B.c3b',
    spriteRot: { x: 90, y: 0, z: 0 },
    gunPointBone: GUN,
    shaderImg: { normalMap: SHADER + 'dt3_cannon_B_Normal.jpg', matCap: SHADER + 'Matcap_Street9_B.jpg', fireTexture: SHADER + 'fire_B.png' },
    overHopUpperBound: 1.0,
    animations: { Idle: { start: 0, end: 15 }, Atk: { start: 15, end: 25 }, LockedAtk: { start: 28, end: 38 } },
    atkEfk: [
      { efk: { file: 'Effekseer_dt3/Cannon/gunfire_B.efk', position: at(), scale: 1, duration: 0.6 }, bone: GUN },
      {
        efk: { file: 'Effekseer_dt3/Cannon/gunfire_sparkSmoke_B.efk', position: at(), scale: 0.8, duration: 1.0 },
        bone: GUN,
        condition: (c, f) => c !== 0 && c % 3 === 0 && f > 0.7,
      },
    ],
    coolDownEfk: { efk: { file: 'Effekseer_dt3/Cannon/gunfire_smokeEnd_B.efk', position: at(), scale: 2.0, duration: 2.0 }, bone: GUN },
    coolDownTime: 0.5,
  },
  Plasma: {
    id: 'Plasma',
    model: SKIN + 'dt3_cannon_C.c3b',
    texture: SKIN + 'dt3_cannon_C.jpg',
    spriteRot: { x: 90, y: 0, z: 0 },
    gunPointBone: GUN,
    shaderImg: { normalMap: SHADER + 'dt3_cannon_C_Normal.jpg', matCap: SHADER + 'Matcap_Street9_C.jpg', fireTexture: SHADER + 'fire_C.png' },
    overHopUpperBound: 0.75,
    animations: { Idle: { start: 0, end: 15 }, Atk: { start: 15, end: 25 }, LockedAtk: { start: 15, end: 25 } },
    atkEfk: [{ efk: { file: 'Effekseer_dt3/Cannon/gunfire_C.efk', position: at(), scale: 1.5, duration: 0.6 }, bone: GUN }],
    coolDownEfk: smokeEnd,
    coolDownTime: 0.7,
  },
  PlasmaPurple: {
    id: 'PlasmaPurple',
    model: SKIN + 'dt3_cannon_C.c3b',
    texture: SKIN + 'dt3_cannon_D.jpg',
    spriteRot: { x: 90, y: 0, z: 0 },
    gunPointBone: GUN,
    shaderImg: { normalMap: SHADER + 'dt3_cannon_C_Normal.jpg', matCap: SHADER + 'Matcap_Street9_C.jpg', fireTexture: SHADER + 'fire_C.png' },
    overHopUpperBound: 0.6,
    animations: { Idle: { start: 0, end: 15 }, Atk: { start: 15, end: 25 }, LockedAtk: { start: 15, end: 25 } },
    atkEfk: [{ efk: { file: 'Effekseer_dt3/Cannon/gunfire_C_purple.efk', position: at(), scale: 1.5, duration: 0.6 }, bone: GUN }],
    coolDownEfk: smokeEnd,
    coolDownTime: 0.7,
  },
  Laser: {
    id: 'Laser',
    model: SKIN + 'dt3_cannon_E.c3b',
    texture: SKIN + 'dt3_cannon_E.jpg',
    spriteRot: { x: 90, y: 0, z: 0 },
    gunPointBone: GUN,
    shaderImg: { normalMap: SHADER + 'dt3_cannon_E_Normal.jpg', matCap: SHADER + 'Matcap_Street9_E.jpg', fireTexture: SHADER + 'fire_E.png' },
    overHopUpperBound: 0.6,
    animations: { Idle: { start: 0, end: 15 }, Atk: { start: 15, end: 25 }, LockedAtk: { start: 28, end: 38 } },
    // Duration -1：射擊期間持續（雷射光束結束時停止）
    atkEfk: [{ efk: { file: 'Effekseer_dt3/Cannon/gunfire_E.efk', position: at(), scale: 1.5, duration: -1 }, bone: GUN }],
    coolDownEfk: smokeEnd,
    coolDownTime: 0.7,
    attached: [
      {
        model: SKIN + 'dt3_cannon_ES.c3b',
        bone: 'dt3_cannon_ES_R',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -90, y: 180, z: -90 },
        scale: 2,
        idle: { start: 0, end: 15 },
      },
      {
        model: SKIN + 'dt3_cannon_ES.c3b',
        bone: 'dt3_cannon_ES_L',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -90, y: 180, z: -90 },
        scale: 2,
        idle: { start: 0, end: 15 },
      },
    ],
  },
};

/** 舊名相容 */
export const CANNON_SKIN_NORMAL = CANNON_SKINS.Normal;

/** CannonView.lua：瞄準角度限制（度） */
export const CANNON_LIMIT_ANGLE = 90;
/** CannonSkinNormal：每發 fireFactor 增量、停火後延遲、衰減速度 */
export const CANNON_FIRE_FACTOR_STEP = 0.05;
export const CANNON_FIRE_DECAY_DELAY = 0.15;
export const CANNON_FIRE_DECAY_PER_SEC = 1.0;
/** 冷卻煙只在 fireFactor 大於此值時播放 */
export const CANNON_COOLDOWN_EFK_MIN_FACTOR = 0.4;

/** 座位：Main.csd SeatInfo_1..3（設計座標，x 相對畫面中央） */
export const SEAT_COUNT = 3;
export const SEAT_ANCHORS = [
  { dx: -320, y: 44.9 },
  { dx: 0, y: 44.9 },
  { dx: 320, y: 44.9 },
] as const;
