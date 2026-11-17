/**
 * 背景場景 — 對照原版 BGSceneSystem.lua（SceneType 屬性）+ BGSceneLayer.lua（ChangeScene / UpdateSceneColor）
 * - 進房 G2U_ROOM_DATA_NOTIFY.sceneType → 直接顯示（沒有上一個場景就不轉場）
 * - G2U_CHANGE_SCENE_NOTIFY.type（server 決定；目前由 debug 下拉選單觸發）→ 轉場（SPEC §15.3）
 * - 切換當下更新魚影顏色（原版 ModelMgr:setShadowColor）、天空場景關閉魚影、換 BGM（SoundSceneDefine）
 * 清場由 FishSystem 自己聽 G2U_CHANGE_SCENE_NOTIFY（原版 TimelineSystem）。
 */
import { SCENE_DEFINES, SCENE_LIST, SceneState } from '../define/SceneDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';
import { BGScene } from '../world/BGScene';

export class SceneSystem {
  private readonly bg: BGScene;
  private bgm: string | null = null;

  constructor(private readonly ctx: GameContext) {
    this.bg = new BGScene(ctx.assets, ctx.layers.bg, ctx.actions);
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
    this.playBgm(def.bgm);
    const done = this.bg.change(sceneType);
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
