/**
 * 裝飾物 → 3D 物件（SPEC-UGC §9.6）。
 *
 * 花園珍藏由 ArtisanDeco 建立專屬模型；其他擴充可註冊：
 *   registerDecoBuilder('sofa_red', (def, rot) => 你的 THREE.Object3D)
 * 物件原點 = 佔地中心、貼地（z = 0），+Z 朝上；佔地大小見 decoFootprint × DECO_GRID.cell。
 * 沒有註冊 builder 的物品一律畫成 DecoDefine.color 的方塊。
 */
import * as THREE from 'three';
import { DECO_GRID, decoFootprint, decoWorldRect, getDecoDefine, type DecoDefine } from '@game/ugc/DecoDefine';
import type { DecoPlacement } from '@game/ugc/UgcTypes';
import { buildArtisanDeco } from './ArtisanDeco';

export interface DecoObjectOptions {
  /** 半透明預覽（拿在手上還沒放下） */
  ghost?: boolean;
  /**
   * 裝潢模式：畫在棋盤格之後（棋盤格不做深度測試，方塊要排在它後面畫才不會被蓋住）。
   * 平常是一般的不透明物件。
   */
  editing?: boolean;
}

export type DecoBuilder = (def: DecoDefine, rot: 0 | 1, opts: DecoObjectOptions) => THREE.Object3D;

const builders = new Map<string, DecoBuilder>();

/** 註冊某個裝飾物的外觀（取代佔位方塊） */
export function registerDecoBuilder(decoId: string, builder: DecoBuilder): void {
  builders.set(decoId, builder);
}

/** BoxGeometry 的面順序：+x、−x、+y、−y、+z、−z。沒有打光，用面的明暗做出立體感（相機在 −y 側往 +y 看） */
const FACE_SHADE = [0.7, 0.7, 0.52, 0.86, 1, 0.4];
/** 方塊四周留一點縫，相鄰的方塊看得出是分開的 */
const GAP = 1;

function createBox(def: DecoDefine, rot: 0 | 1, opts: DecoObjectOptions): THREE.Object3D {
  const f = decoFootprint(def, rot);
  const cell = DECO_GRID.cell;
  const w = f.w * cell - GAP;
  const d = f.d * cell - GAP;
  const h = def.h * cell;
  const geo = new THREE.BoxGeometry(w, d, h);
  geo.translate(0, 0, h / 2);
  const base = new THREE.Color(def.color);
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3;
      colors[i] = base.r * FACE_SHADE[face];
      colors[i + 1] = base.g * FACE_SHADE[face];
      colors[i + 2] = base.b * FACE_SHADE[face];
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const transparent = !!opts.ghost || !!opts.editing;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent, opacity: opts.ghost ? 0.6 : 1 }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.35), transparent, opacity: opts.ghost ? 0.7 : 1 }),
  );
  const group = new THREE.Group();
  group.add(mesh, edges);
  if (transparent) {
    mesh.renderOrder = 10;
    edges.renderOrder = 11;
  }
  return group;
}

/** 建立一件裝飾物（原點 = 佔地中心） */
export function createDecoObject(def: DecoDefine, rot: 0 | 1, opts: DecoObjectOptions = {}): THREE.Object3D {
  const obj = (builders.get(def.id) ?? (def.model === 'artisan' ? buildArtisanDeco : createBox))(def, rot, opts);
  obj.name = `deco_${def.id}`;
  return obj;
}

/** 依擺放位置建立並放到世界座標 */
export function createPlacedDeco(p: DecoPlacement, opts: DecoObjectOptions = {}): THREE.Object3D | null {
  const def = getDecoDefine(p.id);
  if (!def) return null;
  const obj = createDecoObject(def, p.rot, opts);
  const r = decoWorldRect(p, def);
  obj.position.set(r.x + r.w / 2, r.y + r.d / 2, 0);
  return obj;
}

/** 釋放物件用到的 geometry / material */
export function disposeDecoObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
