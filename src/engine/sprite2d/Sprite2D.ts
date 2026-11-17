/**
 * Overlay 2D sprite（設計座標，原點左下）：對照 cc.Sprite + SpriteFrame。
 * 支援 TexturePacker 旋轉（rotated）與裁切（trim offset），anchor 預設 (0.5, 0.5)。
 */
import * as THREE from 'three';
import type { Atlas, AtlasFrame } from '../assets/AssetManager';

export interface SpriteFrameRef {
  atlas: Atlas;
  frame: AtlasFrame;
}

export class Sprite2D extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  private anchor = new THREE.Vector2(0.5, 0.5);
  private frameRef: SpriteFrameRef | null = null;
  /** 原始尺寸（cocos contentSize） */
  readonly contentSize = new THREE.Vector2();

  constructor(frame: SpriteFrameRef | null = null, opts: { additive?: boolean } = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    super(geo, mat);
    this.frustumCulled = false;
    if (frame) this.setFrame(frame);
  }

  setAnchor(x: number, y: number): this {
    this.anchor.set(x, y);
    this.rebuild();
    return this;
  }

  setFrame(ref: SpriteFrameRef): this {
    this.frameRef = ref;
    if (this.material.map !== ref.atlas.texture) {
      this.material.map = ref.atlas.texture;
      this.material.needsUpdate = true;
    }
    this.rebuild();
    return this;
  }

  get frame(): SpriteFrameRef | null {
    return this.frameRef;
  }

  set opacity(v: number) {
    this.material.opacity = v;
    this.visible = v > 0.001;
  }
  get opacity(): number {
    return this.material.opacity;
  }

  /** 2D 旋轉（度，cocos 順時針為正） */
  set rotation2D(deg: number) {
    this.rotation.z = (-deg * Math.PI) / 180;
  }

  private rebuild(): void {
    const ref = this.frameRef;
    if (!ref) return;
    const f = ref.frame;
    const W = ref.atlas.size.w || (ref.atlas.texture.image as { width: number }).width;
    const H = ref.atlas.size.h || (ref.atlas.texture.image as { height: number }).height;
    this.contentSize.set(f.sourceW, f.sourceH);

    // 頂點：裁切後的矩形放在原始尺寸中的 offset 位置（cocos offset 為 y-up）
    const left = -this.anchor.x * f.sourceW + (f.sourceW - f.w) / 2 + f.offsetX;
    const bottom = -this.anchor.y * f.sourceH + (f.sourceH - f.h) / 2 + f.offsetY;
    const right = left + f.w;
    const top = bottom + f.h;
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    // 0:bl 1:br 2:tr 3:tl
    pos.setXYZ(0, left, bottom, 0);
    pos.setXYZ(1, right, bottom, 0);
    pos.setXYZ(2, right, top, 0);
    pos.setXYZ(3, left, top, 0);
    pos.needsUpdate = true;

    // UV（貼圖 flipY：v = 1 - 像素y/H）
    const uv = this.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const U = (px: number) => px / W;
    const V = (py: number) => 1 - py / H;
    if (!f.rotated) {
      const l = U(f.x);
      const r = U(f.x + f.w);
      const t = V(f.y);
      const b = V(f.y + f.h);
      uv.setXY(0, l, b);
      uv.setXY(1, r, b);
      uv.setXY(2, r, t);
      uv.setXY(3, l, t);
    } else {
      // 旋轉 90°：在圖集中佔 (h × w)；對照 cc.Sprite::setTextureCoords
      const l = U(f.x);
      const r = U(f.x + f.h);
      const t = V(f.y);
      const b = V(f.y + f.w);
      uv.setXY(0, l, t); // bl
      uv.setXY(1, l, b); // br
      uv.setXY(2, r, b); // tr
      uv.setXY(3, r, t); // tl
    }
    uv.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
