/**
 * 相機預設切換（SPEC §16.4）：舞台相機 + 子彈牆（PlayField）一起換。
 * - 場景切換：SceneSystem 依 SceneDefine.camera 自動套用（監獄 / 墓地 → 第二種，其他 → 第一種）
 * - debug 面板：手動切換預設 / 微調數值
 * 換完送 'camera:change'（debug 面板同步欄位）。
 */
import type { EventBus } from '@core/events/EventBus';
import type { CameraSetting, Stage } from '@engine/stage/Stage';
import { CAMERA_PRESETS, CameraPresetId } from '../define/CameraDefine';
import { WALL_POLYGON } from '../define/DisplayDefine';
import type { GameEvents } from '../GameContext';
import type { PlayField } from './PlayField';

export class CameraControl {
  /** 目前套用的預設（舞台建立時 = 第一種；-1 = debug 微調過） */
  private current: number = CameraPresetId.Default;
  /** 目前場景要的預設（覆寫結束後回到這個） */
  scenePreset: number = CameraPresetId.Default;
  /** 覆寫中的預設（裝潢模式的俯視相機）；null = 沒有覆寫 */
  private override: number | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly playField: PlayField,
    private readonly events: EventBus<GameEvents>,
  ) {}

  get preset(): number {
    return this.current;
  }

  /** 套用預設：相機 + 牆；未定義的 id 回傳 false */
  applyPreset(id: number): boolean {
    const preset = CAMERA_PRESETS[id];
    if (!preset) return false;
    this.stage.applyCamera(preset.setting);
    this.playField.wall = preset.wall ?? WALL_POLYGON;
    this.current = id;
    this.events.emit('camera:change', { preset: id });
    return true;
  }

  /** 覆寫中：場景切換不換相機（只記下場景要的預設） */
  get overridden(): boolean {
    return this.override !== null;
  }

  /** 覆寫相機（裝潢模式）；null = 結束覆寫，回到場景的預設 */
  setOverride(id: number | null): void {
    this.override = id;
    this.applyPreset(id ?? this.scenePreset);
  }

  /** debug 微調：只換相機，牆沿用目前預設的 */
  applyCustom(setting: CameraSetting): void {
    this.stage.applyCamera(setting);
    this.current = -1;
  }
}
