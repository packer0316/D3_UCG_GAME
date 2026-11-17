/**
 * 相機預設（SPEC §16.4）：場景依 SceneDefine.camera 自動切換；debug 面板「相機」區也可手動切換。
 * 新增：在陣列後面加一筆；debug 面板調好數值後按「複製設定」可直接貼過來。
 */
import type { Vec2 } from '@core/math/cocos';
import type { CameraSetting } from '@engine/stage/Stage';
import { FIXED_3D_CAMERA } from './DisplayDefine';

export interface CameraPreset {
  name: string;
  setting: CameraSetting;
  /**
   * 子彈牆 / 自動選目標範圍（PlayField）；省略 = 原版 WALL_POLYGON。
   * 牆要配合相機：原版牆 = 畫面底邊兩角 ~ 畫面 78% 高度投到地面（設計寬 1136），砲台要在牆內。
   */
  wall?: Vec2[];
  /**
   * Iris 轉場範圍（view space 距離）；省略 = IRIS_TRANSITION.range（400，原版）。
   * 轉場以相機為中心由近到遠擴散，超過範圍的部分要等轉場結束才一次出現 → 看得較遠的相機要放大。
   */
  irisRange?: number;
  /** 不是戰鬥用的相機（例如裝潢的俯視）：不開砲，所以不需要配子彈牆 */
  nonCombat?: boolean;
}

/** CAMERA_PRESETS 的索引 */
export const CameraPresetId = {
  /** 第一種：原版遊戲相機 */
  Default: 0,
  /** 第二種：殭屍專案監獄視角（監獄 / 墓地場景使用） */
  Zombie: 1,
  /** 第三種：俯視（家園裝潢模式，SPEC-UGC §9） */
  Decor: 2,
} as const;
export type CameraPresetIdValue = (typeof CameraPresetId)[keyof typeof CameraPresetId];

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    // 原版 Fixed3DCamDef（DisplayDefine FIXED_3D_CAMERA）；舞台建立時就是這台
    name: '第一種',
    setting: FIXED_3D_CAMERA,
  },
  {
    // 殭屍專案（TMDC_Zombie）監獄場景的遊戲中視角：視野較廣、看得較遠、角度較平。
    // 該專案相機每幀跟隨場景骨骼（CameraShakeMgr:SetFollow），實際視角 = Prison.c3b「Camera001」骨骼
    // 在 reset / ingame 結束時的世界姿態（場景 Rotation (90,0,0)、Scale 0.1）；FOV / far 取 DisplayLayer Fixed3DCamDef。
    name: '第二種',
    setting: {
      fov: 32,
      near: 10,
      far: 20000,
      position: { x: 5.251, y: -192.289, z: 61.57 },
      rotation: { x: 81.25, y: 0, z: 0 },
    },
    // 與原版牆同一套畫面位置：底邊 = 畫面底邊兩角（砲台 y≈-44 在牆內），兩側沿原版牆在畫面上的側線；
    // 遠端取 y = 380（殭屍專案同一台相機的監獄邊界 ZB_PrisonBoundary 遠端），約在畫面 58% 高度、地平線（77%）之下
    wall: [
      { x: -66, y: -59 },
      { x: -259, y: 380 },
      { x: 270, y: 380 },
      { x: 76, y: -59 },
    ],
    // 監獄後牆 / 墓地遠景距相機約 730–800
    irisRange: 800,
  },
  {
    // 家園裝潢：幾乎正上方往下看（略微前傾，看得到方塊的高度），畫面中心對準棋盤格中央（世界 (0, 80)）
    name: '俯視',
    setting: {
      fov: 33,
      near: 10,
      far: 5000,
      position: { x: 0, y: 12, z: 330 },
      rotation: { x: 12, y: 0, z: 0 },
    },
    irisRange: 800,
    nonCombat: true,
  },
];
