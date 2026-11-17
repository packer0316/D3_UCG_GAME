// 要從原版複製的資源清單（相對於 DragonTycoon3Resource/）
// - 字串：單一檔案或含 * 的檔名萬用字元
// - .c3b 會自動帶上材質貼圖；.efk/.efkmat 會自動帶上相依檔；.fnt 會帶上頁面圖；.plist 會帶上貼圖並轉 JSON
// 新增功能（例如抽卡）時，請另開一個 group，方便之後拆 bundle。

export const SOURCE_ROOT =
  process.env.D3_SRC ?? 'D:/GIT_TMD/Git_1/DragonTycoon3/ClientCocos/DragonTycoon3Resource';

/** Cocos Studio 原始專案（.csd XML）；以 "csd:<路徑>" 列在 groups 內 */
export const CSD_SOURCE_ROOT =
  process.env.D3_CSD_SRC ?? 'D:/GIT_TMD/Git_1/TMD_CocosStudio_DragonTycoon3/CocosProject/cocosstudio';

/** TMDCommon 共用 UI（自動設定面板等）：以 "common-csd:<路徑>" 列在 groups 內 */
export const COMMON_CSD_SOURCE_ROOT =
  process.env.D3_COMMON_CSD_SRC ?? 'D:/GIT_TMD/Git_1/TMDC_CocosStudio_TMDCommon/CocoStudioProject/cocosstudio';
export const COMMON_RES_ROOT =
  process.env.D3_COMMON_RES ?? 'D:/GIT_TMD/Git_1/TMDCommon/ClientCocos/TMDCommonResource';

/**
 * 原版 Lua 原始碼：魚身 EFK 設定以 "lua-efk:<相對此目錄的 .lua>" 列在 groups 內，
 * 轉成 public/res/Data/FishEfk/<檔名>.json，並複製其中引用的 .efk 與音效（SPEC §14.2）
 */
export const LUA_SOURCE_ROOT =
  process.env.D3_LUA_SRC ?? 'D:/GIT_TMD/Git_1/DragonTycoon3/ClientCocos/DragonTycoon3Lua';

/** Inanna 平台共用資源（VIP 卡等）：以 "inanna:<路徑>" 列在 groups 內，輸出到 public/res/<路徑> */
export const INANNA_RES_ROOT =
  process.env.D3_INANNA_RES ?? 'D:/GIT_TMD/Git_1/Inanna/InannaResource/Inanna';

/** 殭屍專案資源（監獄 / 墓地場景，SPEC §16）：以 "zombie:<路徑>" 列在 groups 內（可含 *），輸出到 public/res/<路徑> */
export const ZOMBIE_RES_ROOT =
  process.env.D3_ZOMBIE_RES ?? 'D:/GIT_TMD/Git_1/TMDC_Zombie/ClientCocos/ZombieResource';

export const groups = {
  data: ['Data/PathData.json', 'Data/GroupData.json', 'Data/FishData.json'],

  // 地面場景：森林 / 沙漠 / 雪地（SceneDefine Forest / Desert / Snow）
  // 空中(黃昏)：Boss_Sky_Dusk（Scene_sky.c3b + flowmap SceneB01_flow.png，SPEC §15）
  scene: ['Models/Scene/Scene01/*', 'Models/Scene/Scene02/*', 'Models/Scene/Scene03/*', 'Models/Scene/Scene06/*'],

  // 殭屍專案場景（SPEC §16）：監獄（場景 + 牆 / 門掛件 + PrisonScene shader 貼圖）、墓地（CemeteryScene shader 貼圖）
  zombieScene: [
    'zombie:Models/Scene_ZB/Prison/*',
    'zombie:Models/Scene_ZB/Cemetery/Cemetery.c3b',
    'zombie:Models/Scene_ZB/Cemetery/Cemetery_mask.jpg',
    'zombie:Models/Scene_ZB/Cemetery/redMoon.png',
    'zombie:Models/Scene_ZB/Common/sceneNoisePair.png',
  ],

  fish: [
    // 1-11
    'Models/Dinosaur/Egg_01.c3b',
    'Models/Dinosaur/Egg_01.jpg',
    'Models/Dinosaur/Egg_02.c3b',
    'Models/Dinosaur/Egg_02.jpg',
    'Models/Dinosaur/Egg_Dragon_01.c3b',
    'Models/Dinosaur/Egg_Dragon_01.jpg',
    'Models/Dinosaur/D_Dragon_01.c3b',
    'Models/Dinosaur/D_Dragon_01.jpg',
    'Models/Dinosaur/A_Dragon_01.c3b',
    'Models/Dinosaur/A_Dragon_01.jpg',
    'Models/Dinosaur/T_Dragon_01.c3b',
    'Models/Dinosaur/T_Dragon_01.jpg',
    'Models/Dinosaur/T_Dragon_02.jpg',
    'Models/Dinosaur/A_Tiger_01.c3b',
    'Models/Dinosaur/A_Tiger_01.jpg',
    'Models/Dinosaur/A_Tiger_06.c3b',
    'Models/Dinosaur/A_Tiger_06.jpg',
    'Models/Dinosaur/S_Dragon_02.c3b',
    'Models/Dinosaur/S_Dragon_02.jpg',
    'Models/Dinosaur/Pterosaur/*',
    // 12-14
    'Models/Dinosaur/A_Dragon_02.c3b',
    'Models/Dinosaur/A_Dragon_02.jpg',
    'Models/Dinosaur/S_Dragon_01.c3b',
    'Models/Dinosaur/S_Dragon_01.jpg',
    'Models/Dinosaur/G_Dragon_01.c3b',
    'Models/Dinosaur/G_Dragon_01.jpg',
    'Models/Object/*',
    // 24 帝王暴龍
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_005/dt3_boss_005.c3b',
  ],

  // ---------------- 第三階段：魚種 15–17、22–28（SPEC §14） ----------------
  fish2: [
    // 15 鐮刀龍、16 腫頭龍、17 火盜龍
    'Models/Dinosaur_dt3/2_Special/Sp_SickleClaw.c3b',
    'Models/Dinosaur_dt3/2_Special/Sp_ThickHead.c3b',
    'Models/Dinosaur_dt3/2_Special/Sp_FireFeather.c3b',
    // 22 獵龍騎士
    'Models/Dinosaur_dt3/3_SpBoss/Sp_DragonHunter.c3b',
    // 23 樹精哥布林、25 遠古巨蠍、26 風神翼龍
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_004/dt3_boss_004.c3b',
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_003/dt3_boss_003.c3b',
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_002/dt3_boss_002.c3b',
    // 27 翔空蒼龍（翅膀存在時的發光貼圖）
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_AzureDragon/dt3_boss_001.c3b',
    'Models/Dinosaur_dt3/1_Boss/dt3_boss_AzureDragon/shader/dt3_boss_001_wing_d_emissive.jpg',
  ],

  // 魚身 EFK（BodyEfk / WithActEfk）：轉 JSON + 複製引用的 efk / 音效。
  // "|" 後面列出本版會播到的動畫（BodyEfk 一律保留）；BossShow / HitMore 用的動畫之後要做時再加上去。
  fishEfk: [
    'lua-efk:View/GameView/Fish/FishTRex/FishTRexEfkSetting.lua|InGame,Walk_1,Walk_2',
    'lua-efk:View/GameView/Fish/FishTreeGoblin/FishTreeGoblinEfkSetting.lua|InGame,Run,Run2',
    'lua-efk:View/GameView/Fish/FishScorpion/FishScorpionEfkSetting.lua|InGame,Run',
    'lua-efk:View/GameView/Fish/FishQuetzalcoatlus/FishQuetzalcoatlusEfkSetting.lua|InGame,Idle_1,Idle_2,Out_Normal',
    'lua-efk:View/GameView/Fish/FishAzureDragon/FishAzureDragonEfkSetting.lua|InGame,Idle_1,Idle_2,Idle_3,Back,Out,Hurt,Hurt1,Hurt2,Hurt3,Hurt4,Hurt5,Hurt6,Stage_Change',
  ],

  cannon: ['Models/Character/MountSkin/dt3_cannon_A.*', 'Models/Character/MountSkin/shader/*_A*'],

  efk: [
    'Effekseer/Fireball.efk',
    'Effekseer_dt3/Cannon/gunfire_A.efk',
    'Effekseer_dt3/Cannon/gunfire_sparkSmoke.efk',
    'Effekseer_dt3/Cannon/gunfire_smokeEnd.efk',
  ],

  ui: [
    'DinosaurExport/plist/Coin.plist',
    'DinosaurExport/plist/Reward_common.plist',
    'DinosaurExport/plist/Reward_common_D3_1.plist',
    'DinosaurExport/plist/Effect.plist',
    'DinosaurExport/plist/FX.plist',
    'DinosaurExport/plist/MainUI.plist',
    'DinosaurExport/plist/common.plist',
    'DinosaurExport/fonts/number_20.fnt',
    'DinosaurExport/fonts/number_20_w.fnt',
    'DinosaurExport/fonts/d3_num_jp01.fnt',
    'DinosaurExport/fonts/num1.fnt',
    'DinosaurExport/fonts/number_20_lv.fnt',
    'DinosaurExport/effect/shinning_star.png',
  ],

  // ---------------- 第二階段：技能按鈕 / 特殊子彈 ----------------
  cannonSkins: [
    'Models/Character/MountSkin/dt3_cannon_B.*',
    'Models/Character/MountSkin/dt3_cannon_C.*',
    'Models/Character/MountSkin/dt3_cannon_D.jpg',
    'Models/Character/MountSkin/dt3_cannon_E.*',
    'Models/Character/MountSkin/dt3_cannon_ES.c3b',
    'Models/Character/MountSkin/shader/*_B*',
    'Models/Character/MountSkin/shader/*_C*',
    'Models/Character/MountSkin/shader/*_E*',
  ],

  specialEfk: [
    'Effekseer_dt3/Bullet/Weapon_Big_Bomb.efk',
    'Effekseer_dt3/Cannon/gunfire_B.efk',
    'Effekseer_dt3/Cannon/gunfire_sparkSmoke_B.efk',
    'Effekseer_dt3/Cannon/gunfire_smokeEnd_B.efk',
    'Effekseer_dt3/Cannon/gunfire_C.efk',
    'Effekseer_dt3/Cannon/gunfire_C_purple.efk',
    'Effekseer_dt3/Cannon/gunfire_E.efk',
  ],

  csd: [
    'csd:DinosaurExport/main/Card.csd',
    'csd:DinosaurExport/main/LockAim_Anim.csd',
    'csd:DinosaurExport/DT_resource/Fire_Normal_Hit.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_B_Hit.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_C_Bullet.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_C_Bullet_purple.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_C_Hit.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_C_Hit_purple.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_E_Bullet.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_E_Hit.csd',
    'csd:DinosaurExport/Bullet_dt3/dt3_cannon_E_laser.csd',
  ],

  // 獎圈（WinCircleDefine.lua WinCircleRes）：只有編譯後的 csb，以 "csb:<路徑>" 轉成 json
  winCircle: [
    'csb:DinosaurExport/reward/Reward_Min_0.csb',
    'csb:DinosaurExport/reward/Reward_Middle_0.csb',
    'csb:DinosaurExport/reward/Reward_Big_0.csb',
  ],

  // 座位面板（砲台下方：押注 / 名字 / VIP / 餘額 / ± 按鈕 / 等待加入）
  seatInfo: ['csd:DinosaurExport/main/SeatInfo.csd', 'inanna:vip/VIPCards.plist'],

  // 自動（AIAuto）設定面板：TMDCommon 共用 UI
  aiAutoPanel: [
    'common-csd:CsbRes/gameCommonUI/AutoPlay/AIAutoSettingViewAdvance.csd',
    'common-csd:CsbRes/gameCommonUI/AutoPlay/AIAutoFishCellGroupAdvance.csd',
  ],

  sound: [
    'Sound/mp3/sound/MG_4.mp3',
    'Sound/mp3/sound/MG_5.mp3',
    'Sound/mp3/sound/MG_6.mp3',
    'Sound/mp3/sound/S_24.mp3',
    'Sound/mp3/sound/L_4.mp3',
    'Sound/mp3/sound/MG_2.mp3',
    'Sound/mp3/sound/MG_3.mp3',
    'Sound/mp3/sound/C_1.mp3',
    'Sound/mp3/sound/C_2.mp3',
    'Sound/mp3/sound/C_3.mp3',
    'Sound/mp3/sound/se_05A.mp3',
    'Sound/mp3/sound/se_51.mp3',
    'Sound/mp3/sound/se_28E.mp3',
    'Sound/mp3/bgm/BGM_Normal.mp3',
    // 空中(黃昏)（SoundSceneDefine Boss_Sky_Dusk = Scene_BG_4，SPEC §15）
    'Sound/mp3/bgm/BGM_BossSky.mp3',
  ],
};
