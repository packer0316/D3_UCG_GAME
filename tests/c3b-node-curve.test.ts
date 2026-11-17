import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseC3b } from '../src/engine/loaders/C3bParser';
import { C3B_ADDITIONAL_NODE, createC3bTemplate, instantiateC3b, sliceC3bClip } from '../src/engine/loaders/C3bLoader';
import { setCocosRotation } from '../src/core/math/cocos';

const load = (file: string) => createC3bTemplate(parseC3b(readFileSync(`public/res/${file}`)), file);

/** 播 Run 一小段後，以世界座標（Z-up）量蒙皮頂點範圍 */
function posedBounds(file: string, spriteRot: { x: number; y: number; z: number }, frames: number) {
  const tpl = load(file);
  const sprite = instantiateC3b(tpl);
  setCocosRotation(sprite, spriteRot);
  const mixer = new THREE.AnimationMixer(sprite);
  mixer.clipAction(sliceC3bClip(tpl, 'Run', 0, frames)!).play();
  mixer.update(0.1);
  sprite.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  sprite.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.geometry.index!;
    for (let i = 0; i < index.count; i++) {
      mesh.getVertexPosition(index.getX(i), v);
      box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
    }
  });
  return { sprite, box, size: box.getSize(new THREE.Vector3()) };
}

describe('c3b node curve（Animate3D setAdditionalTransform）', () => {
  it('劍齒虎：Sprite3D 本身的 curve 變成附加變換層，spriteRot(180,0,180) 等效於預設 (90,0,180)', () => {
    const { sprite } = posedBounds('Models/Dinosaur/A_Tiger_01.c3b', { x: 180, y: 0, z: 180 }, 20);
    const layer = sprite.getObjectByName(C3B_ADDITIONAL_NODE)!;
    expect(layer.parent).toBe(sprite);
    const effective = sprite.quaternion.clone().multiply(layer.quaternion);
    const expected = new THREE.Object3D();
    setCocosRotation(expected, { x: 90, y: 0, z: 180 });
    expect(Math.abs(effective.dot(expected.quaternion))).toBeCloseTo(1, 5);
  });

  it('劍齒虎站在地上（不是頭插進地底）：身長在地面方向、腳底在 z≈0', () => {
    for (const file of ['Models/Dinosaur/A_Tiger_01.c3b', 'Models/Dinosaur/A_Tiger_06.c3b']) {
      const { box, size } = posedBounds(file, { x: 180, y: 0, z: 180 }, 20);
      expect(size.y).toBeGreaterThan(size.z);
      expect(box.min.z).toBeGreaterThan(-1);
      expect(box.max.z).toBeGreaterThan(1);
    }
  });

  it('其他節點：key = 節點原本變換 · 動畫值（D_Dragon_01 Dummy001）', () => {
    const tpl = load('Models/Dinosaur/D_Dragon_01.c3b');
    const dummy = tpl.root.getObjectByName('Dummy001')!;
    const track = tpl.clip!.tracks.find((t) => t.name === 'Dummy001.quaternion')!;
    const key = tpl.data.animations[0].bones.find((b) => b.bone === 'Dummy001')!.keys[0];
    const expected = dummy.quaternion.clone().multiply(new THREE.Quaternion().fromArray(key.rotation!));
    const got = new THREE.Quaternion().fromArray(Array.from(track.values.slice(0, 4)));
    expect(Math.abs(got.dot(expected))).toBeCloseTo(1, 5);
    expect(tpl.root.getObjectByName(C3B_ADDITIONAL_NODE)).toBeUndefined();
  });

  it('找不到目標的 curve 會被忽略（Boss_Mark_01 MediumPlane 不是單一節點）', () => {
    const tpl = load('Models/Object/Boss_Mark_01.c3b');
    expect(tpl.clip!.tracks.some((t) => t.name.startsWith('MediumPlane.'))).toBe(false);
    expect(tpl.root.getObjectByName(C3B_ADDITIONAL_NODE)).toBeUndefined();
  });

  it('一般模型不受影響（T_Dragon_01 沒有附加變換層、所有 track 都是骨骼）', () => {
    const tpl = load('Models/Dinosaur/T_Dragon_01.c3b');
    expect(tpl.root.getObjectByName(C3B_ADDITIONAL_NODE)).toBeUndefined();
    expect(tpl.clip!.tracks.length).toBeGreaterThan(0);
  });
});
