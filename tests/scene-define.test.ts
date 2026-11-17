import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS, CameraPresetId } from '../src/game/define/CameraDefine';
import { FIXED_3D_CAMERA } from '../src/game/define/DisplayDefine';
import { FishType } from '../src/game/define/FishDefine';
import {
  GROUND_SCENES,
  SCENE_DEFINES,
  SCENE_LIST,
  SceneType,
  evalMoonSwitch,
  isFishAllowedInScene,
  sceneLimitLabel,
} from '../src/game/define/SceneDefine';

describe('場景表（SPEC §15 / §16）', () => {
  it('SCENE_LIST 都有定義，殭屍場景接在最後', () => {
    for (const t of SCENE_LIST) expect(SCENE_DEFINES[t]?.type).toBe(t);
    expect(SCENE_LIST.slice(-2)).toEqual([SceneType.ZB_Prison, SceneType.ZB_Cemetery]);
  });

  it('監獄 / 墓地用第二種相機，其他場景用第一種', () => {
    for (const t of SCENE_LIST) {
      const zombie = t === SceneType.ZB_Prison || t === SceneType.ZB_Cemetery;
      expect(SCENE_DEFINES[t].camera ?? CameraPresetId.Default).toBe(zombie ? CameraPresetId.Zombie : CameraPresetId.Default);
    }
    expect(CAMERA_PRESETS[CameraPresetId.Default].setting).toBe(FIXED_3D_CAMERA);
    expect(CAMERA_PRESETS[CameraPresetId.Zombie].wall).toBeDefined();
  });

  it('殭屍場景是地面場景：地面 Boss 可出現、天空 Boss 不行', () => {
    expect(GROUND_SCENES).toEqual(expect.arrayContaining([SceneType.ZB_Prison, SceneType.ZB_Cemetery]));
    expect(GROUND_SCENES).not.toContain(SceneType.Boss_Sky_Dusk);
    for (const t of [SceneType.ZB_Prison, SceneType.ZB_Cemetery]) {
      expect(isFishAllowedInScene(FishType.TRex, t)).toBe(true);
      expect(isFishAllowedInScene(FishType.AzureDragon, t)).toBe(false);
      expect(sceneLimitLabel([FishType.Quetzalcoatlus], t)).toBe('空中(黃昏)');
    }
    expect(sceneLimitLabel([FishType.TRex], SceneType.Boss_Sky_Dusk)).toBe('地面');
  });
});

describe('墓地紅月 evalMoonSwitch（GameSceneCemeteryDefine.MoonSwitchTimeline）', () => {
  const m = SCENE_DEFINES[SceneType.ZB_Cemetery].moonSwitch!;
  it('0 → 1（40 秒）→ 停 2 秒 → 0（168 秒）→ 固定 0', () => {
    expect(evalMoonSwitch(m, 0)).toBe(0);
    expect(evalMoonSwitch(m, 20)).toBeCloseTo(0.5);
    expect(evalMoonSwitch(m, 40)).toBe(1);
    expect(evalMoonSwitch(m, 41.9)).toBe(1);
    expect(evalMoonSwitch(m, 42 + 84)).toBeCloseTo(0.5);
    expect(evalMoonSwitch(m, 210)).toBe(0);
    expect(evalMoonSwitch(m, 999)).toBe(0);
  });
});
