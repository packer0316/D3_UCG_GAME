/**
 * Cocos Studio .csb（FlatBuffers 二進位）→ 與 CsdParser 相同的 CsdFile 結構，交給 CsdPlayer 播放。
 *
 * Schema：cocos2d-x cocos/editor-support/cocostudio/fbs-files/CSParseBinary.fbs
 * 讀法對照 CSLoader::nodeWithFlatBuffers、各 WidgetReader::setPropsWithFlatBuffers、
 * ActionTimelineCache::loadTimelineWithFlatBuffers。
 *
 * 注意：
 * - NodeTree.options.data 依 classname 指向不同 table：根節點 "Node" 直接是 WidgetOptions，
 *   其他（SingleNode / Sprite / ProjectNode…）是各自的 XxxOptions，欄位 0 才是 WidgetOptions。
 * - csb 引用的子檔（ProjectNode）副檔名是 .csb。
 * - 欄位順序以「Cocos Studio 編輯器輸出」的 schema 為準（csb version 2.1.0.0）：與引擎 fbs 只差在
 *   TextOptions / ButtonOptions 沒有 isLocalized（TextBMFont 的 isLocalized 在最後，不影響）。
 *   已用同一份 UI 的 csd 原始檔對照驗證（tests/csb.test.ts）。
 * - ImageView 九宮格：csb 只存 capInsets 矩形，換算左右上下邊寬需要原圖尺寸 → 不輸出 scale9Caps
 *   （CsdPlayer 也沒用到，只用 scale9 旗標）。
 *
 * 同 CsdParser：會被 tools/copy-assets.mjs 以 Node 直接載入，只能 import type、只用可抹除的 TS 語法。
 */
import type { CsdAnimation, CsdFile, CsdFileRef, CsdFrame, CsdNode, CsdNodeType, CsdTextStyle, CsdTimeline } from './CsdParser';

// ---------------------------------------------------------------------------
// 最小 FlatBuffers 讀取器（little-endian）
// ---------------------------------------------------------------------------
class Table {
  private readonly dv: DataView;
  readonly pos: number;
  private readonly vt: number;
  private readonly vtSize: number;

  constructor(dv: DataView, pos: number) {
    this.dv = dv;
    this.pos = pos;
    this.vt = pos - dv.getInt32(pos, true);
    this.vtSize = dv.getUint16(this.vt, true);
  }

  /** 欄位在 table 內的位移；0 = 未寫入（取預設值） */
  private off(field: number): number {
    const o = 4 + field * 2;
    return o < this.vtSize ? this.dv.getUint16(this.vt + o, true) : 0;
  }

  has(field: number): boolean {
    return this.off(field) !== 0;
  }

  int(field: number, d = 0): number {
    const o = this.off(field);
    return o ? this.dv.getInt32(this.pos + o, true) : d;
  }

  float(field: number, d = 0): number {
    const o = this.off(field);
    return o ? this.dv.getFloat32(this.pos + o, true) : d;
  }

  ubyte(field: number, d = 0): number {
    const o = this.off(field);
    return o ? this.dv.getUint8(this.pos + o) : d;
  }

  bool(field: number, d = false): boolean {
    const o = this.off(field);
    return o ? this.dv.getUint8(this.pos + o) !== 0 : d;
  }

  /** inline struct 的起點；未寫入回傳 -1 */
  struct(field: number): number {
    const o = this.off(field);
    return o ? this.pos + o : -1;
  }

  private ref(field: number): number {
    const o = this.off(field);
    if (!o) return -1;
    const p = this.pos + o;
    return p + this.dv.getUint32(p, true);
  }

  table(field: number): Table | null {
    const p = this.ref(field);
    return p < 0 ? null : new Table(this.dv, p);
  }

  string(field: number, d = ''): string {
    const p = this.ref(field);
    if (p < 0) return d;
    const len = this.dv.getUint32(p, true);
    return utf8.decode(new Uint8Array(this.dv.buffer, this.dv.byteOffset + p + 4, len));
  }

  /** 向量：回傳 [元素起點, 長度] */
  private vec(field: number): [number, number] {
    const p = this.ref(field);
    return p < 0 ? [0, 0] : [p + 4, this.dv.getUint32(p, true)];
  }

  tables(field: number): Table[] {
    const [start, n] = this.vec(field);
    const out: Table[] = [];
    for (let i = 0; i < n; i++) {
      const e = start + i * 4;
      out.push(new Table(this.dv, e + this.dv.getUint32(e, true)));
    }
    return out;
  }

  strings(field: number): string[] {
    const [start, n] = this.vec(field);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = start + i * 4;
      const p = e + this.dv.getUint32(e, true);
      out.push(utf8.decode(new Uint8Array(this.dv.buffer, this.dv.byteOffset + p + 4, this.dv.getUint32(p, true))));
    }
    return out;
  }

  /** struct 向量：回傳每個元素起點 */
  structs(field: number, size: number): number[] {
    const [start, n] = this.vec(field);
    return Array.from({ length: n }, (_, i) => start + i * size);
  }

  f32(p: number): number {
    return this.dv.getFloat32(p, true);
  }

  i32(p: number): number {
    return this.dv.getInt32(p, true);
  }

  u8(p: number): number {
    return this.dv.getUint8(p);
  }
}

const utf8 = new TextDecoder('utf-8');

// ---------------------------------------------------------------------------
// 欄位編號（CSParseBinary.fbs 宣告順序）
// ---------------------------------------------------------------------------
const W = {
  name: 0,
  actionTag: 1,
  rotationSkew: 2,
  zOrder: 3,
  visible: 4,
  alpha: 5,
  tag: 6,
  position: 7,
  scale: 8,
  anchorPoint: 9,
  color: 10,
  size: 11,
  flipX: 12,
  flipY: 13,
  ignoreSize: 14,
  touchEnabled: 15,
} as const;

/** classname → CsdNodeType */
const CLASS: Record<string, CsdNodeType> = {
  Node: 'Node',
  SingleNode: 'Node',
  Layer: 'Layer',
  Sprite: 'Sprite',
  ImageView: 'ImageView',
  TextBMFont: 'TextBMFont',
  Text: 'Text',
  ProjectNode: 'ProjectNode',
  Particle: 'Particle',
  Panel: 'Panel',
  Button: 'Button',
  CheckBox: 'CheckBox',
  // CsdParser 也沒有獨立類型：當 Node，貼圖放在 files.ImageFileData
  LoadingBar: 'Node',
};

/** ResourceData { path, plistFile, resourceType }：0 = 散圖（Normal / Default）、1 = plist 子圖 */
function resource(t: Table | null): CsdFileRef | undefined {
  if (!t) return undefined;
  const path = t.string(0);
  if (!path) return undefined;
  const plist = t.string(1);
  if (t.int(2) === 1) return plist ? { type: 'PlistSubImage', path, plist } : { type: 'PlistSubImage', path };
  return { type: path.startsWith('Default/') ? 'Default' : 'Normal', path };
}

const rgbAt = (t: Table, p: number): [number, number, number] => [t.u8(p + 1), t.u8(p + 2), t.u8(p + 3)];

function parseNode(tree: Table, warn: (msg: string) => void): CsdNode {
  const classname = tree.string(0);
  const custom = tree.string(3);
  const type = CLASS[classname] ?? 'Node';
  if (!CLASS[classname]) warn(`csb: 未支援的節點類型 ${classname}${custom ? ` (${custom})` : ''}，以 Node 處理`);
  const data = tree.table(2)?.table(0) ?? null;
  // 根節點 "Node"（NodeReader）的 data 本身就是 WidgetOptions；其他類型欄位 0 才是
  const opts = data && classname !== 'Node' ? data : null;
  const w = (opts ? opts.table(0) : data) ?? null;

  const defaultAnchor = type === 'Sprite' || type === 'ImageView' || type === 'TextBMFont' || type === 'Text' || type === 'Button' ? 0.5 : 0;
  const node: CsdNode = {
    name: '',
    type,
    tag: 0,
    actionTag: 0,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotX: 0,
    rotY: 0,
    anchorX: defaultAnchor,
    anchorY: defaultAnchor,
    width: 0,
    height: 0,
    alpha: 255,
    visible: true,
    color: [255, 255, 255],
    flipX: false,
    flipY: false,
    children: [],
  };
  if (w) {
    node.name = w.string(W.name);
    node.actionTag = w.int(W.actionTag);
    node.tag = w.int(W.tag);
    node.visible = w.bool(W.visible, true);
    node.alpha = w.ubyte(W.alpha, 255);
    node.flipX = w.bool(W.flipX);
    node.flipY = w.bool(W.flipY);
    if (w.bool(W.touchEnabled)) node.touch = true;
    let p = w.struct(W.rotationSkew);
    if (p >= 0) [node.rotX, node.rotY] = [w.f32(p), w.f32(p + 4)];
    p = w.struct(W.position);
    if (p >= 0) [node.x, node.y] = [w.f32(p), w.f32(p + 4)];
    p = w.struct(W.scale);
    if (p >= 0) [node.scaleX, node.scaleY] = [w.f32(p), w.f32(p + 4)];
    p = w.struct(W.anchorPoint);
    if (p >= 0) [node.anchorX, node.anchorY] = [w.f32(p), w.f32(p + 4)];
    p = w.struct(W.color);
    if (p >= 0) node.color = rgbAt(w, p);
    p = w.struct(W.size);
    if (p >= 0) [node.width, node.height] = [w.f32(p), w.f32(p + 4)];
  }

  if (opts) {
    const files: Record<string, CsdFileRef> = {};
    const addFile = (key: string, field: number) => {
      const f = resource(opts.table(field));
      if (f) files[key] = f;
    };
    switch (type) {
      case 'Sprite':
      case 'Particle': {
        node.file = resource(opts.table(1));
        const b = opts.struct(2);
        if (b >= 0) node.blend = [opts.i32(b), opts.i32(b + 4)];
        break;
      }
      case 'ImageView':
        node.file = resource(opts.table(1));
        if (opts.bool(4)) node.scale9 = true;
        break;
      case 'TextBMFont': {
        const font = resource(opts.table(1));
        if (font) node.font = { type: 'Normal', path: font.path };
        node.text = opts.string(2);
        break;
      }
      case 'ProjectNode': {
        const path = opts.string(1);
        if (path) node.file = { type: 'Normal', path };
        if (opts.has(2)) node.innerActionSpeed = opts.float(2);
        break;
      }
      case 'Text': {
        // 編輯器輸出的 csb（2.1.0.0）沒有 isLocalized 欄位：text 之後的欄位比引擎 fbs 少 1
        const style: CsdTextStyle = { fontSize: opts.int(3, 20) };
        const h = opts.int(7);
        if (h) style.hAlign = h === 1 ? 'HT_Center' : h === 2 ? 'HT_Right' : 'HT_Left';
        if (opts.bool(11)) {
          const c = opts.struct(12);
          style.outline = { size: opts.int(13, 1), color: c >= 0 ? rgbAt(opts, c) : [0, 0, 0] };
        }
        if (opts.bool(14)) {
          const c = opts.struct(15);
          style.shadow = { color: c >= 0 ? rgbAt(opts, c) : [0, 0, 0], x: opts.float(16, 2), y: opts.float(17, -2) };
        }
        node.textStyle = style;
        node.text = opts.string(4);
        node.fontSize = style.fontSize;
        break;
      }
      case 'Panel':
      case 'Layer': {
        node.file = resource(opts.table(1));
        if (opts.bool(2)) node.clip = true;
        // colorType 1 = 單色背景
        const c = opts.struct(3);
        const a = opts.ubyte(7, 255);
        if (opts.int(6) === 1 && c >= 0 && a > 0) node.bgColor = [...rgbAt(opts, c), a];
        break;
      }
      case 'Button': {
        addFile('NormalFileData', 1);
        addFile('PressedFileData', 2);
        addFile('DisabledFileData', 3);
        node.file = files.NormalFileData;
        // 同 Text：沒有 isLocalized，fontName 6 / fontSize 7 / textColor 8 / scale9Enabled 11
        const style: CsdTextStyle = { fontSize: opts.int(7, 20) };
        const tc = opts.struct(8);
        if (tc >= 0) style.color = rgbAt(opts, tc);
        node.textStyle = style;
        if (opts.has(7)) node.fontSize = style.fontSize;
        const label = opts.string(5);
        if (label) node.text = label;
        if (opts.bool(11)) node.scale9 = true;
        break;
      }
      case 'CheckBox':
        addFile('NormalBackFileData', 1);
        addFile('PressedBackFileData', 2);
        addFile('NodeNormalFileData', 3);
        addFile('DisableBackFileData', 4);
        addFile('NodeDisableFileData', 5);
        node.file = files.NormalBackFileData;
        node.checked = opts.bool(6, true);
        break;
      default:
        if (classname === 'LoadingBar') addFile('ImageFileData', 1);
        break;
    }
    if (!node.file) delete node.file;
    if (Object.keys(files).length) node.files = files;
  }

  for (const c of tree.tables(1)) node.children.push(parseNode(c, warn));
  return node;
}

/** Frame table 的子 frame 欄位（依 property） */
const FRAME_FIELD: Record<string, number> = {
  Position: 0,
  Scale: 1,
  RotationSkew: 1,
  AnchorPoint: 1,
  CColor: 2,
  FileData: 3,
  FrameEvent: 4,
  Alpha: 5,
  ZOrder: 5,
  VisibleForFrame: 6,
  ActionValue: 7,
  BlendFunc: 8,
};

/** InnerActionFrame 值（ActionValue 時間軸）：控制 ProjectNode 子動畫 */
export interface CsdInnerAction {
  /** 0 = LoopAction、1 = NoLoopAction、2 = SingleFrame */
  type: number;
  /** 子動畫名稱；"-- ALL --" = 整條 */
  name: string;
  /** SingleFrame 時停在第幾格 */
  single: number;
}

function parseFrame(prop: string, f: Table): CsdFrame | null {
  const field = FRAME_FIELD[prop];
  if (field === undefined) return null;
  const s = f.table(field);
  if (!s) return null;
  const frame: CsdFrame = { i: s.int(0), tween: s.bool(1, true), ease: 0, v: null };
  // InnerActionFrame 的 easingData 在第 5 欄，其他都在第 3 欄
  const easing = s.table(prop === 'ActionValue' ? 5 : 3);
  if (easing) {
    frame.ease = easing.int(0, -1);
    if (frame.ease === -1) {
      const pts = easing.structs(1, 8);
      if (pts.length) frame.easePts = pts.flatMap((p) => [easing.f32(p), easing.f32(p + 4)]);
    }
  }
  switch (prop) {
    case 'Position':
    case 'Scale':
    case 'RotationSkew':
    case 'AnchorPoint': {
      const p = s.struct(2);
      frame.v = p >= 0 ? { x: s.f32(p), y: s.f32(p + 4) } : { x: 0, y: 0 };
      break;
    }
    case 'CColor': {
      const p = s.struct(2);
      frame.v = p >= 0 ? [s.u8(p), s.u8(p + 1), s.u8(p + 2), s.u8(p + 3)] : [255, 255, 255, 255];
      break;
    }
    case 'Alpha':
    case 'ZOrder':
      frame.v = s.int(2);
      break;
    case 'VisibleForFrame':
      frame.v = s.bool(2, true);
      frame.tween = false;
      break;
    case 'FileData':
      frame.v = resource(s.table(2)) ?? null;
      frame.tween = false;
      break;
    case 'FrameEvent':
      frame.v = s.string(2);
      frame.tween = false;
      break;
    case 'BlendFunc': {
      const p = s.struct(2);
      frame.v = p >= 0 ? [s.i32(p), s.i32(p + 4)] : [1, 771];
      frame.tween = false;
      break;
    }
    case 'ActionValue': {
      const v: CsdInnerAction = { type: s.int(2), name: s.string(3), single: s.int(4) };
      frame.v = v;
      frame.tween = false;
      break;
    }
  }
  return frame;
}

export function parseCsb(buf: ArrayBuffer | Uint8Array, name = '', warn: (msg: string) => void = () => {}): CsdFile {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const root = new Table(dv, dv.getUint32(0, true));
  const tree = root.table(3);
  if (!tree) throw new Error('csb: nodeTree not found');

  const action = root.table(4);
  const timelines: CsdTimeline[] = [];
  if (action) {
    for (const tl of action.tables(2)) {
      const prop = tl.string(0);
      if (FRAME_FIELD[prop] === undefined) {
        warn(`csb: 未支援的時間軸屬性 ${prop}`);
        continue;
      }
      const frames = tl
        .tables(2)
        .map((f) => parseFrame(prop, f))
        .filter((f): f is CsdFrame => f !== null)
        .sort((a, b) => a.i - b.i);
      if (frames.length) timelines.push({ tag: tl.int(1), prop, frames });
    }
  }
  const animations: CsdAnimation[] = root.tables(5).map((a) => ({ name: a.string(0), start: a.int(1), end: a.int(2) }));
  return {
    name,
    duration: action?.int(0) ?? 0,
    speed: action?.float(1, 1) || 1,
    animations,
    timelines,
    root: parseNode(tree, warn),
  };
}
