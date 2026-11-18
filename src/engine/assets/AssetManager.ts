/**
 * 資源管理：路徑解析、快取、預載。
 *
 * 路徑一律使用「原版資源相對路徑」，例如 `Models/Dinosaur/Egg_01.c3b`；
 * 也接受原版 Lua 寫法 `DragonTycoon3Resource/Models/...`（會自動去掉前綴）。
 * 實際 URL = `${base}res/<path>`（檔案由 tools/copy-assets.mjs 複製到 public/res）。
 */
import * as THREE from 'three';
import { loadC3b, type C3bModelTemplate } from '../loaders/C3bLoader';
import { parseFnt, type FntData } from '../loaders/FntLoader';

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  offsetX: number;
  offsetY: number;
  sourceW: number;
  sourceH: number;
}

export interface Atlas {
  url: string;
  texture: THREE.Texture;
  size: { w: number; h: number };
  frames: Record<string, AtlasFrame>;
}

export interface BitmapFont {
  url: string;
  data: FntData;
  pages: THREE.Texture[];
}

const RES_PREFIX = /^(?:\.\/)?(?:DragonTycoon3Resource\/)?/;

export class AssetManager {
  readonly baseUrl: string;
  private textureLoader = new THREE.TextureLoader();
  private cache = new Map<string, Promise<unknown>>();

  constructor(baseUrl = import.meta.env.BASE_URL) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  /** 原版路徑 → URL */
  url(path: string): string {
    if (/^(https?:|blob:|data:|\/)/.test(path)) return path;
    // 已經解析過的 URL（相對 base「./」建置時，c3b 的貼圖路徑 = 模型 URL 的資料夾 + 檔名），不再加一次 res/
    if (this.baseUrl !== '/' && path.startsWith(`${this.baseUrl}res/`)) return path;
    return `${this.baseUrl}res/${path.replace(/\\/g, '/').replace(RES_PREFIX, '')}`;
  }

  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load();
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  /** 已完成載入的資源（同步取用；未載入則 undefined） */
  private resolved = new Map<string, unknown>();
  peek<T>(key: string): T | undefined {
    return this.resolved.get(key) as T | undefined;
  }
  private track<T>(key: string, p: Promise<T>): Promise<T> {
    return p.then((v) => {
      this.resolved.set(key, v);
      return v;
    });
  }

  texture(path: string): Promise<THREE.Texture> {
    const url = this.url(path);
    return this.memo(`tex:${url}`, () =>
      this.track(
        `tex:${url}`,
        this.textureLoader.loadAsync(url).then((t) => {
          t.colorSpace = THREE.NoColorSpace; // 與 Cocos 相同：不做色彩管理
          t.generateMipmaps = true;
          t.anisotropy = 4;
          return t;
        }),
      ),
    );
  }

  json<T = unknown>(path: string): Promise<T> {
    const url = this.url(path);
    return this.memo(`json:${url}`, () =>
      this.track(
        `json:${url}`,
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
          return r.json() as Promise<T>;
        }),
      ),
    );
  }

  text(path: string): Promise<string> {
    const url = this.url(path);
    return this.memo(`text:${url}`, () => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${url}: ${r.status}`)))));
  }

  arrayBuffer(path: string): Promise<ArrayBuffer> {
    const url = this.url(path);
    return this.memo(`bin:${url}`, () => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`)))));
  }

  model(path: string): Promise<C3bModelTemplate> {
    const url = this.url(path);
    return this.memo(`c3b:${url}`, () =>
      this.track(`c3b:${url}`, loadC3b(url, { loadTexture: (u) => this.texture(u) })),
    );
  }

  peekModel(path: string): C3bModelTemplate | undefined {
    return this.peek(`c3b:${this.url(path)}`);
  }

  /** TexturePacker plist（複製工具已轉成 *.plist.json） */
  atlas(plistPath: string): Promise<Atlas> {
    const url = this.url(plistPath);
    return this.memo(`atlas:${url}`, () =>
      this.track(
        `atlas:${url}`,
        (async () => {
          const json = await this.json<{ image: string; size: { w: number; h: number }; frames: Record<string, AtlasFrame> }>(
            plistPath + '.json',
          );
          const dir = plistPath.slice(0, plistPath.lastIndexOf('/') + 1);
          const texture = await this.texture(dir + json.image);
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          return { url, texture, size: json.size, frames: json.frames };
        })(),
      ),
    );
  }

  peekAtlas(plistPath: string): Atlas | undefined {
    return this.peek(`atlas:${this.url(plistPath)}`);
  }

  font(fntPath: string): Promise<BitmapFont> {
    const url = this.url(fntPath);
    return this.memo(`fnt:${url}`, () =>
      this.track(
        `fnt:${url}`,
        (async () => {
          const data = parseFnt(await this.text(fntPath));
          const dir = fntPath.slice(0, fntPath.lastIndexOf('/') + 1);
          const pages = await Promise.all(
            data.pages.map(async (p) => {
              const t = await this.texture(dir + p);
              t.generateMipmaps = false;
              t.minFilter = THREE.LinearFilter;
              t.needsUpdate = true;
              return t;
            }),
          );
          return { url, data, pages };
        })(),
      ),
    );
  }

  peekFont(fntPath: string): BitmapFont | undefined {
    return this.peek(`fnt:${this.url(fntPath)}`);
  }

  /** 單張圖片包成只有一個 frame（名稱 = 路徑）的 atlas，讓 Sprite2D 共用同一套介面 */
  imageAtlas(path: string): Promise<Atlas> {
    const url = this.url(path);
    return this.memo(`imgatlas:${url}`, () =>
      this.track(
        `imgatlas:${url}`,
        this.texture(path).then((texture) => {
          const img = texture.image as { width: number; height: number };
          const w = img.width;
          const h = img.height;
          return {
            url,
            texture,
            size: { w, h },
            frames: { [path]: { x: 0, y: 0, w, h, rotated: false, offsetX: 0, offsetY: 0, sourceW: w, sourceH: h } },
          };
        }),
      ),
    );
  }

  peekImageAtlas(path: string): Atlas | undefined {
    return this.peek(`imgatlas:${this.url(path)}`);
  }

  /** 找出某 frame 在哪張已載入的 atlas（原版 SpriteFrameCache 行為） */
  findFrame(frameName: string): { atlas: Atlas; frame: AtlasFrame } | null {
    for (const [k, v] of this.resolved) {
      if (!k.startsWith('atlas:')) continue;
      const atlas = v as Atlas;
      const frame = atlas.frames[frameName];
      if (frame) return { atlas, frame };
    }
    return null;
  }

  /** 批次預載；onProgress(0..1) */
  async preload(tasks: (() => Promise<unknown>)[], onProgress?: (p: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(
      tasks.map((t) =>
        t().then(
          () => onProgress?.(++done / tasks.length),
          (err) => {
            console.error('[AssetManager] preload failed', err);
            onProgress?.(++done / tasks.length);
          },
        ),
      ),
    );
  }
}
