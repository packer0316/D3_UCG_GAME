/**
 * Cocos Studio .csd（XML）→ JSON 的解析器 — 純資料、不依賴 three.js。
 *
 * 同時被 tools/copy-assets.mjs 以 Node 直接載入（type stripping），
 * 因此不可 import 其他模組，只能用可抹除的 TS 語法（不用 enum / parameter properties）。
 */

export type CsdNodeType =
  | 'Node'
  | 'Sprite'
  | 'ImageView'
  | 'TextBMFont'
  | 'Text'
  | 'ProjectNode'
  | 'Particle'
  | 'Panel'
  | 'Button'
  | 'CheckBox'
  | 'Layer';

export interface CsdTextStyle {
  fontSize: number;
  outline?: { size: number; color: [number, number, number] };
  shadow?: { color: [number, number, number]; x: number; y: number };
  /** 水平 / 垂直對齊（HorizontalAlignmentType / VerticalAlignmentType） */
  hAlign?: string;
  /** Button 文字顏色 */
  color?: [number, number, number];
}

export interface CsdFileRef {
  /** PlistSubImage / Normal / Default / MarkedSubImage */
  type: string;
  path: string;
  plist?: string;
}

export interface CsdNode {
  name: string;
  type: CsdNodeType;
  tag: number;
  actionTag: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotX: number;
  rotY: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  /** 0..255 */
  alpha: number;
  visible: boolean;
  /** [r,g,b] 0..255 */
  color: [number, number, number];
  flipX: boolean;
  flipY: boolean;
  file?: CsdFileRef;
  /** [src, dst] GL blend 常數 */
  blend?: [number, number];
  /** TextBMFont / Text */
  text?: string;
  font?: CsdFileRef;
  fontSize?: number;
  scale9?: boolean;
  scale9Caps?: { l: number; r: number; t: number; b: number };
  innerActionSpeed?: number;
  /** 所有 *FileData（Button：Normal/Pressed/Disabled；CheckBox：NormalBack/NodeNormal…） */
  files?: Record<string, CsdFileRef>;
  /** Text（TTF）樣式 */
  textStyle?: CsdTextStyle;
  /** 可點擊（TouchEnable） */
  touch?: boolean;
  /** CheckBox 預設勾選 */
  checked?: boolean;
  /** Panel 單色背景 [r,g,b,a]（0..255） */
  bgColor?: [number, number, number, number];
  /** Panel 裁切子節點（ClipAble） */
  clip?: boolean;
  children: CsdNode[];
}

export interface CsdFrame {
  /** 影格（60fps） */
  i: number;
  /** false = 階梯（不補間） */
  tween: boolean;
  /** cocos tweenfunc 類型 */
  ease: number;
  /** 自訂曲線控制點（ease = -1） */
  easePts?: number[];
  // 依屬性不同：{x,y} | number | boolean | CsdFileRef | [src,dst] | [a,r,g,b] | string
  v: unknown;
}

export interface CsdTimeline {
  tag: number;
  prop: string;
  frames: CsdFrame[];
}

export interface CsdAnimation {
  name: string;
  start: number;
  end: number;
}

export interface CsdFile {
  name: string;
  duration: number;
  speed: number;
  animations: CsdAnimation[];
  timelines: CsdTimeline[];
  root: CsdNode;
}

// ---------------------------------------------------------------------------
// 迷你 XML 解析（csd 沒有 CDATA / DTD；只需要元素與屬性）
// ---------------------------------------------------------------------------
export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlEl[];
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m) => {
    if (ENTITIES[m]) return ENTITIES[m];
    if (m.startsWith('&#x')) return String.fromCodePoint(parseInt(m.slice(3, -1), 16));
    if (m.startsWith('&#')) return String.fromCodePoint(parseInt(m.slice(2, -1), 10));
    return m;
  });

export function parseXml(text: string): XmlEl {
  const root: XmlEl = { name: '#root', attrs: {}, children: [] };
  const stack: XmlEl[] = [root];
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
  const attrRe = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text))) {
    if (!m[2]) continue; // <?xml?> / 註解
    const [, closing, name, attrText, selfClose] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const el: XmlEl = { name, attrs: {}, children: [] };
    let a: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(attrText))) el.attrs[a[1]] = decode(a[2]);
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

const child = (el: XmlEl, name: string) => el.children.find((c) => c.name === name);
const num = (v: string | undefined, d = 0) => (v === undefined || v === '' ? d : Number(v));
const bool = (v: string | undefined, d: boolean) => (v === undefined ? d : v === 'True' || v === 'true');

function fileRef(el: XmlEl | undefined): CsdFileRef | undefined {
  if (!el) return undefined;
  const path = el.attrs.Path ?? '';
  if (!path) return undefined;
  const ref: CsdFileRef = { type: el.attrs.Type ?? 'Normal', path };
  if (el.attrs.Plist) ref.plist = el.attrs.Plist;
  return ref;
}

const CTYPE: Record<string, CsdNodeType> = {
  GameNodeObjectData: 'Node',
  SingleNodeObjectData: 'Node',
  GameLayerObjectData: 'Layer',
  SpriteObjectData: 'Sprite',
  ImageViewObjectData: 'ImageView',
  TextBMFontObjectData: 'TextBMFont',
  TextObjectData: 'Text',
  ProjectNodeObjectData: 'ProjectNode',
  ParticleObjectData: 'Particle',
  PanelObjectData: 'Panel',
  ButtonObjectData: 'Button',
  CheckBoxObjectData: 'CheckBox',
};

const rgb = (el: XmlEl | undefined, d: [number, number, number]): [number, number, number] =>
  el ? [num(el.attrs.R, d[0]), num(el.attrs.G, d[1]), num(el.attrs.B, d[2])] : d;

function parseNode(el: XmlEl): CsdNode {
  const a = el.attrs;
  const type = CTYPE[a.ctype ?? ''] ?? 'Node';
  const size = child(el, 'Size');
  const anchor = child(el, 'AnchorPoint');
  const pos = child(el, 'Position');
  const scale = child(el, 'Scale');
  const color = child(el, 'CColor');
  const blend = child(el, 'BlendFunc');
  const defaultAnchor = type === 'Sprite' || type === 'ImageView' || type === 'TextBMFont' || type === 'Text' || type === 'Button' ? 0.5 : 0;
  const node: CsdNode = {
    name: a.Name ?? '',
    type,
    tag: num(a.Tag),
    actionTag: num(a.ActionTag),
    x: num(pos?.attrs.X),
    y: num(pos?.attrs.Y),
    scaleX: num(scale?.attrs.ScaleX, 1),
    scaleY: num(scale?.attrs.ScaleY, 1),
    rotX: num(a.RotationSkewX),
    rotY: num(a.RotationSkewY),
    anchorX: anchor ? num(anchor.attrs.ScaleX) : defaultAnchor,
    anchorY: anchor ? num(anchor.attrs.ScaleY) : defaultAnchor,
    width: num(size?.attrs.X),
    height: num(size?.attrs.Y),
    alpha: num(a.Alpha, 255),
    visible: bool(a.VisibleForFrame, true),
    color: [num(color?.attrs.R, 255), num(color?.attrs.G, 255), num(color?.attrs.B, 255)],
    flipX: bool(a.FlipX, false),
    flipY: bool(a.FlipY, false),
    children: [],
  };
  const file =
    fileRef(child(el, 'FileData')) ??
    fileRef(child(el, 'NormalFileData')) ?? // Button
    fileRef(child(el, 'NormalBackFileData')) ?? // CheckBox
    fileRef(child(el, 'BackGroundImageData')); // Panel
  if (file) node.file = file;
  const files: Record<string, CsdFileRef> = {};
  for (const c of el.children) {
    if (!c.name.endsWith('FileData') || c.name === 'FileData') continue;
    const f = fileRef(c);
    if (f) files[c.name] = f;
  }
  if (Object.keys(files).length) node.files = files;
  if (type === 'Text' || type === 'Button') {
    const style: CsdTextStyle = { fontSize: num(a.FontSize, 20) };
    if (a.OutlineEnabled === 'True') style.outline = { size: num(a.OutlineSize, 1), color: rgb(child(el, 'OutlineColor'), [0, 0, 0]) };
    if (a.ShadowEnabled === 'True')
      style.shadow = { color: rgb(child(el, 'ShadowColor'), [0, 0, 0]), x: num(a.ShadowOffsetX, 2), y: num(a.ShadowOffsetY, -2) };
    if (a.HorizontalAlignmentType) style.hAlign = a.HorizontalAlignmentType;
    // Button 的文字顏色在 <TextColor>（Text 的文字顏色就是 CColor）
    const tc = child(el, 'TextColor');
    if (tc) style.color = rgb(tc, [255, 255, 255]);
    node.textStyle = style;
  }
  if (a.TouchEnable === 'True') node.touch = true;
  if (type === 'Panel' || type === 'Layer') {
    // ComboBoxIndex 1 = 單色背景（SingleColor + BackColorAlpha）
    if (a.ComboBoxIndex === '1' && num(a.BackColorAlpha, 255) > 0) {
      const c = rgb(child(el, 'SingleColor'), [255, 255, 255]);
      node.bgColor = [c[0], c[1], c[2], num(a.BackColorAlpha, 255)];
    }
    if (a.ClipAble === 'True') node.clip = true;
  }
  if (type === 'CheckBox') node.checked = a.CheckedState === 'True';
  if (blend) node.blend = [num(blend.attrs.Src, 1), num(blend.attrs.Dst, 771)];
  if (a.LabelText !== undefined) node.text = a.LabelText;
  const font = fileRef(child(el, 'LabelBMFontFile_CNB'));
  if (font) node.font = font;
  if (a.FontSize) node.fontSize = num(a.FontSize);
  if (a.Scale9Enable === 'True') {
    node.scale9 = true;
    // 九宮格邊寬（原圖像素）：LeftEage / RightEage / TopEage / BottomEage
    node.scale9Caps = { l: num(a.LeftEage), r: num(a.RightEage), t: num(a.TopEage), b: num(a.BottomEage) };
  }
  if (a.InnerActionSpeed) node.innerActionSpeed = num(a.InnerActionSpeed, 1);
  const kids = child(el, 'Children');
  if (kids) for (const k of kids.children) if (k.name === 'AbstractNodeData') node.children.push(parseNode(k));
  return node;
}

function parseFrame(el: XmlEl, prop: string): CsdFrame {
  const a = el.attrs;
  const easing = child(el, 'EasingData');
  const frame: CsdFrame = {
    i: num(a.FrameIndex),
    tween: bool(a.Tween, true),
    ease: num(easing?.attrs.Type, 0),
    v: null,
  };
  if (frame.ease === -1 && easing) {
    const pts = child(easing, 'Points');
    if (pts) frame.easePts = pts.children.flatMap((p) => [num(p.attrs.X), num(p.attrs.Y)]);
  }
  switch (el.name) {
    case 'PointFrame':
    case 'ScaleFrame':
      frame.v = { x: num(a.X), y: num(a.Y) };
      break;
    case 'IntFrame':
      frame.v = num(a.Value);
      break;
    case 'BoolFrame':
      frame.v = bool(a.Value, true);
      frame.tween = false;
      break;
    case 'TextureFrame':
      frame.v = fileRef(child(el, 'TextureFile')) ?? null;
      frame.tween = false;
      break;
    case 'BlendFuncFrame':
      frame.v = [num(a.Src, 1), num(a.Dst, 771)];
      frame.tween = false;
      break;
    case 'ColorFrame': {
      const c = child(el, 'Color');
      frame.v = [num(c?.attrs.A, 255), num(c?.attrs.R, 255), num(c?.attrs.G, 255), num(c?.attrs.B, 255)];
      break;
    }
    case 'EventFrame':
      frame.v = a.Value ?? '';
      frame.tween = false;
      break;
    default:
      frame.v = a.Value ?? null;
      frame.tween = false;
  }
  // AnchorPoint 也是 ScaleFrame
  if (prop === 'AnchorPoint' && el.name === 'ScaleFrame') frame.v = { x: num(a.X), y: num(a.Y) };
  return frame;
}

export function parseCsd(xml: string): CsdFile {
  const doc = parseXml(xml);
  const game = child(doc, 'GameFile');
  if (!game) throw new Error('csd: <GameFile> not found');
  const group = child(game, 'PropertyGroup');
  const outer = child(game, 'Content');
  const content = outer ? child(outer, 'Content') : undefined;
  if (!content) throw new Error('csd: <Content> not found');
  const anim = child(content, 'Animation');
  const timelines: CsdTimeline[] = [];
  if (anim) {
    for (const tl of anim.children) {
      if (tl.name !== 'Timeline') continue;
      const prop = tl.attrs.Property ?? '';
      const frames = tl.children.map((f) => parseFrame(f, prop)).sort((x, y) => x.i - y.i);
      if (frames.length) timelines.push({ tag: num(tl.attrs.ActionTag), prop, frames });
    }
  }
  const list = child(content, 'AnimationList');
  const animations: CsdAnimation[] = (list?.children ?? [])
    .filter((c) => c.name === 'AnimationInfo')
    .map((c) => ({ name: c.attrs.Name ?? '', start: num(c.attrs.StartIndex), end: num(c.attrs.EndIndex) }));
  const obj = child(content, 'ObjectData');
  if (!obj) throw new Error('csd: <ObjectData> not found');
  return {
    name: group?.attrs.Name ?? '',
    duration: num(anim?.attrs.Duration),
    speed: num(anim?.attrs.Speed, 1),
    animations,
    timelines,
    root: parseNode(obj),
  };
}

export interface CsdDeps {
  plists: Set<string>;
  images: Set<string>;
  fonts: Set<string>;
  csds: Set<string>;
  particles: Set<string>;
}

/** 列出相依資源（路徑相對於 cocosstudio 根目錄，例如 DinosaurExport/plist/common.plist） */
export function listCsdDeps(csd: CsdFile): CsdDeps {
  const deps: CsdDeps = { plists: new Set(), images: new Set(), fonts: new Set(), csds: new Set(), particles: new Set() };
  const addFile = (f: CsdFileRef | undefined | null, nodeType?: CsdNodeType) => {
    if (!f || !f.path || f.type === 'Default') return;
    if (f.plist) deps.plists.add(f.plist);
    else if (f.path.endsWith('.csd') || f.path.endsWith('.csb')) deps.csds.add(f.path);
    else if (nodeType === 'Particle' || f.path.endsWith('.plist')) deps.particles.add(f.path);
    else if (f.type === 'Normal') deps.images.add(f.path);
  };
  const walk = (n: CsdNode) => {
    addFile(n.file, n.type);
    if (n.files) for (const f of Object.values(n.files)) addFile(f, n.type);
    if (n.font) deps.fonts.add(n.font.path);
    n.children.forEach(walk);
  };
  walk(csd.root);
  for (const tl of csd.timelines) if (tl.prop === 'FileData') for (const f of tl.frames) addFile(f.v as CsdFileRef | null);
  return deps;
}
