/**
 * 自動（AIAuto / 智能篩選）設定 — 翻譯自原版 DT3 View/UI/AIAutoSettingView.lua 與
 * TMDCommon AutoPlay/AIAutoSettingViewAdvance.lua、AddAndMinusLabelGroupComponent.lua
 */

export const AI_PANEL_CSD = 'CsbRes/gameCommonUI/AutoPlay/AIAutoSettingViewAdvance.csd';
export const AI_ROW_CSD = 'CsbRes/gameCommonUI/AutoPlay/AIAutoFishCellGroupAdvance.csd';
/** 面板設計尺寸（ScaleNode 置中） */
export const AI_PANEL_DESIGN_WIDTH = 1400;
/** TableView：每列 594×145、每列 4 格 */
export const AI_ROW_SIZE = { w: 594, h: 145 };
export const AI_CELLS_PER_ROW = 4;
export const AI_CELL_NODES = ['Cell_1', 'Cell_2', 'Cell_3', 'Cell_4'];

const D3_PLIST = 'DinosaurExport/plist/Reward_common_D3_1.plist';

export interface AIAutoFish {
  fishId: number;
  name: string;
  /** 頭像影格（Reward_common_D3_1.plist）；原版部分為散圖 DropRes/91/Circle_NN.png（本版沒有） */
  image: string;
  plist?: string;
  scale: number;
}

const f = (fishId: number, name: string, image: string, scale = 0.65, plist: string = D3_PLIST): AIAutoFish => ({
  fishId,
  name,
  image,
  plist,
  scale,
});

/** 原版顯示順序（AIAutoSettingView.lua:59-984） */
export const AI_AUTO_FISH_LIST: AIAutoFish[] = [
  f(83, '獨角獸(火)', 'D3_83.png'),
  f(79, '貂蟬', 'D3_79.png'),
  f(76, '世足龍(主隊)', 'D3_76.png'),
  f(77, '世足龍(客隊)', 'D3_77.png'),
  f(75, '端午龍舟', 'D3_75.png'),
  f(80, '豪車騰雲', 'Circle_80.png'),
  f(81, '豪車騰雲', 'Circle_81.png'),
  f(82, '豪車騰雲', 'Circle_82.png'),
  f(74, '獵龍領主', 'D3_74.png'),
  f(64, '戰神呂布', 'D3_64.png'),
  f(65, '這箱有鑽', 'D3_65.png'),
  f(63, '強棒巨魔', 'D3_63.png'),
  f(61, '寶珠貝', 'D3_61.png'),
  f(62, '寶珠騰雲', 'Circle_62.png'),
  f(58, '煙火巨魔', 'D3_58.png'),
  f(52, '黃金騰雲', 'Circle_52.png'),
  f(53, '點數騰雲', 'Circle_53.png'),
  f(54, '禮券騰雲', 'Circle_54.png'),
  f(55, '字卡騰雲', 'Circle_55.png'),
  f(49, '鴻運財神', 'D3_49.png'),
  f(38, '邱比特', 'D3_38.png'),
  f(32, '南瓜首領', 'D_42_1.png'),
  f(31, '滿月雙兔', 'D3_31_1.png'),
  f(36, '聖誕老人', 'D3_36.png'),
  f(51, '百變財神', '51_1.png'),
  f(50, '炙炎巨猩', 'D3_50.png'),
  f(33, '暴食巨魔', 'D3_33.png'),
  f(30, '巨大機器人', 'D3_30.png'),
  f(29, '無人機', 'D3_29.png'),
  f(27, '翔空蒼龍', 'D3_27.png'),
  f(28, '蒼龍翅膀', 'D3_28.png'),
  f(24, '帝王暴龍', 'D3_24.png'),
  f(26, '風神翼龍', 'D3_26.png'),
  f(25, '遠古巨蠍', 'D3_25.png'),
  f(34, '煌岩金龍', 'D3_51.png', 0.75),
  f(23, '樹精哥布林', 'D3_23.png'),
  f(22, '獵龍騎士', 'D3_22.png'),
  f(17, '火盜龍', 'D3_17.png'),
  f(16, '腫頭龍', 'D3_16.png'),
  f(15, '鐮刀龍', 'D3_15.png'),
  f(14, '棘龍', 'D3_14.png'),
  f(13, '太古劍龍', 'D3_13.png'),
  f(12, '刺甲龍', 'D3_12.png'),
  f(11, '翼龍', 'D3_11.png'),
  f(10, '黃金劍龍', 'D3_10.png'),
  f(9, '黃金劍齒虎', 'D3_09.png'),
];

/** 亞種 → 母種（SUBSP_FISH_GROUP，AIAutoSettingView.lua:22-34）：優先順序以母種計算 */
export const AI_SUBSP_FISH_GROUP: Record<number, number> = {
  37: 33, // 暴食巨魔(玉米)
  43: 33, // 暴食巨魔(玉米2號)
  46: 33, // 暴食巨魔(魷魚)
  48: 33, // 暴食巨魔(龍蝦)
  47: 33, // 暴食巨魔(棉花糖)
  57: 24, // 帝王暴龍(色違)
  59: 24, // 帝王暴龍(打架版)
  56: 23, // 樹精哥布林(色違)
  44: 38, // 超.邱比特
  45: 38, // 真超.邱比特
  60: 50, // 炙炎巨猩(打架版)
};

export const aiBaseFishType = (type: number) => AI_SUBSP_FISH_GROUP[type] ?? type;

export type AIOptionKey = 'LimitShoot' | 'WinOdds' | 'CoinLess' | 'CoinMore';
export const AI_OPTION_KEYS: AIOptionKey[] = ['LimitShoot', 'WinOdds', 'CoinLess', 'CoinMore'];

export interface AIOptionDefine {
  /** 預設值（null = 目前籌碼） */
  def: number | null;
  min: number | 'chips';
  max: number | 'chips';
  /** 手動輸入時的範圍（籌碼兩列用固定範圍，與原版相同） */
  typeMin: number;
  typeMax: number;
  maxLength: number;
  /** 按下的第一步 */
  step: number;
  /** 長按每次（依速度等級 0..3） */
  holdSteps: [number, number, number, number];
}

export const AI_OPTIONS: Record<AIOptionKey, AIOptionDefine> = {
  LimitShoot: { def: 3000, min: 1, max: 99999, typeMin: 1, typeMax: 99999, maxLength: 5, step: 1, holdSteps: [1, 1, 1, 1] },
  WinOdds: { def: 10, min: 1, max: 99999, typeMin: 1, typeMax: 99999, maxLength: 5, step: 1, holdSteps: [1, 1, 1, 1] },
  CoinLess: { def: null, min: 0, max: 'chips', typeMin: 0, typeMax: 999999999, maxLength: 9, step: 10, holdSteps: [3, 5, 10, 50] },
  CoinMore: { def: null, min: 'chips', max: 999999999, typeMin: 0, typeMax: 999999999, maxLength: 9, step: 10, holdSteps: [3, 5, 10, 50] },
};

/** 長按加速（AddLvSec / SpeedSec） */
export const AI_HOLD_LEVEL_UP_SEC = [0.25, 0.5, 75, 1];
export const AI_HOLD_TICK_SEC = [0.2, 0.1, 0.001, 0.001];

/** 存檔 key（原版 FileMgr:SaveGameData("<GameAbbrev>_AIAutoSetting_<accountId>")） */
export const aiStorageKey = (accountId: number) => `DT3_AIAutoSetting_${accountId}`;

export interface AIAutoConfig {
  /** 鎖定魚種（優先順序） */
  targetFishList: number[];
  /** null = 不限 */
  limitShoot: number | null;
  /** 擊殺 floatedOdds > 此值停止 */
  stopOverOdds: number | null;
  /** 籌碼 < 此值停止 */
  stopLessCoin: number | null;
  /** 籌碼 > 此值停止 */
  stopMoreCoin: number | null;
}
