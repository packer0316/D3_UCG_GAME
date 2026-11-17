/**
 * 渲染舞台：WebGLRenderer + 3D 主場景/相機 + 2D Overlay（設計座標）+ 可插拔 RenderPass。
 *
 * 繪製順序（依 pass.order）：
 *   100 World3D   場景、魚、砲台
 *   200 Effekseer （由 EfkSystem 註冊）
 *   300 Overlay2D 跳字、金幣、獎圈（正交相機，原點左下，與 Cocos UI 座標一致）
 * 之後的功能（例如抽卡 3D 展示）可 addPass 插入自己的 pass。
 */
import * as THREE from 'three';
import { setCocosRotation, type Vec3 } from '@core/math/cocos';

export interface RenderPass {
  readonly id: string;
  readonly order: number;
  enabled: boolean;
  render(stage: Stage, dt: number): void;
}

export interface CameraSetting {
  fov: number;
  near: number;
  far: number;
  position: Vec3;
  /** Cocos setRotation3D（度） */
  rotation: Vec3;
}

export interface StageOptions {
  container: HTMLElement;
  /** 設計解析度高度（原版 FIXED_HEIGHT 640） */
  designHeight: number;
  camera: CameraSetting;
  clearColor?: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** 相機原始位置（震動後回復用） */
  readonly cameraHome = new THREE.Vector3();
  readonly overlay = new THREE.Scene();
  readonly overlayCamera: THREE.OrthographicCamera;
  readonly designHeight: number;
  designWidth = 0;
  /** CSS 像素 / 設計像素 */
  designScale = 1;

  private passes: RenderPass[] = [];
  private resizeListeners = new Set<() => void>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly tmpV = new THREE.Vector3();

  constructor(private readonly opts: StageOptions) {
    this.designHeight = opts.designHeight;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      stencil: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    // 多個 pass：每幀開始才重置統計（debug 面板用）
    this.renderer.info.autoReset = false;
    // 不做色彩管理（Cocos 行為）：貼圖不解碼、輸出不編碼
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(opts.clearColor ?? 0x0b1a3a, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    opts.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('game-canvas');

    const c = opts.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, 1, c.near, c.far);
    this.camera.position.set(c.position.x, c.position.y, c.position.z);
    setCocosRotation(this.camera, c.rotation);
    this.cameraHome.copy(this.camera.position);

    this.overlayCamera = new THREE.OrthographicCamera(0, 1, this.designHeight, 0, -1000, 1000);

    this.addPass({
      id: 'world3d',
      order: 100,
      enabled: true,
      render: (s) => s.renderer.render(s.scene, s.camera),
    });
    this.addPass({
      id: 'overlay2d',
      order: 300,
      enabled: true,
      render: (s) => {
        s.renderer.clearDepth();
        s.renderer.render(s.overlay, s.overlayCamera);
      },
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  addPass(pass: RenderPass): void {
    this.passes = this.passes.filter((p) => p.id !== pass.id);
    this.passes.push(pass);
    this.passes.sort((a, b) => a.order - b.order);
  }

  removePass(id: string): void {
    this.passes = this.passes.filter((p) => p.id !== id);
  }

  getPass(id: string): RenderPass | undefined {
    return this.passes.find((p) => p.id === id);
  }

  onResize(fn: () => void): () => void {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  resize(): void {
    const el = this.opts.container;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.designScale = h / this.designHeight;
    this.designWidth = w / this.designScale;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.left = 0;
    this.overlayCamera.right = this.designWidth;
    this.overlayCamera.top = this.designHeight;
    this.overlayCamera.bottom = 0;
    this.overlayCamera.updateProjectionMatrix();
    for (const fn of this.resizeListeners) fn();
  }

  render(dt: number): void {
    this.renderer.info.reset();
    this.renderer.clear(true, true, true);
    this.camera.updateMatrixWorld();
    for (const p of this.passes) if (p.enabled) p.render(this, dt);
  }

  // ------------------------------------------------------------------
  // 座標換算（設計座標：原點左下，y 向上，高 640）
  // ------------------------------------------------------------------

  /** 世界座標 → 設計座標 */
  worldToDesign(world: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    this.camera.updateMatrixWorld();
    this.tmpV.copy(world).project(this.camera);
    out.set(((this.tmpV.x + 1) / 2) * this.designWidth, ((this.tmpV.y + 1) / 2) * this.designHeight);
    return out;
  }

  /** 瀏覽器座標（clientX/Y）→ 設計座標 */
  clientToDesign(clientX: number, clientY: number, out = new THREE.Vector2()): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    out.set(((clientX - rect.left) / rect.width) * this.designWidth, (1 - (clientY - rect.top) / rect.height) * this.designHeight);
    return out;
  }

  /** 設計座標 → 地面（z=0）世界座標（原版 CameraMgr:Get2dTo3dPos） */
  designToGround(dx: number, dy: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((dx / this.designWidth) * 2 - 1, (dy / this.designHeight) * 2 - 1);
    // 第一幀 render 前相機矩陣尚未更新
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  /** 該世界點上 1 個世界單位 = 幾個設計像素（overlay 表演依深度換算透視大小） */
  pixelsPerUnit(world: THREE.Vector3): number {
    this.camera.updateMatrixWorld();
    const depth = -this.tmpV.copy(world).applyMatrix4(this.camera.matrixWorldInverse).z;
    const fov = (this.camera.fov * Math.PI) / 180;
    return this.designHeight / (2 * Math.tan(fov / 2) * Math.max(1, depth));
  }

  /** 世界座標 → 沿相機射線投到地面（原版子彈起點：砲口骨骼投影到 z=0） */
  projectToGround(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.camera.updateMatrixWorld();
    const dir = this.tmpV.copy(world).sub(this.camera.position).normalize();
    const ray = new THREE.Ray(this.camera.position.clone(), dir);
    return ray.intersectPlane(this.groundPlane, out);
  }
}
