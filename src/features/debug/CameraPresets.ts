/**
 * Debug 相機預設（debug 面板「相機」區切換）。
 * 新增：在陣列後面加一筆；面板上調好數值後按「複製設定」可直接貼過來。
 */
import type { Vec2 } from '@core/math/cocos';
import type { CameraSetting } from '@engine/stage/Stage';

export interface CameraPreset {
  name: string;
  setting: CameraSetting;
  /**
   * 子彈牆 / 自動選目標範圍（PlayField）；省略 = 原版 WALL_POLYGON。
   * 牆要配合相機：原版牆 = 畫面底邊兩角 ~ 畫面 78% 高度投到地面（設計寬 1136），砲台要在牆內。
   */
  wall?: Vec2[];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    // 目前的遊戲相機（= 原版 Fixed3DCamDef，DisplayDefine FIXED_3D_CAMERA）
    name: '第一種',
    setting: {
      fov: 33,
      near: 10,
      far: 5000,
      position: { x: 0, y: -104, z: 95 },
      rotation: { x: 60, y: 0, z: 0 },
    },
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
  },
];
