/**
 * 背景場景 — 對照原版 BGSceneLayer.lua（ChangeScene）
 *   bg3d:setRotation3D(define.Rotation or (90,0,0))   Y-up 模型 → Z-up 世界
 *   ground.material technique "sceneTest"：貼圖 × u_color，alpha < 0.3 discard，強制寫深度
 */
import * as THREE from 'three';
import { setCocosRotation } from '@core/math/cocos';
import { instantiateC3b } from '@engine/loaders/C3bLoader';
import type { AssetManager } from '@engine/assets/AssetManager';
import { SCENE_DEFINES, type SceneDefine } from '../define/SceneDefine';

export class BGScene {
  root: THREE.Group | null = null;
  define: SceneDefine | null = null;

  constructor(
    private readonly assets: AssetManager,
    private readonly layer: THREE.Group,
  ) {}

  async load(sceneType: number): Promise<SceneDefine> {
    const def = SCENE_DEFINES[sceneType] ?? SCENE_DEFINES[2];
    const tpl = await this.assets.model(def.model);
    const root = instantiateC3b(tpl);
    setCocosRotation(root, def.rotation ?? { x: 90, y: 0, z: 0 });
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshBasicMaterial;
      mesh.material = new THREE.MeshBasicMaterial({ map: src.map, alphaTest: 0.3, depthWrite: true });
      mesh.renderOrder = -1;
    });
    this.root?.removeFromParent();
    this.layer.add(root);
    this.root = root;
    this.define = def;
    return def;
  }
}
