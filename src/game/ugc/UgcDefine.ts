/**
 * UGC 常數（SPEC-UGC §2、§3）。數值都可以調。
 */
import { SceneType } from '../define/SceneDefine';

/** 1 號房 = 公有地 */
export const PUBLIC_ROOM_ID = 1;
/** 2 號房 = 我的家園；NPC 家園從 3 號開始 */
export const MY_HOME_ROOM_ID = 2;
export const FIRST_NPC_ROOM_ID = 3;

/** 本機玩家 */
export const MY_ACCOUNT_ID = 1;
export const SYSTEM_ACCOUNT_ID = 0;

/** 每個場景格的秒數 */
export const SLOT_SECONDS = 150;
/** 輪替表最多幾格 */
export const MAX_SLOTS = 8;
/** 每個場景格最多放幾種 Boss */
export const MAX_BOSS_PER_SLOT = 3;
/** 魚卡等級上限 */
export const MAX_LEVEL = 100;

// ---- 初始資產（SPEC-UGC §3.1）
export const INITIAL_MONEY = 31_708_504;
export const INITIAL_TICKETS = 10;
/** 初始 11 種龍：幼幼龍 ~ 翼龍 */
export const STARTER_FISH: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** 初始場景：草地（森林） */
export const STARTER_SCENES: readonly number[] = [SceneType.Forest];
export const STARTER_DECOS: Readonly<Record<string, number>> = { cube_white: 4, cube_red: 2, cube_blue: 2 };

// ---- 存檔
export const PROFILE_STORAGE_KEY = 'd3.ugc.profile.v1';
export const PROFILE_SAVE_INTERVAL_MS = 2000;

// ---- 模擬訪客（SPEC-UGC §8.3）
/** 人氣 / 這個值 = 平均訪客數 */
export const POPULARITY_PER_VISITOR = 40;
export const VISITOR_MIN = 0.2;
export const VISITOR_MAX = 3;
/** 每位訪客每秒幾發、平均押注 */
export const VISITOR_SHOTS_PER_SEC = 2;
export const VISITOR_AVG_BET = 300;
/** 離線收益最多算幾毫秒 */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
/** 線上時每幾毫秒通知一次收益 */
export const INCOME_NOTIFY_INTERVAL_MS = 5000;
/** 人氣：場景種類每種加幾分、裝飾物最多算幾個 */
export const POPULARITY_PER_SCENE = 5;
export const POPULARITY_DECO_CAP = 30;

// ---- 房間列表排行（SPEC-UGC §2.4）
export const DAY_MS = 24 * 60 * 60 * 1000;
/** 開張幾天內算「新星家園」 */
export const NEW_HOME_DAYS = 3;
