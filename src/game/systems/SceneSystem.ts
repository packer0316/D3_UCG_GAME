/**
 * 背景場景 — 對照原版 BGSceneSystem.lua（SceneType 屬性）+ BGSceneLayer.lua（ChangeScene / UpdateSceneColor）
 * - 進房 G2U_ROOM_DATA_NOTIFY.sceneType → 直接顯示（沒有上一個場景就不轉場）
 * - G2U_CHANGE_SCENE_NOTIFY.type（server 決定；目前由 debug 下拉選單觸發）→ 轉場（SPEC §15.3）
 * - 切換當下更新魚影顏色（原版 ModelMgr:setShadowColor）、天空場景關閉魚影、換 BGM（SoundSceneDefine）
 * - 切換當下依場景換相機預設（SPEC §16.4：監獄 / 墓地 → 第二種，其他 → 第一種）
 * 清場由 FishSystem 自己聽 G2U_CHANGE_SCENE_NOTIFY（原版 TimelineSystem）。
 */
import type * as THREE from 'three';
import { CAMERA_PRESETS, CameraPresetId } from '../define/CameraDefine';
import { IRIS_TRANSITION, SCENE_DEFINES, SCENE_LIST, SceneState } from '../define/SceneDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';
import { BGScene } from '../world/BGScene';

export class SceneSystem {
  private readonly bg: BGScene;
  private bgm: string | null = null;

  constructor(private readonly ctx: GameContext) {
    this.bg = new BGScene(ctx.assets, ctx.layers.bg, ctx.actions, ctx.stage);
  }

  preload(): Promise<unknown> {
    return this.bg.preload(SCENE_LIST);
  }

  init(): void {
    this.ctx.net.on('G2U_ROOM_DATA_NOTIFY', (d) => void this.change(d.sceneType));
    this.ctx.net.on('G2U_CHANGE_SCENE_NOTIFY', (d) => void this.change(d.type));
  }

  get sceneType(): number {
    return this.bg.sceneType;
  }

  update(dt: number): void {
    this.bg.update(dt);
  }

  /** BGSceneSystem.SceneType setter → BGSceneLayer:ChangeScene */
  async change(sceneType: number): Promise<void> {
    const def = SCENE_DEFINES[sceneType];
    if (!def) {
      console.warn(`[SceneSystem] unsupported sceneType ${sceneType}`);
      return;
    }
    if (sceneType === this.bg.sceneType) return;
    // UpdateSceneColor：只有定義了陰影色才改
    const fishSys = this.ctx.services.get(Tokens.FishSystem);
    if (def.shadowColor) fishSys.setShadowColor(def.shadowColor);
    fishSys.setShadowVisible(def.state !== SceneState.Sky);
    // 相機：與目前相同就不重套；debug 微調過（preset = -1）一律套回場景的預設。
    // 換相機前留一份快照：轉場中舊場景仍用舊相機畫，新場景在新相機下蓋上去（BGScene.iris）
    const camera = this.ctx.services.get(Tokens.CameraControl);
    const preset = def.camera ?? CameraPresetId.Default;
    let prevCamera: THREE.Camera | null = null;
    if (camera.preset !== preset) {
      prevCamera = this.ctx.stage.camera.clone();
      camera.applyPreset(preset);
    }
    this.playBgm(def.bgm);
    const done = this.bg.change(sceneType, {
      irisRange: CAMERA_PRESETS[preset]?.irisRange ?? IRIS_TRANSITION.range,
      prevCamera,
    });
    this.ctx.events.emit('scene:change', { sceneType });
    try {
      await done;
    } catch (err) {
      console.error(`[SceneSystem] change to ${def.name} failed`, err);
    }
  }

  /** 場景 BGM（原版 SoundSceneDefine MusicTable）；與目前相同就不重播 */
  private playBgm(name: string): void {
    if (name === this.bgm) return;
    this.bgm = name;
    void this.ctx.audio.playBgm(name);
  }
}
