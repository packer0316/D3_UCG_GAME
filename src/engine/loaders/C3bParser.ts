/**
 * Cocos2d-x c3b（二進位 3D 模型）解析器 — 純資料，不依賴 three.js。
 *
 * 格式依照 Cocos2d-x `Bundle3D::loadBinary` / `loadMeshDatasBinary` / `loadMaterialsBinary`
 * / `parseNodesRecursivelyBinary` / `loadAnimationDataBinary`（支援 v0.5 以上，原版資源為 v0.7）。
 *
 * 注意：此檔案同時被 tools/*.mjs 以 Node 直接載入（type stripping），
 * 因此不可 import 其他模組，也只能使用可抹除的 TS 語法（不用 enum / parameter properties）。
 */

export const C3B_REF_TYPE = {
  SCENE: 1,
  NODE: 2,
  ANIMATIONS: 3,
  ANIMATION: 4,
  MODEL: 10,
  MATERIAL: 16,
  MESH: 34,
  MESHPART: 35,
  MESHSKIN: 36,
} as const;

export interface C3bReference {
  id: string;
  type: number;
  offset: number;
}

export interface C3bAttrib {
  /** float 數量 */
  size: number;
  type: string;
  /** VERTEX_ATTRIB_POSITION / NORMAL / TEX_COORD / BLEND_WEIGHT / BLEND_INDEX ... */
  name: string;
}

export interface C3bMeshPart {
  id: string;
  indices: Uint16Array;
  aabb: [number, number, number, number, number, number] | null;
}

export interface C3bMesh {
  attribs: C3bAttrib[];
  /** 每個頂點的 float 數 */
  stride: number;
  vertices: Float32Array;
  parts: C3bMeshPart[];
}

export interface C3bTexture {
  id: string;
  filename: string;
  uv: number[];
  usage: string;
  wrapS: string;
  wrapT: string;
}

export interface C3bMaterial {
  id: string;
  /** diffuse(3) ambient(3) emissive(3) opacity(1) specular(3) shininess(1) */
  data: number[];
  textures: C3bTexture[];
}

export interface C3bNodePart {
  meshPartId: string;
  materialId: string;
  bones: string[];
  /** 每根骨骼一個 16 floats（column-major） */
  invBindPoses: Float32Array[];
}

export interface C3bNode {
  id: string;
  skeleton: boolean;
  /** 16 floats column-major（與 three.js Matrix4.fromArray 相同） */
  transform: Float32Array;
  parts: C3bNodePart[];
  children: C3bNode[];
}

export interface C3bKeyframe {
  /** 0..1 正規化時間（× totalTime = 秒） */
  time: number;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
}

export interface C3bBoneAnimation {
  bone: string;
  keys: C3bKeyframe[];
}

export interface C3bAnimation {
  id: string;
  /** 秒 */
  totalTime: number;
  bones: C3bBoneAnimation[];
}

export interface C3bData {
  version: string;
  references: C3bReference[];
  meshes: C3bMesh[];
  materials: C3bMaterial[];
  nodes: C3bNode[];
  animations: C3bAnimation[];
}

class BinaryReader {
  private view: DataView;
  private bytes: Uint8Array;
  pos = 0;
  private static decoder = new TextDecoder('utf-8');

  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  floats(count: number): Float32Array {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = this.view.getFloat32(this.pos + i * 4, true);
    this.pos += count * 4;
    return out;
  }

  u16s(count: number): Uint16Array {
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++) out[i] = this.view.getUint16(this.pos + i * 2, true);
    this.pos += count * 2;
    return out;
  }

  string(): string {
    const len = this.u32();
    if (len === 0) return '';
    if (this.pos + len > this.bytes.byteLength) throw new Error(`c3b: string overflow at ${this.pos}`);
    const s = BinaryReader.decoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
}

function versionAtLeast(version: string, major: number, minor: number): boolean {
  const [a, b] = version.split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

function readMeshes(r: BinaryReader, version: string): C3bMesh[] {
  const meshCount = r.u32();
  const meshes: C3bMesh[] = [];
  for (let i = 0; i < meshCount; i++) {
    const attribCount = r.u32();
    const attribs: C3bAttrib[] = [];
    let stride = 0;
    for (let a = 0; a < attribCount; a++) {
      const size = r.u32();
      const type = r.string();
      const name = r.string();
      attribs.push({ size, type, name });
      stride += size;
    }
    const vertexFloatCount = r.u32();
    const vertices = r.floats(vertexFloatCount);
    const partCount = r.u32();
    const parts: C3bMeshPart[] = [];
    for (let p = 0; p < partCount; p++) {
      const id = r.string();
      const indexCount = r.u32();
      const indices = r.u16s(indexCount);
      let aabb: C3bMeshPart['aabb'] = null;
      // Bundle3D：0.3 / 0.4 / 0.5 沒有 AABB
      if (versionAtLeast(version, 0, 6)) {
        const f = r.floats(6);
        aabb = [f[0], f[1], f[2], f[3], f[4], f[5]];
      }
      parts.push({ id, indices, aabb });
    }
    meshes.push({ attribs, stride, vertices, parts });
  }
  return meshes;
}

function readMaterials(r: BinaryReader): C3bMaterial[] {
  const count = r.u32();
  const materials: C3bMaterial[] = [];
  for (let i = 0; i < count; i++) {
    const id = r.string();
    const data = Array.from(r.floats(14));
    const texCount = r.u32();
    const textures: C3bTexture[] = [];
    for (let t = 0; t < texCount; t++) {
      const texId = r.string();
      const filename = r.string();
      const uv = Array.from(r.floats(4));
      const usage = r.string();
      const wrapS = r.string();
      const wrapT = r.string();
      textures.push({ id: texId, filename, uv, usage, wrapS, wrapT });
    }
    materials.push({ id, data, textures });
  }
  return materials;
}

function readNode(r: BinaryReader): C3bNode {
  const id = r.string();
  const skeleton = r.u8() !== 0;
  const transform = r.floats(16);
  const partCount = r.u32();
  const parts: C3bNodePart[] = [];
  for (let p = 0; p < partCount; p++) {
    const meshPartId = r.string();
    const materialId = r.string();
    const boneCount = r.u32();
    const bones: string[] = [];
    const invBindPoses: Float32Array[] = [];
    for (let b = 0; b < boneCount; b++) {
      bones.push(r.string());
      invBindPoses.push(r.floats(16));
    }
    // uvMapping：只讀掉，不使用
    const uvMapping = r.u32();
    for (let u = 0; u < uvMapping; u++) {
      const n = r.u32();
      for (let k = 0; k < n; k++) r.u32();
    }
    parts.push({ meshPartId, materialId, bones, invBindPoses });
  }
  const childCount = r.u32();
  const children: C3bNode[] = [];
  for (let c = 0; c < childCount; c++) children.push(readNode(r));
  return { id, skeleton, transform, parts, children };
}

function readNodes(r: BinaryReader): C3bNode[] {
  const count = r.u32();
  const nodes: C3bNode[] = [];
  for (let i = 0; i < count; i++) nodes.push(readNode(r));
  return nodes;
}

function readAnimation(r: BinaryReader, version: string): C3bAnimation {
  const id = r.string();
  const totalTime = r.f32();
  const boneCount = r.u32();
  const hasFlag = versionAtLeast(version, 0, 4);
  const bones: C3bBoneAnimation[] = [];
  for (let b = 0; b < boneCount; b++) {
    const bone = r.string();
    const keyCount = r.u32();
    const keys: C3bKeyframe[] = [];
    for (let k = 0; k < keyCount; k++) {
      const time = r.f32();
      const flag = hasFlag ? r.u8() : 0x07;
      const key: C3bKeyframe = { time };
      if (flag & 0x01) {
        const q = r.floats(4);
        key.rotation = [q[0], q[1], q[2], q[3]];
      }
      if (flag & 0x02) {
        const s = r.floats(3);
        key.scale = [s[0], s[1], s[2]];
      }
      if (flag & 0x04) {
        const t = r.floats(3);
        key.translation = [t[0], t[1], t[2]];
      }
      keys.push(key);
    }
    bones.push({ bone, keys });
  }
  return { id, totalTime, bones };
}

export function parseC3b(buffer: ArrayBuffer | Uint8Array): C3bData {
  const r = new BinaryReader(buffer);
  const sig = [r.u8(), r.u8(), r.u8(), r.u8()];
  if (sig[0] !== 0x43 || sig[1] !== 0x33 || sig[2] !== 0x42 || sig[3] !== 0x00) {
    throw new Error('c3b: invalid signature');
  }
  const version = `${r.u8()}.${r.u8()}`;
  if (!versionAtLeast(version, 0, 5)) {
    throw new Error(`c3b: unsupported version ${version}（只支援 0.5 以上）`);
  }
  const refCount = r.u32();
  const references: C3bReference[] = [];
  for (let i = 0; i < refCount; i++) {
    const id = r.string();
    const type = r.u32();
    const offset = r.u32();
    references.push({ id, type, offset });
  }

  const firstOf = (type: number) => references.find((ref) => ref.type === type);
  const seek = (ref: C3bReference) => {
    if (ref.offset >= r.length) throw new Error(`c3b: bad offset ${ref.offset}`);
    r.pos = ref.offset;
  };

  let meshes: C3bMesh[] = [];
  let materials: C3bMaterial[] = [];
  let nodes: C3bNode[] = [];
  const animations: C3bAnimation[] = [];

  const meshRef = firstOf(C3B_REF_TYPE.MESH);
  if (meshRef) {
    seek(meshRef);
    meshes = readMeshes(r, version);
  }
  const matRef = firstOf(C3B_REF_TYPE.MATERIAL);
  if (matRef) {
    seek(matRef);
    materials = readMaterials(r);
  }
  const nodeRef = firstOf(C3B_REF_TYPE.NODE);
  if (nodeRef) {
    seek(nodeRef);
    nodes = readNodes(r);
  }
  for (const ref of references) {
    if (ref.type !== C3B_REF_TYPE.ANIMATIONS) continue;
    seek(ref);
    animations.push(readAnimation(r, version));
  }

  return { version, references, meshes, materials, nodes, animations };
}

/** 只取材質貼圖檔名（資源複製工具用） */
export function listC3bTextures(buffer: ArrayBuffer | Uint8Array): string[] {
  const data = parseC3b(buffer);
  const out = new Set<string>();
  for (const m of data.materials) for (const t of m.textures) if (t.filename) out.add(t.filename);
  return [...out];
}
