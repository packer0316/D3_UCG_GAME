/**
 * UGC 共用型別（client 與假 server 共用；SPEC-UGC §3、§10）
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

/** 一張魚卡的狀態 */
export interface FishCardState {
  /** 1 ~ MAX_LEVEL */
  level: number;
  /** 碎片（抽到重複的卡 +1，升級消耗） */
  copies: number;
}

/** 場景格：一個場景 + 這個場景要放出的龍（魚卡的 fishType） */
export interface HomeSlot {
  sceneType: number;
  fishTypes: number[];
}

/** 裝飾物擺放：格線座標（佔地左下角那一格）；rot 1 = 旋轉 90°（寬深互換） */
export interface DecoPlacement {
  id: string;
  x: number;
  y: number;
  rot: 0 | 1;
}

export interface HomeState {
  slots: HomeSlot[];
  deco: DecoPlacement[];
  /** 尚未領取的抽成 */
  pending: number;
  /** 累計抽成 */
  totalEarned: number;
  /** 上次結算時間（Date.now 毫秒；離線收益用） */
  lastAccrueAt: number;
}

export interface PlayerProfile {
  version: 1;
  accountId: number;
  name: string;
  money: number;
  tickets: number;
  /** fishType → 魚卡 */
  fish: Record<number, FishCardState>;
  /** 擁有的場景（SceneType） */
  scenes: number[];
  /** decoId → 擁有數量（含已擺放的） */
  decos: Record<string, number>;
  home: HomeState;
  stats: { draws: number; ticketsEarned: number };
  /** 建立存檔的時間（毫秒）= 家園開張時間（SPEC-UGC §2.4） */
  createdAt: number;
}

export type RoomKind = 'public' | 'home';

/** 房間目錄中的屋主介紹；與玩家資產、養成等級分開。 */
export interface RoomHostProfile {
  /** 怪趣玩家頭貼圖集的格號（0–31）；未設定時使用原本龍種頭像。 */
  avatarIndex?: number;
  portrait: number;
  title: string;
  bio: string;
}

/** 房間內容（房間列表、進房通知共用） */
export interface RoomDetail {
  roomId: number;
  kind: RoomKind;
  /** 顯示名稱，例如「3號房 阿明的家園」 */
  name: string;
  ownerId: number;
  ownerName: string;
  host?: RoomHostProfile;
  /** 是不是我的家園 */
  isMine: boolean;
  /** 場景輪替表 */
  slots: HomeSlot[];
  /** fishType（魚卡）→ 等級；公有地一律 1（不列出） */
  levels: Record<number, number>;
  deco: DecoPlacement[];
  popularity: number;
  /** 平均訪客數（模擬值；公有地 0） */
  visitors: number;
  /** 每格秒數 */
  slotSeconds: number;
  /** 家園開張時間（毫秒；公有地 0；SPEC-UGC §2.4） */
  createdAt: number;
}

/** 房間列表的家園排行（SPEC-UGC §2.4）：房號依名次排列 */
export interface HomeRanking {
  /** 全部家園，依人氣 */
  hot: number[];
  /** 開張 NEW_HOME_DAYS 天內的家園，依人氣 */
  rising: number[];
}

/** 進房通知：房間內容 + 目前在第幾格 */
export interface RoomState extends RoomDetail {
  slotIndex: number;
  /** 這一格還剩幾毫秒 */
  slotRemainMs: number;
}

export type GachaItemKind = 'fish' | 'scene' | 'deco';

export interface GachaResult {
  kind: GachaItemKind;
  /** fishType / sceneType / decoId */
  id: number | string;
  rarity: Rarity;
  /** 第一次取得 */
  isNew: boolean;
  /** 魚卡重複 → 碎片 +1 後的碎片數 */
  copies?: number;
  /** 場景重複 → 換成的金幣 */
  gold?: number;
  /** 裝飾物 → 取得後的數量 */
  count?: number;
}

/** 一鍵升級：一張魚卡的結果（SPEC-UGC §7.1） */
export interface CardUpgrade {
  fishType: number;
  from: number;
  to: number;
  /** 這張卡花掉的碎片 / 金幣 */
  copies: number;
  gold: number;
}

/** 一鍵升級的計畫 / 結果 */
export interface LevelUpAllPlan {
  /** 依魚卡順序（CARD_FISH_TYPES） */
  upgrades: CardUpgrade[];
  /** 總共升幾級 */
  levels: number;
  copies: number;
  gold: number;
}

export interface HomeIncome {
  pending: number;
  totalEarned: number;
  /** 平均訪客數 */
  visitors: number;
  popularity: number;
  /** 每秒抽成 */
  perSecond: number;
  /** 這次啟動補算的離線收益（只在登入後第一次通知帶） */
  offlineEarned?: number;
}

export interface RuleResult {
  ok: boolean;
  reason?: string;
}

export const OK: RuleResult = { ok: true };
export const fail = (reason: string): RuleResult => ({ ok: false, reason });
