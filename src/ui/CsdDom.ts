/**
 * 把 Cocos Studio csd（.csd.json）建成 DOM（設計座標、y 向上），給需要互動的 UI 面板用
 * （捲動清單、勾選框、按鈕、文字）。版面規則與 CsdPlayer 相同：
 * - 子節點座標原點 = 父節點左下角（CSS left / bottom 正好對應）
 * - 節點 position 為 anchor 所在位置；旋轉 / 縮放以 anchor 為中心
 * - opacity 向下層疊（CSS opacity 本來就會層疊）
 * - 圖片使用原版 plist 影格（支援 TexturePacker rotated / trim）
 */
import type { AtlasFrame, BitmapFont } from '@engine/assets/AssetManager';
import type { CsdLibrary } from '@engine/csd/CsdPlayer';
import type { CsdFile, CsdFileRef, CsdNode } from '@engine/csd/CsdParser';
import type { SpriteFrameRef } from '@engine/sprite2d/Sprite2D';

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

export interface Scale9Caps {
  l: number;
  r: number;
  t: number;
  b: number;
}

/**
 * 把影格從圖集裁成獨立畫布（含 TexturePacker 旋轉還原、trim 偏移），每個影格只做一次。
 * 直接用整張圖集當 background 縮放時，濾波會取樣到相鄰影格的像素，在邊緣形成細線。
 */
const frameCanvasCache = new WeakMap<AtlasFrame, HTMLCanvasElement>();
function frameCanvas(ref: SpriteFrameRef): HTMLCanvasElement | null {
  const f = ref.frame;
  const cached = frameCanvasCache.get(f);
  if (cached) return cached;
  const img = ref.atlas.texture.image as CanvasImageSource | undefined;
  if (!img || !f.sourceW || !f.sourceH) return null;
  const c = document.createElement('canvas');
  c.width = f.sourceW;
  c.height = f.sourceH;
  const g = c.getContext('2d');
  if (!g) return null;
  // 裁切後的矩形在原始尺寸中的位置（cocos offset 為 y 向上，canvas 為 y 向下）
  const ox = (f.sourceW - f.w) / 2 + f.offsetX;
  const oy = (f.sourceH - f.h) / 2 - f.offsetY;
  if (!f.rotated) {
    g.drawImage(img, f.x, f.y, f.w, f.h, ox, oy, f.w, f.h);
  } else {
    // 圖集中順時針轉 90° 存放（佔 h × w）：逆時針轉回
    g.translate(ox, oy + f.h);
    g.rotate(-Math.PI / 2);
    g.drawImage(img, f.x, f.y, f.h, f.w, 0, 0, f.h, f.w);
  }
  frameCanvasCache.set(f, c);
  return c;
}

const frameUrlCache = new WeakMap<AtlasFrame, string>();
function frameUrl(ref: SpriteFrameRef): string | null {
  const cached = frameUrlCache.get(ref.frame);
  if (cached) return cached;
  const c = frameCanvas(ref);
  if (!c) return null;
  const url = c.toDataURL();
  frameUrlCache.set(ref.frame, url);
  return url;
}

/**
 * 九宮格預先畫成「一張」點陣圖（實際螢幕解析度），元素只顯示這一張圖。
 * 讓瀏覽器分 9 塊合成（多個 div 或 border-image）時，UI 縮放不是整數倍會在切片交界留下半透明細線；
 * 一張圖就不會有接縫。切片交界對齊畫布整數像素。
 */
let ninePixelScale = 2;
/** 設定九宮格烘焙解析度（設計像素 → 裝置像素的倍率） */
export function setCsdPixelScale(scale: number): void {
  ninePixelScale = Math.min(4, Math.max(1, Math.ceil(scale * 2) / 2));
}

const nineCache = new Map<string, string>();
const nineFrameIds = new WeakMap<AtlasFrame, number>();
let nineFrameSeq = 0;

function bakeNine(ref: SpriteFrameRef, w: number, h: number, caps: Scale9Caps): string | null {
  const src = frameCanvas(ref);
  if (!src) return null;
  const k = ninePixelScale;
  let fid = nineFrameIds.get(ref.frame);
  if (fid === undefined) nineFrameIds.set(ref.frame, (fid = ++nineFrameSeq));
  const key = `${fid}|${w}|${h}|${caps.l},${caps.r},${caps.t},${caps.b}|${k}`;
  const hit = nineCache.get(key);
  if (hit) return hit;

  const fw = src.width;
  const fh = src.height;
  // 來源切片；邊寬蓋滿整張圖（中間為 0）時 cocos 會拉伸接縫那一行像素：留 1px 給中間
  let { l, r, t, b } = caps;
  if (l + r >= fw) {
    l = Math.floor((fw - 1) / 2);
    r = fw - 1 - l;
  }
  if (t + b >= fh) {
    t = Math.floor((fh - 1) / 2);
    b = fh - 1 - t;
  }
  const W = Math.max(1, Math.round(w * k));
  const H = Math.max(1, Math.round(h * k));
  // 目的切片（四角不縮放 = 原邊寬 × k）；框比四角小時等比縮小（與 cocos / CSS 相同）
  let L = Math.round(caps.l * k);
  let R = Math.round(caps.r * k);
  let T = Math.round(caps.t * k);
  let B = Math.round(caps.b * k);
  if (L + R > W) {
    const s = W / (L + R);
    L = Math.floor(L * s);
    R = W - L;
  }
  if (T + B > H) {
    const s = H / (T + B);
    T = Math.floor(T * s);
    B = H - T;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  const sx = [0, l, fw - r];
  const sw = [l, fw - l - r, r];
  const sy = [0, t, fh - b];
  const sh = [t, fh - t - b, b];
  const dx = [0, L, W - R];
  const dw = [L, W - L - R, R];
  const dy = [0, T, H - B];
  const dh = [T, H - T - B, B];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      if (sw[i] <= 0 || sh[j] <= 0 || dw[i] <= 0 || dh[j] <= 0) continue;
      g.drawImage(src, sx[i], sy[j], sw[i], sh[j], dx[i], dy[j], dw[i], dh[j]);
    }
  }
  const url = c.toDataURL();
  nineCache.set(key, url);
  return url;
}

/**
 * 把 atlas 影格畫進元素（元素大小 = w × h）。
 * caps 有值時以九宮格繪製（cocos Scale9Sprite：四角不縮放、邊與中間拉伸）。
 */
export function paintFrame(el: HTMLElement, ref: SpriteFrameRef | null, w: number, h: number, caps?: Scale9Caps): void {
  el.querySelector(':scope > .csd-img')?.remove();
  if (!ref) return;
  const nine = caps && (caps.l || caps.r || caps.t || caps.b);
  const url = nine ? bakeNine(ref, w, h, caps) : frameUrl(ref);
  if (!url) return;
  const img = document.createElement('div');
  img.className = 'csd-img';
  Object.assign(img.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: px(w),
    height: px(h),
    pointerEvents: 'none',
    backgroundImage: `url("${url}")`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
  });
  el.prepend(img);
}

/** BMFont 文字（DOM），回傳 [寬, 高] */
export function paintBitmapText(el: HTMLElement, font: BitmapFont, text: string): [number, number] {
  el.querySelector(':scope > .csd-bmtext')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'csd-bmtext';
  wrap.style.position = 'absolute';
  wrap.style.left = '0';
  wrap.style.top = '0';
  wrap.style.pointerEvents = 'none';
  const d = font.data;
  const page = (font.pages[0]?.image as HTMLImageElement | undefined)?.src ?? '';
  let x = 0;
  let prev = -1;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const c = d.chars.get(code);
    if (!c) continue;
    if (prev >= 0) x += d.kernings.get(`${prev},${code}`) ?? 0;
    const g = document.createElement('span');
    Object.assign(g.style, {
      position: 'absolute',
      left: px(x + c.xoffset),
      top: px(c.yoffset),
      width: px(c.width),
      height: px(c.height),
      backgroundImage: `url("${page}")`,
      backgroundPosition: `${px(-c.x)} ${px(-c.y)}`,
      backgroundSize: `${px(d.scaleW)} ${px(d.scaleH)}`,
    });
    wrap.appendChild(g);
    x += c.xadvance;
    prev = code;
  }
  el.appendChild(wrap);
  return [x, d.lineHeight];
}

export class CsdDomNode {
  readonly el: HTMLDivElement;
  readonly children: CsdDomNode[] = [];
  /** CheckBox 勾勾 / TTF 文字 / 巢狀 csd */
  check: HTMLDivElement | null = null;
  text: HTMLDivElement | null = null;
  sub: CsdDom | null = null;
  private w: number;
  private h: number;
  private checked = false;
  private enabled = true;
  /** 額外縮放（例如按鈕按下 ScaleTo 0.85），乘在 csd 縮放上、以 anchor 為中心 */
  private extraScale = 1;

  constructor(
    readonly data: CsdNode,
    private readonly lib: CsdLibrary,
  ) {
    const el = document.createElement('div');
    el.className = `csd-node csd-${data.type}`;
    el.dataset.name = data.name;
    this.el = el;
    this.w = data.width;
    this.h = data.height;
    const s = el.style;
    s.position = 'absolute';
    s.left = px(data.x);
    s.bottom = px(data.y);
    if (!data.visible) s.display = 'none';
    if (data.alpha < 255) s.opacity = String(data.alpha / 255);
    if (data.bgColor) {
      const [r, g, b, a] = data.bgColor;
      s.background = `rgba(${r},${g},${b},${a / 255})`;
    }
    if (data.clip) s.overflow = 'hidden';
    this.build();
    this.layout();
  }

  private build(): void {
    const d = this.data;
    switch (d.type) {
      case 'Sprite':
      case 'ImageView':
      case 'Button':
      case 'CheckBox': {
        const ref = this.lib.frameRef(d.file);
        if (ref && (this.w === 0 || this.h === 0)) {
          this.w = ref.frame.sourceW;
          this.h = ref.frame.sourceH;
        }
        paintFrame(this.el, ref, this.w, this.h, this.caps);
        if (d.type === 'CheckBox') {
          const node = this.lib.frameRef(d.files?.NodeNormalFileData);
          const c = document.createElement('div');
          c.className = 'csd-check';
          Object.assign(c.style, { position: 'absolute', left: '0', bottom: '0', width: px(this.w), height: px(this.h) });
          paintFrame(c, node, this.w, this.h);
          this.el.appendChild(c);
          this.check = c;
          this.setChecked(!!d.checked);
        }
        if (d.type === 'Button' || d.type === 'CheckBox' || d.touch) this.el.classList.add('ui-interactive');
        break;
      }
      case 'Text': {
        const t = document.createElement('div');
        t.className = 'csd-text';
        const st = d.textStyle ?? { fontSize: 20 };
        const [r, g, b] = d.color;
        const shadows: string[] = [];
        if (st.outline) {
          const o = Math.max(1, st.outline.size * 0.6);
          const oc = `rgb(${st.outline.color.join(',')})`;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            shadows.push(`${(Math.cos(a) * o).toFixed(1)}px ${(Math.sin(a) * o).toFixed(1)}px 0 ${oc}`);
          }
        }
        if (st.shadow) shadows.push(`${st.shadow.x}px ${-st.shadow.y}px 0 rgb(${st.shadow.color.join(',')})`);
        Object.assign(t.style, {
          position: 'absolute',
          inset: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: d.anchorX <= 0.01 ? 'flex-start' : d.anchorX >= 0.99 ? 'flex-end' : 'center',
          whiteSpace: 'nowrap',
          fontSize: px(st.fontSize),
          lineHeight: '1',
          fontWeight: '700',
          color: `rgb(${r},${g},${b})`,
          textShadow: shadows.join(','),
          pointerEvents: 'none',
        });
        t.textContent = d.text ?? '';
        this.el.appendChild(t);
        this.text = t;
        if (d.touch) this.el.classList.add('ui-interactive');
        break;
      }
      case 'TextBMFont': {
        const font = this.lib.font(d.font);
        if (font) [this.w, this.h] = paintBitmapText(this.el, font, d.text ?? '');
        break;
      }
      case 'ProjectNode': {
        const csd = d.file ? this.lib.get(d.file.path) : undefined;
        if (csd) {
          this.sub = new CsdDom(this.lib, csd);
          this.el.appendChild(this.sub.root);
        }
        break;
      }
      default:
        if (d.touch) this.el.classList.add('ui-interactive');
        break;
    }
  }

  /** 依目前尺寸套用 anchor / 旋轉 / 縮放 */
  private layout(): void {
    const d = this.data;
    const s = this.el.style;
    s.width = px(this.w);
    s.height = px(this.h);
    s.transformOrigin = `${d.anchorX * 100}% ${(1 - d.anchorY) * 100}%`;
    const parts = [`translate(${px(-d.anchorX * this.w)}, ${px(d.anchorY * this.h)})`];
    if (d.rotX) parts.push(`rotate(${d.rotX}deg)`);
    const sx = d.scaleX * this.extraScale;
    const sy = d.scaleY * this.extraScale;
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
    s.transform = parts.join(' ');
  }

  /** 額外縮放（以 anchor 為中心）；搭配 CSS transition 可做按下縮放動畫 */
  setExtraScale(scale: number): this {
    this.extraScale = scale;
    this.layout();
    return this;
  }

  get name(): string {
    return this.data.name;
  }

  private get caps(): Scale9Caps | undefined {
    return this.data.scale9 ? this.data.scale9Caps : undefined;
  }

  setVisible(v: boolean): this {
    this.el.style.display = v ? '' : 'none';
    return this;
  }

  /** Text / TextBMFont 改字 */
  setText(text: string): this {
    if (this.text) this.text.textContent = text;
    else if (this.data.type === 'TextBMFont') {
      const font = this.lib.font(this.data.font);
      if (font) {
        [this.w, this.h] = paintBitmapText(this.el, font, text);
        this.layout();
      }
    }
    return this;
  }

  /** 換圖（ImageView / Sprite） */
  setFrame(ref: SpriteFrameRef | null, keepSize = true): this {
    if (!keepSize && ref) {
      this.w = ref.frame.sourceW;
      this.h = ref.frame.sourceH;
      this.layout();
    }
    paintFrame(this.el, ref, this.w, this.h, this.caps);
    return this;
  }

  setFrameByRef(f: CsdFileRef): this {
    return this.setFrame(this.lib.frameRef(f));
  }

  setChecked(v: boolean): this {
    this.checked = v;
    if (this.check) this.check.style.display = v ? '' : 'none';
    return this;
  }

  get isChecked(): boolean {
    return this.checked;
  }

  /** Button：按下 / 停用狀態換圖 */
  setPressed(v: boolean): this {
    if (this.data.type !== 'Button' || !this.enabled) return this;
    const f = v ? this.data.files?.PressedFileData : this.data.files?.NormalFileData;
    if (f) this.setFrameByRef(f);
    return this;
  }

  setEnabled(v: boolean): this {
    this.enabled = v;
    const f = v ? this.data.files?.NormalFileData : this.data.files?.DisabledFileData;
    if (this.data.type === 'Button' && f) this.setFrameByRef(f);
    this.el.classList.toggle('csd-disabled', !v);
    return this;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get size(): { w: number; h: number } {
    return { w: this.w, h: this.h };
  }
}

export class CsdDom {
  readonly root: HTMLDivElement;
  readonly nodes: CsdDomNode[] = [];
  readonly top: CsdDomNode;

  constructor(
    private readonly lib: CsdLibrary,
    readonly csd: CsdFile,
  ) {
    this.root = document.createElement('div');
    this.root.className = `csd-root csd-${csd.name}`;
    Object.assign(this.root.style, { position: 'absolute', left: '0', bottom: '0', width: '0', height: '0' });
    this.top = this.build(csd.root, null);
    this.root.appendChild(this.top.el);
  }

  private build(data: CsdNode, parent: CsdDomNode | null): CsdDomNode {
    const n = new CsdDomNode(data, this.lib);
    this.nodes.push(n);
    if (parent) {
      parent.children.push(n);
      parent.el.appendChild(n.el);
    }
    for (const c of data.children) this.build(c, n);
    return n;
  }

  /** 依名稱找節點（from 指定時只找其子孫） */
  find(name: string, from?: CsdDomNode): CsdDomNode | undefined {
    if (!from) return this.nodes.find((n) => n.name === name);
    const stack = [...from.children];
    while (stack.length) {
      const n = stack.shift()!;
      if (n.name === name) return n;
      stack.push(...n.children);
    }
    return undefined;
  }

  dispose(): void {
    this.root.remove();
  }
}
