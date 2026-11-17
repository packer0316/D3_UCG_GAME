/** Offline studio. Open through Vite; run tools/render-gacha-art.mjs to bake the actual game models. */
import * as THREE from 'three';
import { AssetManager } from '../src/engine/assets/AssetManager';
import { instantiateC3b, sliceC3bClip } from '../src/engine/loaders/C3bLoader';
import { FISH_DEFINES } from '../src/game/define/FishDefine';
import { SCENE_DEFINES } from '../src/game/define/SceneDefine';
import { CARD_FISH_TYPES } from '../src/game/ugc/CardDefine';
import { DECO_DEFINES } from '../src/game/ugc/DecoDefine';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { setCocosRotation } from '../src/core/math/cocos';
import { CAMERA_PRESETS } from '../src/game/define/CameraDefine';

const assets = new AssetManager('/');
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(640, 800);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0, 0);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe3f1ff, 0x39304d, 2.3));
const key = new THREE.DirectionalLight(0xffe5b1, 3.4);
key.position.set(5, 8, 9);
scene.add(key);
const rim = new THREE.DirectionalLight(0x4da2ff, 2.5);
rim.position.set(-4, 2, -5);
scene.add(rim);

function bounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    const index = o.geometry.index;
    const count = index?.count ?? o.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      o.getVertexPosition(index ? index.getX(i) : i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}

function capture(root: THREE.Object3D, landscape = false): string {
  scene.add(root);
  const box = bounds(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  const camera = new THREE.OrthographicCamera(-1, 1, 1.25, -1.25, .01, radius * 20);
  // Three-quarter portraits preserve the original model / texture identity.
  const view = landscape ? new THREE.Vector3(.07, 1.45, 1.2) : new THREE.Vector3(1.1, .48, 1.8);
  camera.position.copy(center).addScaledVector(view.normalize(), radius * 4);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const halfW = Math.max(...corners.map(v => Math.abs(v.x)));
  const halfH = Math.max(...corners.map(v => Math.abs(v.y)));
  const scale = Math.max(halfW, halfH / 1.25) * (landscape ? 1.02 : 1.04);
  camera.left = -scale; camera.right = scale; camera.top = scale * 1.25; camera.bottom = -scale * 1.25;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', .94);
  scene.remove(root);
  return url;
}

async function fishArt(id: number): Promise<string> {
  const def = FISH_DEFINES.find(d => d.type === id)!;
  const tpl = await assets.model(def.model.model);
  const root = instantiateC3b(tpl);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  const override = def.model.texture ? await assets.texture(def.model.texture) : null;
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (def.model.preserveMeshes && !def.model.preserveMeshes.includes(o.userData.cocosName)) o.visible = false;
    const map = override ?? (o.material as THREE.MeshBasicMaterial).map;
    o.material = new THREE.MeshStandardMaterial({ map, roughness: .62, metalness: .12, side: THREE.DoubleSide, alphaTest: .25 });
    o.frustumCulled = false;
  });
  const range = def.model.animations[def.model.runAnimation[0]];
  const clip = range && sliceC3bClip(tpl, 'portrait', range.start, range.end);
  if (clip) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration * .28);
  }
  return capture(root);
}

async function sceneArt(id: number): Promise<string> {
  const def = SCENE_DEFINES[id];
  const tpl = await assets.model(def.model);
  const root = instantiateC3b(tpl);
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  if (def.pose) {
    const clip = sliceC3bClip(tpl, 'portrait', def.pose.start, def.pose.end);
    if (clip) { const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.setTime(.001); }
  }
  setCocosRotation(root, def.rotation ?? { x: 90, y: 0, z: 0 });
  if (def.scale !== undefined) root.scale.setScalar(def.scale);
  const setting = CAMERA_PRESETS[def.camera ?? 0].setting;
  const camera = new THREE.PerspectiveCamera(setting.fov, .8, setting.near, setting.far);
  camera.position.set(setting.position.x, setting.position.y, setting.position.z);
  setCocosRotation(camera, setting.rotation);
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.frustumCulled = false; const m = o.material as THREE.MeshBasicMaterial; m.side = THREE.DoubleSide; } });
  scene.add(root);
  renderer.render(scene, camera);
  const image = renderer.domElement.toDataURL('image/webp', .94);
  scene.remove(root);
  return image;
}

function decoArt(id: string): string {
  const def = DECO_DEFINES.find(d => d.id === id)!;
  const root = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(def.w, def.h, def.d, 4, .07),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: .26, metalness: .65 }));
  root.add(body);
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5d795, roughness: .25, metalness: .85 });
  // Physical corner mounts, beveled stone, inset glowing crystal; the silhouette matches the inventory item.
  for (const y of [-def.h / 2 + .07, def.h / 2 - .07]) {
    const rim = new THREE.Mesh(new RoundedBoxGeometry(def.w + .055, .085, def.d + .055, 3, .04), gold);
    rim.position.y = y; root.add(rim);
  }
  for (const x of [-def.w / 2 + .08, def.w / 2 - .08]) for (const z of [-def.d / 2 + .08, def.d / 2 - .08]) {
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, def.h, 8), gold);
    mount.position.set(x, 0, z); root.add(mount);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(Math.min(def.w, def.h) * .17),
    new THREE.MeshPhysicalMaterial({ color: def.color, emissive: def.color, emissiveIntensity: .25, metalness: .2, roughness: .1, clearcoat: 1 }));
  gem.position.z = def.d / 2; root.add(gem);
  return capture(root);
}

(window as any).artStudio = {
  items: [...CARD_FISH_TYPES.map(id => ({ kind: 'fish', id })), ...Object.keys(SCENE_DEFINES).map(Number).map(id => ({ kind: 'scene', id })), ...DECO_DEFINES.map(d => ({ kind: 'deco', id: d.id }))],
  render: async (kind: string, id: number | string) => kind === 'fish' ? fishArt(Number(id)) : kind === 'scene' ? sceneArt(Number(id)) : decoArt(String(id)),
};
