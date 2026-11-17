/**
 * Effekseer（EFK）管理：對應原版 TMDCommonLua EffekseerMgr / EffekseerNode。
 *
 * - 與 three.js 共用 WebGL context；畫在 World3D pass 之後，共用深度（原版 EFK 也畫在模型之後）
 * - play(setting, attachTo)：attachTo 存在時每幀把 emitter 矩陣設為「掛點世界矩陣 × 本地 transform」
 *   （原版 emitter = 節點 getNodeToWorldTransform）
 * - EfkSetting 欄位對照原版 EFK_SETTING：File / Position / Rotation / Scale / Speed / Duration / Delay / MaxConcurrent
 * - 每個檔案同時最多 MaxConcurrent 個（預設 6，原版 PlayEfkAnim 限制）
 */
import * as THREE from 'three';
import { setCocosRotation, type Vec3 } from '@core/math/cocos';
import type { Stage } from '../stage/Stage';

export interface EfkSetting {
  /** 資源路徑（原版相對路徑） */
  file: string;
  position?: Vec3;
  /** Cocos 歐拉角（度） */
  rotation?: Vec3;
  scale?: number | Vec3;
  speed?: number;
  /** 秒；-1 = loop，預設 3 */
  duration?: number;
  delay?: number;
  maxConcurrent?: number;
}

export interface EfkHandle {
  stop(): void;
  readonly alive: boolean;
}

interface Playing {
  file: string;
  handle: effekseer.EffekseerHandle | null;
  attach: THREE.Object3D | null;
  local: THREE.Matrix4;
  /** 剩餘延遲 */
  delay: number;
  /** 剩餘壽命；Infinity = loop */
  life: number;
  speed: number;
  stopped: boolean;
  effect: effekseer.EffekseerEffect;
}

const DEFAULT_DURATION = 3;
const DEFAULT_MAX_CONCURRENT = 6;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { effekseer?: unknown }).effekseer) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`load ${src} failed`));
    document.head.appendChild(s);
  });
}

export class EfkSystem {
  private ctx: effekseer.EffekseerContext | null = null;
  private effects = new Map<string, Promise<effekseer.EffekseerEffect>>();
  private playing: Playing[] = [];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpObj = new THREE.Object3D();
  ready = false;

  constructor(
    private readonly stage: Stage,
    private readonly resolveUrl: (path: string) => string,
  ) {}

  async init(libBase = `${import.meta.env.BASE_URL}lib/effekseer/`): Promise<void> {
    try {
      await loadScript(libBase + 'effekseer.min.js');
      await new Promise<void>((resolve, reject) =>
        effekseer.initRuntime(libBase + 'effekseer.wasm', resolve, () => reject(new Error('effekseer wasm init failed'))),
      );
      const ctx = effekseer.createContext();
      ctx.init(this.stage.renderer.getContext(), { instanceMaxCount: 4000, squareMaxCount: 10000 });
      ctx.setRestorationOfStatesFlag(true);
      this.ctx = ctx;
      this.ready = true;
      this.stage.addPass({
        id: 'effekseer',
        order: 200,
        enabled: true,
        render: (s) => this.draw(s),
      });
    } catch (err) {
      // EFK 失敗不影響遊戲主體
      console.error('[EfkSystem] init failed, effects disabled', err);
    }
  }

  /** 預載效果檔 */
  load(file: string): Promise<effekseer.EffekseerEffect> {
    let p = this.effects.get(file);
    if (!p) {
      p = new Promise((resolve, reject) => {
        if (!this.ctx) return reject(new Error('effekseer not ready'));
        const url = this.resolveUrl(file);
        const effect = this.ctx.loadEffect(
          url,
          1.0,
          () => resolve(effect),
          (reason, path) => reject(new Error(`efk load failed: ${path} (${reason})`)),
        );
      });
      p.catch((e) => console.warn('[EfkSystem]', e.message));
      this.effects.set(file, p);
    }
    return p;
  }

  play(setting: EfkSetting, attachTo: THREE.Object3D | null = null, worldPos?: THREE.Vector3): EfkHandle {
    const maxC = setting.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    const sameFile = this.playing.filter((p) => p.file === setting.file && !p.stopped);
    if (!this.ctx || sameFile.length >= maxC) return { stop() {}, alive: false };

    // 本地 transform（Cocos：setPosition3D / setRotation3D / setScale）
    const o = this.tmpObj;
    o.position.set(setting.position?.x ?? 0, setting.position?.y ?? 0, setting.position?.z ?? 0);
    if (worldPos && !attachTo) o.position.add(worldPos);
    setCocosRotation(o, setting.rotation ?? { x: 0, y: 0, z: 0 });
    const sc = setting.scale ?? 1;
    if (typeof sc === 'number') o.scale.setScalar(sc);
    else o.scale.set(sc.x, sc.y, sc.z);
    o.updateMatrix();

    const duration = setting.duration ?? DEFAULT_DURATION;
    const entry: Playing = {
      file: setting.file,
      handle: null,
      attach: attachTo,
      local: o.matrix.clone(),
      delay: setting.delay ?? 0,
      life: duration < 0 ? Infinity : duration,
      speed: setting.speed ?? 1,
      stopped: false,
      effect: null as unknown as effekseer.EffekseerEffect,
    };
    this.playing.push(entry);
    this.load(setting.file).then(
      (eff) => {
        entry.effect = eff;
      },
      () => {
        entry.stopped = true;
      },
    );
    return {
      stop: () => this.stopEntry(entry),
      get alive() {
        return !entry.stopped;
      },
    };
  }

  private stopEntry(e: Playing): void {
    if (e.stopped) return;
    e.stopped = true;
    e.handle?.stop();
    e.handle = null;
  }

  stopAll(): void {
    for (const p of this.playing) this.stopEntry(p);
    this.playing = [];
    this.ctx?.stopAll();
  }

  /** 由遊戲主迴圈呼叫 */
  update(dt: number): void {
    if (!this.ctx) return;
    for (const e of this.playing) {
      if (e.stopped) continue;
      if (e.delay > 0) {
        e.delay -= dt;
        if (e.delay > 0) continue;
      }
      if (!e.handle) {
        if (!e.effect) continue; // 還在載入
        e.handle = this.ctx.play(e.effect, 0, 0, 0);
        if (!e.handle) {
          e.stopped = true;
          continue;
        }
        e.handle.setSpeed(e.speed);
      }
      // 跟隨掛點
      if (e.attach) {
        if (!e.attach.parent && !(e.attach instanceof THREE.Scene)) {
          // 掛點已被移除 → 停止（原版 removeFromParent 時一起釋放）
          this.stopEntry(e);
          continue;
        }
        e.attach.updateWorldMatrix(true, false);
        this.tmpM.multiplyMatrices(e.attach.matrixWorld, e.local);
      } else {
        this.tmpM.copy(e.local);
      }
      e.handle.setMatrix(this.tmpM.elements);
      e.life -= dt;
      if (e.life <= 0 || !e.handle.exists) this.stopEntry(e);
    }
    this.playing = this.playing.filter((e) => !e.stopped);
    // Effekseer 以 60fps 為單位
    this.ctx.update(dt * 60);
  }

  private draw(stage: Stage): void {
    if (!this.ctx) return;
    // Effekseer 不會設定 stencil，會沿用 three 最後一個 draw call 的狀態。
    // 魚影（PlanarShadowMaterial：stencil 128 NOTEQUAL / REPLACE）若是 World3D 最後畫的物件，
    // stencil test 會留著開啟 → 粒子同一像素只畫得進第一層，疊加層全被擋掉，子彈 / 砲口火焰變成暗紅色。
    // 直接呼叫 GL（不經 three 的狀態快取）；畫完的 resetState() 會讓 three 重新同步。
    const gl = stage.renderer.getContext();
    gl.disable(gl.STENCIL_TEST);
    this.ctx.setProjectionMatrix(stage.camera.projectionMatrix.elements);
    this.ctx.setCameraMatrix(stage.camera.matrixWorldInverse.elements);
    this.ctx.draw();
    stage.renderer.resetState();
  }

  get activeCount(): number {
    return this.playing.length;
  }
}
