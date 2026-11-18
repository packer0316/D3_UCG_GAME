import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS, CameraPresetId } from '../src/game/define/CameraDefine';
import { FIXED_3D_CAMERA } from '../src/game/define/DisplayDefine';
import { FishType } from '../src/game/define/FishDefine';
import {
  FISH_SCENE_LIMIT,
  GROUND_SCENES,
  SCENE_DEFINES,
  SCENE_LIST,
  SKY_FISH_TYPES,
  SceneType,
  evalMoonSwitch,
  isFishAllowedInScene,
  sceneLimitLabel,
} from '../src/game/define/SceneDefine';
import { createInitialProfile, sanitizeProfile } from '../src/server-fake/ugc/ProfileStore';

describe('場景表（SPEC §15 / §16 / §18）', () => {
  it('SCENE_LIST 都有定義，保留舊場景順序並加入三座聖域', () => {
    for (const t of SCENE_LIST) expect(SCENE_DEFINES[t]?.type).toBe(t);
    expect(SCENE_LIST.slice(4, 7)).toEqual([SceneType.ZB_Prison, SceneType.ZB_Cemetery, SceneType.Space_Moon]);
    expect(new Set(SCENE_LIST).size).toBe(SCENE_LIST.length);
    expect(SCENE_LIST.slice(-3)).toEqual([SceneType.Rose_Castle, SceneType.Tide_Palace, SceneType.Maple_Shrine]);
  });

  it('每個場景不是有模型就是程序化場景（月球沒有模型檔）', () => {
    for (const t of SCENE_LIST) {
      const def = SCENE_DEFINES[t];
      expect(!!def.model !== !!def.procedural, def.name).toBe(true);
    }
    expect(SCENE_DEFINES[SceneType.Space_Moon]).toMatchObject({ procedural: 'moon', name: '月球' });
    expect(GROUND_SCENES).toContain(SceneType.Space_Moon);
  });

  it('監獄 / 墓地與新增程序化場景用第二種相機，舊場景用第一種', () => {
    const zombieCamera: number[] = [SceneType.ZB_Prison, SceneType.ZB_Cemetery, SceneType.Space_Moon, SceneType.Rose_Castle, SceneType.Tide_Palace, SceneType.Maple_Shrine];
    for (const t of SCENE_LIST) {
      const zombie = zombieCamera.includes(t);
      expect(SCENE_DEFINES[t].camera ?? CameraPresetId.Default).toBe(zombie ? CameraPresetId.Zombie : CameraPresetId.Default);
    }
    expect(CAMERA_PRESETS[CameraPresetId.Default].setting).toBe(FIXED_3D_CAMERA);
    expect(CAMERA_PRESETS[CameraPresetId.Zombie].wall).toBeDefined();
  });

  it('殭屍場景是地面場景：地面 Boss 可出現、天空 Boss 不行', () => {
    expect(GROUND_SCENES).toEqual(expect.arrayContaining([SceneType.ZB_Prison, SceneType.ZB_Cemetery]));
    expect(GROUND_SCENES).not.toContain(SceneType.Boss_Sky_Dusk);
    for (const t of [SceneType.ZB_Prison, SceneType.ZB_Cemetery, SceneType.Rose_Castle, SceneType.Tide_Palace, SceneType.Maple_Shrine]) {
      expect(isFishAllowedInScene(FishType.TRex, t)).toBe(true);
      expect(isFishAllowedInScene(FishType.AzureDragon, t)).toBe(false);
      expect(sceneLimitLabel([FishType.Quetzalcoatlus], t)).toBe('空中(黃昏)');
    }
    expect(sceneLimitLabel([FishType.TRex], SceneType.Boss_Sky_Dusk)).toBe('地面');
  });

  it('天空場景只能有 蛋蛋龍 / 翼龍 / 獵龍騎士 / 風神翼龍 / 翔空蒼龍（含翅膀），其他龍只在地面', () => {
    const sky = Object.values(FishType).filter((t) => isFishAllowedInScene(t, SceneType.Boss_Sky_Dusk));
    expect(sky.sort((a, b) => a - b)).toEqual([2, 11, 22, 26, 27, 28]);
    expect(SKY_FISH_TYPES).toEqual(expect.arrayContaining(sky));
    for (const t of [FishType.Cub, FishType.Egg_M, FishType.Stegosaurus_G, FishType.Spinosaurus, FishType.Pyroraptor]) {
      expect(isFishAllowedInScene(t, SceneType.Boss_Sky_Dusk)).toBe(false);
      expect(sceneLimitLabel([t], SceneType.Boss_Sky_Dusk)).toBe('地面');
      expect(FISH_SCENE_LIMIT[t]).toEqual(GROUND_SCENES);
    }
    // 蛋蛋龍、翼龍、獵龍騎士 地面也可以 → 不限場景
    for (const t of [FishType.Egg_S, FishType.Pterosau, FishType.DragonSlainKnight]) {
      expect(FISH_SCENE_LIMIT[t]).toBeUndefined();
      for (const s of GROUND_SCENES) expect(isFishAllowedInScene(t, s)).toBe(true);
    }
    expect(FISH_SCENE_LIMIT[FishType.AzureDragon]).toEqual([SceneType.Boss_Sky_Dusk]);
  });

  it('舊存檔天空格放了不能放的龍：只拿掉那些龍，其他格保留；整格空掉就移除', () => {
    const raw = JSON.parse(JSON.stringify(createInitialProfile(0)));
    raw.scenes.push(SceneType.Boss_Sky_Dusk);
    raw.home.slots = [
      { sceneType: SceneType.Forest, fishTypes: [1, 2, 3] },
      { sceneType: SceneType.Boss_Sky_Dusk, fishTypes: [1, 2, 11] },
      { sceneType: SceneType.Boss_Sky_Dusk, fishTypes: [4, 5] },
    ];
    expect(sanitizeProfile(raw, 0)!.home.slots).toEqual([
      { sceneType: SceneType.Forest, fishTypes: [1, 2, 3] },
      { sceneType: SceneType.Boss_Sky_Dusk, fishTypes: [2, 11] },
    ]);
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
