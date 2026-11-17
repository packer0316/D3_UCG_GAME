/**
 * Cocos Studio（csd/csb）執行環境：在 2D overlay（設計座標、原點左下）重建節點樹並播放 timeline。
 *
 * 行為對照 cocos2d-x CSLoader / cocostudio::timeline：
 * - 子節點座標原點 = 父節點左下角（父節點 anchor × contentSize 的反向偏移）
 * - opacity / color 向子節點層疊（CSLoader 對所有節點開 cascade）
 * - Timeline：第一個 key 之前取第一個 key、最後一個 key 之後取最後一個 key；Tween=False 為階梯
 * - 60 fps × Animation Speed；依 AnimationList 名稱播放
 * - BlendFunc：dst == GL_ONE → 加色，否則一般 alpha（原版貼圖為預乘 alpha，(1,771) 等同一般混合）
 * - Particle：以貼圖旋轉光暈近似（cocos 粒子系統未移植）
 */
import * as THREE from 'three';
import type { AssetManager, Atlas, BitmapFont } from '../assets/AssetManager';
import { BitmapText } from '../sprite2d/BitmapText';
import { Sprite2D, type SpriteFrameRef } from '../sprite2d/Sprite2D';
import { csdEase } from './CsdEasing';
import { listCsdDeps, type CsdFile, type CsdFileRef, type CsdFrame, type CsdNode } from './CsdParser';

export const CSD_FPS = 60;

interface ParticleDef {
  texture: string | null;
  life?: number;
  startSize?: number;
  rotationStart?: number;
  rotationEnd?: number;
  startColor?: number[];
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);

/** 載入 / 快取 csd（.csd.json）與其相依資源 */
export class CsdLibrary {
  private files = new Map<string, CsdFile>();
  private particles = new Map<string, ParticleDef>();
  private loading = new Map<string, Promise<CsdFile>>();

  constructor(readonly assets: AssetManager) {}

  load(path: string): Promise<CsdFile> {
    let p = this.loading.get(path);
    if (!p) {
      p = (async () => {
        const csd = await this.assets.json<CsdFile>(path + '.json');
        const deps = listCsdDeps(csd);
        await Promise.all([
          ...[...deps.plists].map((x) => this.assets.atlas(x).catch(warn)),
          ...[...deps.fonts].map((x) => this.assets.font(x).catch(warn)),
          ...[...deps.images].map((x) => this.assets.imageAtlas(x).catch(warn)),
          ...[...deps.particles].map((x) => this.loadParticle(x).catch(warn)),
          ...[...deps.csds].map((x) => this.load(x).catch(warn)),
        ]);
        this.files.set(path, csd);
        return csd;
      })();
      this.loading.set(path, p);
    }
    return p;
  }

  private async loadParticle(path: string): Promise<void> {
    const def = await this.assets.json<ParticleDef>(path + '.particle.json');
    if (def.texture) await this.assets.imageAtlas(dirOf(path) + def.texture);
    this.particles.set(path, def);
  }

  get(path: string): CsdFile | undefined {
    return this.files.get(path);
  }

  particle(path: string): ParticleDef | undefined {
    return this.particles.get(path);
  }

  /** 建立實例（需先 load） */
  create(path: string): CsdInstance {
    const csd = this.files.get(path);
    if (!csd) throw new Error(`[Csd] ${path} not loaded`);
    return new CsdInstance(this, csd);
  }

  frameRef(f: CsdFileRef | null | undefined): SpriteFrameRef | null {
    if (!f || !f.path || f.type === 'Default') return null;
    if (f.plist) {
      const atlas = this.assets.peekAtlas(f.plist);
      const frame = atlas?.frames[f.path];
      return atlas && frame ? { atlas, frame } : null;
    }
    const atlas: Atlas | undefined = this.assets.peekImageAtlas(f.path);
    return atlas ? { atlas, frame: atlas.frames[f.path] } : null;
  }

  font(f: CsdFileRef | undefined): BitmapFont | undefined {
    return f ? this.assets.peekFont(f.path) : undefined;
  }
}

function warn(e: unknown): void {
  console.warn('[Csd]', e instanceof Error ? e.message : e);
}

type Content = Sprite2D | BitmapText;

/** 單一節點的狀態與顯示物件 */
export class CsdNodeView {
  readonly group = new THREE.Group();
  /** 子節點容器（原點 = 本節點左下角） */
  readonly childRoot = new THREE.Group();
  content: Content | null = null;
  sub: CsdInstance | null = null;
  readonly children: CsdNodeView[] = [];
  // 目前狀態（可被 timeline 或程式改變）
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rot: number;
  alpha: number;
  visible: boolean;
  color: [number, number, number];
  anchorX: number;
  anchorY: number;
  private file: CsdFileRef | undefined;
  private particleSpin = 0;
  private particleRate = 0;

  constructor(
    readonly data: CsdNode,
    private readonly lib: CsdLibrary,
  ) {
    this.group.name = data.name;
    this.x = data.x;
    this.y = data.y;
    this.scaleX = data.scaleX;
    this.scaleY = data.scaleY;
    this.rot = data.rotX;
    this.alpha = data.alpha;
    this.visible = data.visible;
    this.color = [...data.color];
    this.anchorX = data.anchorX;
    this.anchorY = data.anchorY;
    this.file = data.file;
    this.group.add(this.childRoot);
    this.buildContent();
  }

  private applyBlend(c: Content, blend: [number, number] | undefined): void {
    const additive = blend ? blend[1] === 1 : false;
    const target = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (c.material.blending !== target) {
      c.material.blending = target;
      c.material.needsUpdate = true;
    }
  }

  private buildContent(): void {
    const d = this.data;
    switch (d.type) {
      case 'Sprite':
      case 'ImageView':
      case 'Button': {
        const ref = this.lib.frameRef(this.file);
        if (!ref) break;
        const s = new Sprite2D(ref);
        s.material.side = THREE.DoubleSide;
        this.content = s;
        this.applyBlend(s, d.blend);
        break;
      }
      case 'TextBMFont': {
        const font = this.lib.font(d.font);
        if (!font) break;
        const t = new BitmapText(font, d.text ?? '');
        t.material.side = THREE.DoubleSide;
        this.content = t;
        break;
      }
      case 'Particle': {
        const def = d.file ? this.lib.particle(d.file.path) : undefined;
        if (!def?.texture || !d.file) break;
        const texPath = dirOf(d.file.path) + def.texture;
        const atlas = this.lib.assets.peekImageAtlas(texPath);
        if (!atlas) break;
        const s = new Sprite2D({ atlas, frame: atlas.frames[texPath] });
        s.material.side = THREE.DoubleSide;
        this.applyBlend(s, d.blend ?? [1, 1]);
        const size = def.startSize ?? atlas.size.w;
        s.scale.setScalar(size / Math.max(1, atlas.size.w));
        const c = def.startColor ?? [1, 1, 1, 1];
        s.material.color.setRGB(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1);
        s.material.opacity = c[3] ?? 1;
        const life = def.life && def.life > 0 ? def.life : 1;
        this.particleRate = ((def.rotationEnd ?? 360) - (def.rotationStart ?? 0)) / life;
        this.content = s;
        break;
      }
      case 'ProjectNode': {
        if (!d.file) break;
        const csd = this.lib.get(d.file.path);
        if (!csd) break;
        this.sub = new CsdInstance(this.lib, csd);
        if (d.innerActionSpeed) this.sub.speed = d.innerActionSpeed;
        this.sub.playDefault();
        this.childRoot.add(this.sub.root);
        break;
      }
      default:
        break;
    }
    if (this.content) {
      // 粒子從發射點中心放射（不受節點 anchor 影響），旋轉也以中心為軸
      if (d.type === 'Particle') this.content.setAnchor(0.5, 0.5);
      else this.content.setAnchor(this.anchorX, this.anchorY);
      this.group.add(this.content);
      this.applyScale9();
    }
  }

  /** ImageView Scale9 / 指定 Size：以縮放近似九宮格 */
  private applyScale9(): void {
    const d = this.data;
    if (!(this.content instanceof Sprite2D) || d.type !== 'ImageView' || !d.scale9) return;
    const cs = this.content.contentSize;
    if (cs.x > 0 && cs.y > 0 && d.width > 0 && d.height > 0) this.content.scale.set(d.width / cs.x, d.height / cs.y, 1);
  }

  /** 內容尺寸（cocos contentSize） */
  get size(): { w: number; h: number } {
    const d = this.data;
    if (this.content instanceof Sprite2D && !(d.type === 'ImageView' && d.scale9)) {
      return { w: this.content.contentSize.x, h: this.content.contentSize.y };
    }
    if (this.content instanceof BitmapText) return { w: this.content.size.x, h: this.content.size.y };
    return { w: d.width, h: d.height };
  }

  setFile(f: CsdFileRef | null): void {
    if (!f || (this.file && f.path === this.file.path && f.plist === this.file.plist)) return;
    this.file = f;
    const ref = this.lib.frameRef(f);
    if (ref && this.content instanceof Sprite2D) this.content.setFrame(ref);
  }

  /** 直接換圖（依 frame 名稱在已載入圖集找到的圖，對照 Sprite:setSpriteFrame(name)） */
  setFrame(ref: SpriteFrameRef | null): void {
    if (ref && this.content instanceof Sprite2D) this.content.setFrame(ref);
  }

  setBlend(b: [number, number]): void {
    if (this.content) this.applyBlend(this.content, b);
  }

  setAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
    this.content?.setAnchor(x, y);
  }

  setText(text: string): void {
    if (this.content instanceof BitmapText) {
      this.content.text = text;
      this.content.setAnchor(this.anchorX, this.anchorY);
    }
  }

  /** 每幀：套用 transform 與層疊後的 opacity / color */
  refresh(parentAlpha: number, parentColor: [number, number, number], dt: number): void {
    this.group.visible = this.visible;
    this.group.position.set(this.x, this.y, 0);
    this.group.rotation.z = (-this.rot * Math.PI) / 180;
    this.group.scale.set(this.scaleX, this.scaleY, 1);
    const sz = this.size;
    this.childRoot.position.set(-this.anchorX * sz.w, -this.anchorY * sz.h, 0);
    const a = parentAlpha * (this.alpha / 255);
    const col: [number, number, number] = [
      parentColor[0] * (this.color[0] / 255),
      parentColor[1] * (this.color[1] / 255),
      parentColor[2] * (this.color[2] / 255),
    ];
    if (this.content) {
      if (this.data.type === 'Particle') {
        this.particleSpin += this.particleRate * dt;
        this.content.rotation.z = (-this.particleSpin * Math.PI) / 180;
      } else {
        this.content.material.opacity = a;
        this.content.material.color.setRGB(col[0], col[1], col[2]);
      }
      this.content.visible = a > 0.001;
    }
    if (this.sub) this.sub.refreshTree(a, col, dt);
    for (const c of this.children) c.refresh(a, col, dt);
  }

  /** 設計座標的點是否落在內容範圍內（按鈕點擊判定） */
  hitTest(designX: number, designY: number): boolean {
    if (!this.content || !this.group.visible) return false;
    let o: THREE.Object3D | null = this.group;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    this.content.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(designX, designY, 0).applyMatrix4(this.content.matrixWorld.clone().invert());
    const sz = this.size;
    const left = -this.anchorX * sz.w;
    const bottom = -this.anchorY * sz.h;
    return p.x >= left && p.x <= left + sz.w && p.y >= bottom && p.y <= bottom + sz.h;
  }

  dispose(): void {
    this.content?.removeFromParent();
    this.content?.dispose();
    this.sub?.dispose();
    for (const c of this.children) c.dispose();
  }
}

/** 一份 csd 的實例 */
export class CsdInstance {
  readonly root = new THREE.Group();
  readonly nodes: CsdNodeView[] = [];
  private readonly top: CsdNodeView;
  private byTag = new Map<number, CsdNodeView>();
  private byName = new Map<string, CsdNodeView>();
  private frame = 0;
  private range: { start: number; end: number; loop: boolean; onEnd?: () => void } | null = null;
  speed = 1;
  /** 整體 opacity（0..1）與 color 乘數 */
  opacity = 1;
  /** timeline FrameEvent */
  onEvent: ((name: string) => void) | null = null;
  /** timeline 套用後、更新顯示前（可在此覆寫節點狀態，例如雷射長度） */
  afterTick: (() => void) | null = null;

  constructor(
    private readonly lib: CsdLibrary,
    readonly csd: CsdFile,
  ) {
    this.top = this.build(csd.root, null);
    this.root.add(this.top.group);
    // 與 cocos 相同：timeline 只在 play 之後才套用，未播放時維持節點本身的屬性
    this.refreshTree(1, [1, 1, 1], 0);
  }

  private build(data: CsdNode, parent: CsdNodeView | null): CsdNodeView {
    const v = new CsdNodeView(data, this.lib);
    this.nodes.push(v);
    if (data.actionTag) this.byTag.set(data.actionTag, v);
    if (data.name && !this.byName.has(data.name)) this.byName.set(data.name, v);
    if (parent) {
      parent.children.push(v);
      parent.childRoot.add(v.group);
    }
    for (const c of data.children) this.build(c, v);
    return v;
  }

  find(name: string): CsdNodeView | undefined {
    return this.byName.get(name);
  }

  /** 依名稱找節點並取其子 csd（ProjectNode） */
  findSub(name: string): CsdInstance | null {
    return this.byName.get(name)?.sub ?? null;
  }

  get animations(): string[] {
    return this.csd.animations.map((a) => a.name);
  }

  hasAnimation(name: string): boolean {
    return this.csd.animations.some((a) => a.name === name);
  }

  /** 播放指定動畫；name 不存在時播放整條 timeline（0..duration） */
  play(name?: string, loop = false, onEnd?: () => void): this {
    const a = name ? this.csd.animations.find((x) => x.name === name) : undefined;
    const start = a ? a.start : 0;
    const end = a ? a.end : this.csd.duration;
    this.range = { start, end, loop, onEnd };
    this.frame = start;
    this.applyFrame(start, start - 1);
    return this;
  }

  /** 巢狀 ProjectNode 的預設：有 AnimationList 播第一個，否則整條；有 timeline 才 loop */
  playDefault(): void {
    if (this.csd.timelines.length === 0) return;
    this.play(this.csd.animations[0]?.name, true);
  }

  stop(): void {
    this.range = null;
  }

  get isPlaying(): boolean {
    return this.range !== null;
  }

  gotoFrame(f: number): void {
    this.frame = f;
    this.applyFrame(f, f - 1);
  }

  update(dt: number): void {
    this.tick(dt);
    this.afterTick?.();
    this.refreshTree(this.opacity, [1, 1, 1], dt);
  }

  private tick(dt: number): void {
    for (const n of this.nodes) n.sub?.tick(dt);
    const r = this.range;
    if (!r) return;
    const prev = this.frame;
    let f = prev + dt * CSD_FPS * this.speed * (this.csd.speed || 1);
    if (f >= r.end) {
      if (r.loop) {
        const len = Math.max(1e-6, r.end - r.start);
        this.applyFrame(r.end, prev); // 補觸發尾端事件
        f = r.start + ((f - r.start) % len);
        this.frame = f;
        this.applyFrame(f, r.start - 1);
        return;
      }
      this.frame = r.end;
      this.applyFrame(r.end, prev);
      this.range = null;
      r.onEnd?.();
      return;
    }
    this.frame = f;
    this.applyFrame(f, prev);
  }

  /** 由父節點呼叫（巢狀）或 update() 呼叫 */
  refreshTree(alpha: number, color: [number, number, number], dt: number): void {
    this.top.refresh(alpha, color, dt);
  }

  private applyFrame(f: number, prev: number): void {
    for (const tl of this.csd.timelines) {
      const node = this.byTag.get(tl.tag);
      if (!node) continue;
      if (tl.prop === 'FrameEvent') {
        for (const fr of tl.frames) if (fr.i > prev && fr.i <= f && typeof fr.v === 'string' && fr.v) this.onEvent?.(fr.v);
        continue;
      }
      applyProp(node, tl.prop, sample(tl.frames, f));
    }
  }

  dispose(): void {
    this.top.dispose();
    this.root.removeFromParent();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 取 timeline 在影格 f 的值（cocostudio Timeline 行為） */
function sample(frames: CsdFrame[], f: number): unknown {
  const first = frames[0];
  if (f <= first.i || frames.length === 1) return first.v;
  const last = frames[frames.length - 1];
  if (f >= last.i) return last.v;
  let k = 0;
  while (k < frames.length - 1 && frames[k + 1].i <= f) k++;
  const a = frames[k];
  const b = frames[k + 1];
  if (!a.tween || b.i === a.i) return a.v;
  const t = csdEase(a.ease, (f - a.i) / (b.i - a.i), a.easePts);
  const va = a.v;
  const vb = b.v;
  if (typeof va === 'number' && typeof vb === 'number') return lerp(va, vb, t);
  if (Array.isArray(va) && Array.isArray(vb)) return va.map((x, i) => lerp(x as number, vb[i] as number, t));
  if (va && vb && typeof va === 'object' && 'x' in va && typeof vb === 'object' && 'x' in vb) {
    const pa = va as { x: number; y: number };
    const pb = vb as { x: number; y: number };
    return { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t) };
  }
  return va;
}

function applyProp(n: CsdNodeView, prop: string, v: unknown): void {
  switch (prop) {
    case 'Position': {
      const p = v as { x: number; y: number };
      n.x = p.x;
      n.y = p.y;
      break;
    }
    case 'Scale': {
      const p = v as { x: number; y: number };
      n.scaleX = p.x;
      n.scaleY = p.y;
      break;
    }
    case 'RotationSkew':
      n.rot = (v as { x: number }).x;
      break;
    case 'Alpha':
      n.alpha = v as number;
      break;
    case 'VisibleForFrame':
      n.visible = v as boolean;
      break;
    case 'CColor': {
      const c = v as number[];
      n.color = [c[1], c[2], c[3]];
      break;
    }
    case 'FileData':
      n.setFile(v as CsdFileRef | null);
      break;
    case 'BlendFunc':
      n.setBlend(v as [number, number]);
      break;
    case 'AnchorPoint': {
      const p = v as { x: number; y: number };
      n.setAnchor(p.x, p.y);
      break;
    }
    default:
      break;
  }
}
