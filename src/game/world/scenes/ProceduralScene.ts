/**
 * 程序化場景（SPEC §18）：SceneDefine.procedural 指到這裡註冊的建構函式，BGScene 不載 c3b 而改呼叫它。
 */
import type * as THREE from 'three';
import type { ProcMaterial } from './ProcMaterial';

export interface ProceduralSceneContext {
  /** 烘焙貼圖用 */
  renderer: THREE.WebGLRenderer;
}

export interface ProceduralScene {
  /** 場景根節點（世界座標，Z 朝上；不需要再旋轉） */
  readonly root: THREE.Group;
  /** 所有材質（Iris 轉場、每幀 uTime 由 BGScene 統一處理） */
  readonly materials: ProcMaterial[];
  /** 每幀（只有場景可見時）：time = 場景 shader 時間（秒） */
  update?(time: number, dt: number): void;
}

export type ProceduralSceneBuilder = (ctx: ProceduralSceneContext) => ProceduralScene | Promise<ProceduralScene>;

const builders = new Map<string, ProceduralSceneBuilder>();

export function registerProceduralScene(key: string, builder: ProceduralSceneBuilder): void {
  builders.set(key, builder);
}

export function getProceduralSceneBuilder(key: string): ProceduralSceneBuilder | undefined {
  return builders.get(key);
}

/** 第二種相機（監獄 / 墓地視角）的位置與視線：場景依這台相機構圖（CameraDefine CAMERA_PRESETS[Zombie]） */
export const SCENE_CAMERA = {
  x: 5.251,
  y: -192.289,
  z: 61.57,
  /** 俯角（度）：視線在水平面下方幾度 */
  pitchDown: 8.75,
  fov: 32,
} as const;

/** 以場景相機為原點、方位角（度，+Y 為 0、往 +X 為正）與仰角（度）→ 單位方向 */
export function skyDirection(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}
