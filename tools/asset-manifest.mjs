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

/** Inanna 平台共用資源（VIP 卡等）：以 "inanna:<路徑>" 列在 groups 內，輸出到 public/res/<路徑> */
export const INANNA_RES_ROOT =
  process.env.D3_INANNA_RES ?? 'D:/GIT_TMD/Git_1/Inanna/InannaResource/Inanna';

export const groups = {
  data: ['Data/PathData.json', 'Data/GroupData.json', 'Data/FishData.json'],

  scene: ['Models/Scene/Scene03/*'],

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
  ],
};
