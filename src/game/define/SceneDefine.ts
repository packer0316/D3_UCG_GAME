/**
 * 場景設定 — 翻譯自原版 Define/SceneDefine.lua + SoundSceneDefine.lua（SPEC §15）
 * 目前移植：地面 森林 / 沙漠 / 雪地、空中(黃昏)
 */
import { FishType } from './FishDefine';

export const SceneType = {
  NONE: -1,
  Forest: 0,
  Desert: 1,
  Snow: 2,
  /** 空中(黃昏)：翔空蒼龍的天空場景 */
  Boss_Sky_Dusk: 15,
} as const;

/** 原版 SceneState */
export const SceneState = {
  Ground: 0,
  Sky: 1,
} as const;
export type SceneStateId = (typeof SceneState)[keyof typeof SceneState];

/** 原版 MaterialSetting（AzureDragonScene：ground.material technique "skybox" + flowmap） */
export interface SkySceneSetting {
  flowMap: string;
  /** u_Switch 起始值（ChangeStartVal） */
  switchVal: number;
  /** 變天：開始前延遲（秒，ChangeStartDelay） */
  changeStartDelay: number;
  /** 變天：u_Switch keyframe（ChangeKeyFrames；本階段未使用） */
  changeKeyFrames: { time: number; start: number; end: number }[];
}

export interface SceneDefine {
  type: number;
  /** 顯示名稱（debug 用） */
  name: string;
  model: string;
  state: SceneStateId;
  /** 平面陰影顏色（天空場景沒有） */
  shadowColor?: [number, number, number];
  /** 預設 (90, 0, 0)：Y-up 模型轉 Z-up */
  rotation?: { x: number; y: number; z: number };
  bgm: string;
  /** 天空材質（有設定 = flowmap 天空，否則一般場景材質） */
  sky?: SkySceneSetting;
}

// BGM：原版 SoundSceneDefine 三個地面場景都是 Scene_BG_2、Boss_Sky_Dusk 是 Scene_BG_4
export const SCENE_DEFINES: Record<number, SceneDefine> = {
  [SceneType.Forest]: {
    type: SceneType.Forest,
    name: '森林',
    model: 'Models/Scene/Scene01/Scene1.c3b',
    state: SceneState.Ground,
    shadowColor: [0.164, 0.25, 0.156],
    bgm: 'bgm/BGM_Normal',
  },
  [SceneType.Desert]: {
    type: SceneType.Desert,
    name: '沙漠',
    model: 'Models/Scene/Scene02/Scene2.c3b',
    state: SceneState.Ground,
    shadowColor: [0.329, 0.219, 0.07],
    bgm: 'bgm/BGM_Normal',
  },
  [SceneType.Snow]: {
    type: SceneType.Snow,
    name: '雪地',
    model: 'Models/Scene/Scene03/Scene3.c3b',
    state: SceneState.Ground,
    shadowColor: [0.145, 0.145, 0.337],
    bgm: 'bgm/BGM_Normal',
  },
  [SceneType.Boss_Sky_Dusk]: {
    type: SceneType.Boss_Sky_Dusk,
    name: '空中(黃昏)',
    model: 'Models/Scene/Scene06/Scene_sky.c3b',
    state: SceneState.Sky,
    bgm: 'bgm/BGM_BossSky',
    sky: {
      flowMap: 'Models/Scene/Scene06/SceneB01_flow.png',
      switchVal: 3,
      changeStartDelay: 1.15,
      changeKeyFrames: [
        { time: 0.68, start: 3, end: 2 },
        { time: 0.167, start: 2, end: -2 },
      ],
    },
  },
};

export const GROUND_SCENES = [SceneType.Forest, SceneType.Desert, SceneType.Snow] as const;

/**
 * 目前支援的場景（預載、debug 下拉選單順序同原版 CommonTestContent:TestChangeSceneType；
 * 原版清單另有 Boss_Sky（13），本版未移植）
 */
export const SCENE_LIST: readonly number[] = [...GROUND_SCENES, SceneType.Boss_Sky_Dusk];

export function isSkyScene(sceneType: number): boolean {
  return SCENE_DEFINES[sceneType]?.state === SceneState.Sky;
}

/**
 * 場景限定魚種（fishType → 可出現的場景；沒列出的不限）。假 server 排程、debug 召喚都依此檢查（SPEC §15.4）。
 * 天空 Boss 只在空中(黃昏)；地面 Boss 只在地面場景（原版每隻 Boss 綁自己的 Boss 場景）。
 */
export const FISH_SCENE_LIMIT: Readonly<Partial<Record<number, readonly number[]>>> = {
  [FishType.Quetzalcoatlus]: [SceneType.Boss_Sky_Dusk],
  [FishType.AzureDragon]: [SceneType.Boss_Sky_Dusk],
  [FishType.AzureDragonWing]: [SceneType.Boss_Sky_Dusk],
  [FishType.TreeGoblin]: GROUND_SCENES,
  [FishType.TRex]: GROUND_SCENES,
  [FishType.Scorpion]: GROUND_SCENES,
};

export function isFishAllowedInScene(fishType: number, sceneType: number): boolean {
  const scenes = FISH_SCENE_LIMIT[fishType];
  return !scenes || scenes.includes(sceneType);
}

/** 群組內所有魚種都允許才可出現 */
export function isGroupAllowedInScene(fishTypes: Iterable<number>, sceneType: number): boolean {
  for (const t of fishTypes) if (!isFishAllowedInScene(t, sceneType)) return false;
  return true;
}

/** 魚種限定場景的顯示文字（debug 用）：「空中(黃昏)」/「地面」；不限回傳 null */
export function sceneLimitLabel(fishTypes: Iterable<number>, sceneType: number): string | null {
  for (const t of fishTypes) {
    const scenes = FISH_SCENE_LIMIT[t];
    if (!scenes || scenes.includes(sceneType)) continue;
    return scenes.every((s) => !isSkyScene(s)) ? '地面' : scenes.map((s) => SCENE_DEFINES[s]?.name ?? s).join(' / ');
  }
  return null;
}

/**
 * 圓形擴散轉場（IrisChangeScene.lua，地面場景預設轉場）
 * 距離以 view space 計算（shader 的 v_wpos = CC_MVMatrix × position），中心 = 相機
 */
export const IRIS_TRANSITION = {
  /** 距離中心的有效範圍 */
  range: 400,
  center: [0, 0, 0] as [number, number, number],
  /** 邊緣顏色 */
  boardAddColor: [0.6, 0.35, 0.1] as [number, number, number],
  /** 秒 */
  fadeTime: 2,
};
