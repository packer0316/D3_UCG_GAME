/**
 * 場景設定 — 翻譯自原版 Define/SceneDefine.lua（第一階段只載入 Snow）
 */
export const SceneType = {
  Forest: 0,
  Desert: 1,
  Snow: 2,
} as const;

export interface SceneDefine {
  type: number;
  model: string;
  /** 平面陰影顏色 */
  shadowColor: [number, number, number];
  /** 預設 (90, 0, 0)：Y-up 模型轉 Z-up */
  rotation?: { x: number; y: number; z: number };
  bgm: string;
}

export const SCENE_DEFINES: Record<number, SceneDefine> = {
  [SceneType.Forest]: { type: 0, model: 'Models/Scene/Scene01/Scene1.c3b', shadowColor: [0.164, 0.25, 0.156], bgm: 'bgm/BGM_Normal' },
  [SceneType.Desert]: { type: 1, model: 'Models/Scene/Scene02/Scene2.c3b', shadowColor: [0.329, 0.219, 0.07], bgm: 'bgm/BGM_Normal' },
  [SceneType.Snow]: { type: 2, model: 'Models/Scene/Scene03/Scene3.c3b', shadowColor: [0.145, 0.145, 0.337], bgm: 'bgm/BGM_Normal' },
};
