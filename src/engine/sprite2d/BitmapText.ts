/**
 * BMFont 文字（對照 cc.LabelBMFont / TextBMFont），單行，anchor 預設置中。
 */
import * as THREE from 'three';
import type { BitmapFont } from '../assets/AssetManager';

export class BitmapText extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  private _text = '';
  private anchor = new THREE.Vector2(0.5, 0.5);
  readonly size = new THREE.Vector2();

  constructor(
    private readonly font: BitmapFont,
    text = '',
    opts: { additive?: boolean } = {},
  ) {
    const mat = new THREE.MeshBasicMaterial({
      map: font.pages[0] ?? null,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    super(new THREE.BufferGeometry(), mat);
    this.frustumCulled = false;
    this.text = text;
  }

  get text(): string {
    return this._text;
  }

  set text(v: string) {
    if (v === this._text && this.geometry.getAttribute('position')) return;
    this._text = v;
    this.rebuild();
  }

  setAnchor(x: number, y: number): this {
    this.anchor.set(x, y);
    this.rebuild();
    return this;
  }

  set opacity(v: number) {
    this.material.opacity = v;
    this.visible = v > 0.001;
  }
  get opacity(): number {
    return this.material.opacity;
  }

  private rebuild(): void {
    const d = this.font.data;
    const W = d.scaleW;
    const H = d.scaleH;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let x = 0;
    let prev = -1;
    let n = 0;
    for (const ch of this._text) {
      const code = ch.codePointAt(0)!;
      const c = d.chars.get(code);
      if (!c) continue;
      if (prev >= 0) x += d.kernings.get(`${prev},${code}`) ?? 0;
      // BMFont：yoffset 自行頂往下；轉成 y-up（行頂 = lineHeight）
      const x0 = x + c.xoffset;
      const y1 = d.lineHeight - c.yoffset;
      const x1 = x0 + c.width;
      const y0 = y1 - c.height;
      positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
      const u0 = c.x / W;
      const u1 = (c.x + c.width) / W;
      const v1 = 1 - c.y / H;
      const v0 = 1 - (c.y + c.height) / H;
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      const b = n * 4;
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
      x += c.xadvance;
      prev = code;
      n++;
    }
    const width = x;
    const height = d.lineHeight;
    this.size.set(width, height);
    const ox = -this.anchor.x * width;
    const oy = -this.anchor.y * height;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += ox;
      positions[i + 1] += oy;
    }
    const g = this.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeBoundingSphere();
  }

  override dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
