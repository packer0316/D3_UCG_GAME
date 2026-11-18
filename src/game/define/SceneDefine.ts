/**
 * 場景設定 — 翻譯自原版 Define/SceneDefine.lua + SoundSceneDefine.lua（SPEC §15）
 * 目前移植：地面 森林 / 沙漠 / 雪地、空中(黃昏)；殭屍專案 監獄 / 墓地（SPEC §16）
 */
import type { Vec3 } from '@core/math/cocos';
import { CameraPresetId, type CameraPresetIdValue } from './CameraDefine';
import { FishType } from './FishDefine';

export const SceneType = {
  NONE: -1,
  Forest: 0,
  Desert: 1,
  Snow: 2,
  /** 殭屍專案 墓地（沿用殭屍專案 SceneType.Cemetery = 4；DT3 沒有用到 3–9） */
  ZB_Cemetery: 4,
  /** 殭屍專案 監獄（沿用殭屍專案 SceneType.Prison = 6） */
  ZB_Prison: 6,
  /** 空中(黃昏)：翔空蒼龍的天空場景 */
  Boss_Sky_Dusk: 15,
  /** 月球表面（程序化場景，SPEC §18；原版沒有，編號接在原版之後） */
  Space_Moon: 20,
  /** FisherFPS 古堡美術延伸，沿用監獄 / 墓地相機。 */
  Rose_Castle: 21,
  Tide_Palace: 22,
  Maple_Shrine: 23,
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

/** 影格範圍（30fps），播到 end 停住 = 靜態姿勢 */
export interface FrameRange {
  start: number;
  end: number;
}

/**
 * 殭屍專案場景 shader（ground.material technique PrisonScene / CemeteryScene，SPEC §16.2）。
 * 主圖一律用 mesh 本身的貼圖。
 */
export interface SceneShaderSetting {
  kind: 'prison' | 'cemetery';
  /** 套用的 mesh（原版 LightMeshNames）；都找不到 → 第 0 個 mesh */
  meshNames: string[];
  /** 額外貼圖：uniform 名稱 → 路徑 / wrap */
  textures: Record<string, { path: string; wrap: 'repeat' | 'clamp' }>;
  /** vec4 uniform 初始值（原版 BaseUniforms + CloseUniforms；純量寫在 x） */
  uniforms: Record<string, readonly number[]>;
}

/** 墓地紅月（GameSceneCemeteryDefine.MoonSwitchTimeline）：每次進場 Moon_Switch.x 演一輪（線性） */
export interface MoonSwitchTimeline {
  normalSwitch: number;
  redSwitch: number;
  normalDuration: number;
  toRedDuration: number;
  redDuration: number;
  toNormalDuration: number;
}

/** 場景掛件（GameScenePrisonDefine.ExtensionModel） */
export interface SceneAttachment {
  model: string;
  /** 掛點骨骼（每個各掛一份）；省略 = 場景根節點 */
  bones?: string[];
  /** Cocos setRotation3D（度）；省略 = (0, 0, 0) */
  rotation?: Vec3;
  /** setScale（覆寫 c3b 節點自帶的縮放）；省略 = 1 */
  scale?: number;
  /** 靜態姿勢 */
  pose?: FrameRange;
}

export interface SceneDefine {
  type: number;
  /** 顯示名稱（debug 用） */
  name: string;
  /** c3b 模型；程序化場景（procedural）沒有 */
  model?: string;
  /** 程序化場景（SPEC §18）：game/world/scenes 註冊的建構函式名稱；有設定就不載 model */
  procedural?: string;
  state: SceneStateId;
  /** 平面陰影顏色（天空場景沒有） */
  shadowColor?: [number, number, number];
  /** 預設 (90, 0, 0)：Y-up 模型轉 Z-up */
  rotation?: { x: number; y: number; z: number };
  /** 模型縮放（setScale：覆寫 c3b 節點帶給根節點的縮放；殭屍場景 0.1） */
  scale?: number;
  bgm: string;
  /** 相機預設（SPEC §16.4）；省略 = 第一種 */
  camera?: CameraPresetIdValue;
  /** 天空材質（有設定 = flowmap 天空，否則一般場景材質） */
  sky?: SkySceneSetting;
  /** 殭屍專案場景 shader */
  shader?: SceneShaderSetting;
  /** 墓地紅月時間軸 */
  moonSwitch?: MoonSwitchTimeline;
  /** 靜態姿勢（殭屍場景 OnSceneEnter → PlayAnim("reset")） */
  pose?: FrameRange;
  /** 掛件模型 */
  attachments?: SceneAttachment[];
}

const ZB_PRISON = 'Models/Scene_ZB/Prison/';
const ZB_CEMETERY = 'Models/Scene_ZB/Cemetery/';
const rgba = (r: number, g: number, b: number, a = 1) => [r / 255, g / 255, b / 255, a];

// BGM：原版 SoundSceneDefine 三個地面場景都是 Scene_BG_2、Boss_Sky_Dusk 是 Scene_BG_4；殭屍場景暫用 BGM_Normal
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
  // ---- 殭屍專案（TMDC_Zombie SceneModelSetting.Prison + GameScenePrisonDefine） ----
  [SceneType.ZB_Prison]: {
    type: SceneType.ZB_Prison,
    name: '監獄',
    model: `${ZB_PRISON}Prison.c3b`,
    state: SceneState.Ground,
    shadowColor: [0.12, 0.1, 0.08],
    scale: 0.1,
    bgm: 'bgm/BGM_Normal',
    camera: CameraPresetId.Zombie,
    pose: { start: 0, end: 1 },
    shader: {
      kind: 'prison',
      meshNames: ['Prison'],
      textures: {
        Depth_Tex: { path: `${ZB_PRISON}Prison_Depth.jpg`, wrap: 'repeat' },
        Mask_Tex: { path: `${ZB_PRISON}light_mask.jpg`, wrap: 'repeat' },
        Noise_Tex1: { path: `${ZB_PRISON}Noise_22.png`, wrap: 'repeat' },
      },
      uniforms: {
        // BaseUniforms
        Depth_contrast: [5, 0, 0, 0],
        Depth_Color: rgba(0, 13, 36),
        Light_R_Color: rgba(148, 0, 0),
        Light_G_Color: rgba(0, 104, 62),
        Light_B_Color: rgba(14, 78, 114),
        Noise_Tex_G_Tiling: [0.001, -0.001, 0, 0],
        Noise_Tex_B_Tiling: [-0.001, 0.001, 0, 0],
        Noise_Tex_G_flow: [0.5, 4, 0, 0],
        Noise_Tex_B_flow: [-0.5, 4, 0, 0],
        // CloseUniforms（平常：燈全關、整場亮）
        Depth_POS: [3, 0, 0, 0],
        Light_R_Intensity: [0, 0, 0, 0],
        Light_G_Intensity: [0, 0, 0, 0],
        Light_B_Intensity: [0, 0, 0, 0],
        Light_R_breathlight_Speed: [0, 0, 0, 0],
        G_B_light: [0, 0, 0, 0],
      },
    },
    attachments: [
      { model: `${ZB_PRISON}Break_wall.c3b`, pose: { start: 0, end: 1 } },
      {
        model: `${ZB_PRISON}DOOR_ALL.c3b`,
        bones: ['Door_001', 'Door_002', 'Door_003', 'Door_004', 'Door_005', 'Door_006'],
        rotation: { x: 90, y: 0, z: 0 },
        pose: { start: 30, end: 50 },
      },
      {
        model: `${ZB_PRISON}DOOR_ALL.c3b`,
        bones: ['Door_007', 'Door_008', 'Door_009', 'Door_010', 'Door_011', 'Door_012'],
        rotation: { x: 90, y: 0, z: 0 },
        pose: { start: 80, end: 100 },
      },
    ],
  },
  // ---- 殭屍專案（SceneModelSetting.Cemetery + GameSceneCemeteryDefine） ----
  [SceneType.ZB_Cemetery]: {
    type: SceneType.ZB_Cemetery,
    name: '墓地',
    model: `${ZB_CEMETERY}Cemetery.c3b`,
    state: SceneState.Ground,
    shadowColor: [0.08, 0.05, 0.11],
    scale: 0.1,
    bgm: 'bgm/BGM_Normal',
    camera: CameraPresetId.Zombie,
    pose: { start: 0, end: 1 },
    shader: {
      kind: 'cemetery',
      meshNames: ['Cemetery', 'Cemetery_floor'],
      textures: {
        Mask_Tex: { path: `${ZB_CEMETERY}Cemetery_mask.jpg`, wrap: 'repeat' },
        Noise_Tex: { path: 'Models/Scene_ZB/Common/sceneNoisePair.png', wrap: 'repeat' },
        Moon_Tex: { path: `${ZB_CEMETERY}redMoon.png`, wrap: 'clamp' },
      },
      uniforms: {
        Cloud_ColorB: rgba(49, 33, 81),
        Cloud_ColorA: rgba(45, 33, 65),
        Cloud_Intensity: [1.4, 0, 0, 0],
        RG_moonpos_BA_moonsize: [-0.11, 0.42, 9, 10],
        Depth_R_Intensity_G_Pos_B_noiseintensity: [0.5, 1, 1, 0],
        Noise_Tex1_RG_Tiling_BA_Flow: [1, 2.5, 0.02, -0.01],
        Noise_Tex2_RG_Tiling_BA_Flow: [1, 2, 0.03, 0.01],
        moon_mask_R_Intensity_G_Pos_: [1, 0.5, 0, 0],
        XNoise_Tex2_RG_Tiling_BA_Flow: [4, 7, 0.07, -0.05],
        XNoise_Tex1_RG_Tiling_BA_Flow: [3, 10, 0.12, 0.05],
        Floor_Color: rgba(19, 30, 16),
        Moon_R_Switch_G_Intensity: [4.6, 6, 0, 0],
        Backcloud_tex_RG_Tiling_BA_Flow: [1.5, 2, 0.01, 0],
        background_Distortion: [0, 0, 0, 0],
        Corner_color: rgba(99, 41, 130),
        Moon_Switch: [0, 0, 0, 0],
      },
    },
    moonSwitch: {
      normalSwitch: 0,
      redSwitch: 1,
      normalDuration: 0,
      toRedDuration: 40,
      redDuration: 2,
      toNormalDuration: 168,
    },
  },
};

// ---- 程序化場景（SPEC §18）：沒有模型檔，場景由 game/world/scenes 的程式產生；視角同監獄 / 墓地 ----
SCENE_DEFINES[SceneType.Space_Moon] = {
  type: SceneType.Space_Moon,
  name: '月球',
  procedural: 'moon',
  state: SceneState.Ground,
  shadowColor: [0.25, 0.28, 0.55],
  bgm: 'bgm/BGM_BossSky',
  camera: CameraPresetId.Zombie,
};

for (const [type, name, procedural, shadowColor] of [
  [SceneType.Rose_Castle, '永夜薔薇城堡', 'rose-castle', [0.10, 0.10, 0.16]],
  [SceneType.Tide_Palace, '碧潮水晶殿', 'tide-palace', [0.06, 0.19, 0.23]],
  [SceneType.Maple_Shrine, '赤楓燈籠神社', 'maple-shrine', [0.19, 0.16, 0.18]],
] as const) {
  SCENE_DEFINES[type] = { type, name, procedural, state: SceneState.Ground, shadowColor: [...shadowColor], bgm: 'bgm/BGM_Normal', camera: CameraPresetId.Zombie };
}

/** 地面場景（state = Ground） */
export const GROUND_SCENES: readonly number[] = Object.values(SCENE_DEFINES)
  .filter((d) => d.state === SceneState.Ground)
  .map((d) => d.type);

/**
 * 目前支援的場景（預載、debug 下拉選單順序同原版 CommonTestContent:TestChangeSceneType，殭屍場景接在後面；
 * 原版清單另有 Boss_Sky（13），本版未移植）
 */
export const SCENE_LIST: readonly number[] = [
  SceneType.Forest,
  SceneType.Desert,
  SceneType.Snow,
  SceneType.Boss_Sky_Dusk,
  SceneType.ZB_Prison,
  SceneType.ZB_Cemetery,
  SceneType.Space_Moon,
  SceneType.Rose_Castle,
  SceneType.Tide_Palace,
  SceneType.Maple_Shrine,
];

export function isSkyScene(sceneType: number): boolean {
  return SCENE_DEFINES[sceneType]?.state === SceneState.Sky;
}

/** 墓地紅月：進場經過 t 秒時的 Moon_Switch.x（GameSceneCemeteryShaderShow EvalMoonSwitch，Smooth = false） */
export function evalMoonSwitch(m: MoonSwitchTimeline, t: number): number {
  t = Math.max(0, t);
  if (t < m.normalDuration) return m.normalSwitch;
  t -= m.normalDuration;
  if (t < m.toRedDuration) return m.normalSwitch + (m.redSwitch - m.normalSwitch) * (t / m.toRedDuration);
  t -= m.toRedDuration;
  if (t < m.redDuration) return m.redSwitch;
  t -= m.redDuration;
  if (t < m.toNormalDuration) return m.redSwitch + (m.normalSwitch - m.redSwitch) * (t / m.toNormalDuration);
  return m.normalSwitch;
}

/**
 * 場景限定魚種（fishType → 可出現的場景；沒列出的不限）。假 server 排程、debug 召喚都依此檢查（SPEC §15.4）。
 * 天空 Boss 只在空中(黃昏)；地面 Boss 只在地面場景（含殭屍專案的監獄 / 墓地；原版每隻 Boss 綁自己的 Boss 場景）。
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
 * range 是第一種相機的值；其他相機看得較遠時另訂（CameraPreset.irisRange，SPEC §16.4）
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
