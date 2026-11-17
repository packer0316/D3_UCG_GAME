/**
 * EffekseerForWebGL 1.70e（public/lib/effekseer/effekseer.min.js，以 <script> 載入成全域 `effekseer`）
 * 只宣告本專案用到的部分。
 */
declare namespace effekseer {
  function initRuntime(path: string, onload: () => void, onerror: () => void): void;
  function createContext(): EffekseerContext;
  function releaseContext(context: EffekseerContext): void;
  function setImageCrossOrigin(crossOrigin: string): void;

  class EffekseerContext {
    init(webglContext: WebGLRenderingContext | WebGL2RenderingContext, settings?: object): void;
    update(deltaFrames?: number): void;
    draw(): void;
    setProjectionMatrix(matrixArray: Float32Array | number[]): void;
    setCameraMatrix(matrixArray: Float32Array | number[]): void;
    loadEffect(
      path: string,
      scale?: number,
      onload?: () => void,
      onerror?: (reason: string, path: string) => void,
      redirect?: (path: string) => string,
    ): EffekseerEffect;
    releaseEffect(effect: EffekseerEffect): void;
    play(effect: EffekseerEffect, x: number, y: number, z: number): EffekseerHandle | null;
    stopAll(): void;
    setRestorationOfStatesFlag(flag: boolean): void;
    getRestInstancesCount(): number;
  }

  class EffekseerEffect {
    readonly isLoaded: boolean;
  }

  class EffekseerHandle {
    readonly exists: boolean;
    stop(): void;
    stopRoot(): void;
    setFrame(frame: number): void;
    setLocation(x: number, y: number, z: number): void;
    setRotation(x: number, y: number, z: number): void;
    setScale(x: number, y: number, z: number): void;
    setMatrix(matrixArray: Float32Array | number[]): void;
    setAllColor(r: number, g: number, b: number, a: number): void;
    setPaused(paused: boolean): void;
    setShown(shown: boolean): void;
    setSpeed(speed: number): void;
  }
}
