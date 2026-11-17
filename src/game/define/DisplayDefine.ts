/**
 * 顯示相關常數（DisplayLayer.lua / PhysicsDefine.lua / Inanna Define.lua）
 */
import type { CameraSetting } from '@engine/stage/Stage';
import type { Vec2 } from '@core/math/cocos';

/** 設計解析度：高固定 640（寬依螢幕比例） */
export const DESIGN_HEIGHT = 640;

/** 原版 Fixed3DCamDef（DisplayLayer.lua:8-17） */
export const FIXED_3D_CAMERA: CameraSetting = {
  fov: 33,
  near: 10,
  far: 5000,
  position: { x: 0, y: -104, z: 95 },
  rotation: { x: 60, y: 0, z: 0 },
};

/** 子彈牆 / 場內判定多邊形（PhysicsDefine.lua:39） */
export const WALL_POLYGON: readonly Vec2[] = [
  { x: -65, y: -14 },
  { x: -123, y: 150 },
  { x: 123, y: 150 },
  { x: 65, y: -14 },
];

/** 地面可見範圍（PhysicsDefine.lua:53-59） */
export const VISIBLE_GROUND_POLYGON: readonly Vec2[] = [
  { x: -82, y: -14 },
  { x: -253, y: 292 },
  { x: 253, y: 292 },
  { x: 82, y: -14 },
];

/** 相機震動（DisplayLayer.lua:57-70） */
export const CAMERA_SHAKE_STEP = 0.05;
