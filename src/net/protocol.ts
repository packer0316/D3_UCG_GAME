/**
 * 通訊協定（真 / 假 server 共用）。訊息名稱沿用原版（ProtocolData.lua / Protocol.h），欄位精簡。
 *
 * 擴充：其他功能（例如抽卡）用 declaration merging 加訊息，不必改這個檔：
 *   declare module '@net/protocol' {
 *     interface ClientToServer { U2G_GACHA_DRAW_REQ: { poolId: number; times: number } }
 *     interface ServerToClient { G2U_GACHA_DRAW_ACK: { ... } }
 *   }
 */

/** 魚的識別：serial = groupIndex * 1000 + fishIndex（原版 FishSystem） */
export interface ScriptIdData {
  groupIndex: number;
  fishIndex: number;
}

export const toSerial = (id: ScriptIdData) => id.groupIndex * 1000 + id.fishIndex;

export interface SeatData {
  seatIndex: number;
  accountId: number;
  name: string;
  /** VIP 等級（VipDefine.VipLevel） */
  vip: number;
  money: number;
  bet: number;
}

export interface GroupSyncData {
  groupIndex: number;
  groupId: number;
  /** 群組已經過時間（毫秒） */
  timeline: number;
  isPause: boolean;
  deadFishes: number[];
}

export interface ScriptSyncData {
  /** 房間時間（毫秒） */
  timeline: number;
  fin: boolean;
  list: GroupSyncData[];
}

export interface KillFloatOddsNotify {
  accountId: number;
  scriptIdData: ScriptIdData;
  fishType: number;
  /** 表演類型（各魚自行定義；與 FishKillShowSetting.bossShowType 相等 = BossShow） */
  showType: number;
  /** 贏分 */
  money: number;
  seatIndex: number;
  seatMoney: number;
  bet: number;
  /** 賠率 */
  floatedOdds: number;
  /** 倍率 */
  floatedRate: number;
  /** true = 給獎但魚不死 */
  unDead: boolean;
  killIndex: number;
}

export interface ClientToServer {
  U2G_LOGIN_REQ: { name?: string };
  U2G_SYNC_SCRIPT_REQ: Record<string, never>;
  U2G_SHOOT_REQ: { bulletId: number; bulletType: number; bet: number; angle: number; scriptIdDataVec: ScriptIdData[] };
  U2G_HIT_REQ: { bulletId: number; scriptIdDataVec: ScriptIdData[] };
  U2G_DUD_REQ: { bulletId: number };
  U2G_CHANGE_BET_REQ: { bet: number };
  /** 測試工具（原版 DEBUG_U2G_CLIENT_TOOL_USE_REQ）：toolType 1 = 出獎模式（target 1/0）、2 = 召喚（target = groupId） */
  U2G_DEBUG_CLIENT_TOOL_USE_REQ: { toolType: number; target: number; quantity: number };
  /** 自動（智能篩選）可選魚種清單 */
  U2G_SMART_FILTER_LIST_REQ: Record<string, never>;
}

/** 測試工具類型（TestCommonDefine.lua） */
export const DebugToolType = { CheatMode: 1, Summon: 2 } as const;
export const DebugErrorCode = { Success: 0, NotTestMode: 1, NotInRoom: 2, UseFail: 3 } as const;

export interface ServerToClient {
  G2U_ROOM_DATA_NOTIFY: {
    yourseat: number;
    sceneType: number;
    seats: (SeatData | null)[];
    betList: number[];
    roomName: string;
  };
  G2U_SYNC_SCRIPT_ACK: ScriptSyncData;
  G2U_ADD_GROUP_SYNC_NOTIFY: ScriptSyncData;
  G2U_SHOOT_NOTIFY: { seat: number; bulletId: number; bet: number; angle: number; seatMoney: number; bulletType: number };
  G2U_SHOOT_REJECT: { bulletId: number; reason: string; seatMoney: number };
  G2U_DUD_ACK: { bulletId: number; seatMoney: number; refund: number };
  G2U_KILL_FLOATODDS_FISH_NOTIFY: KillFloatOddsNotify;
  G2U_SEAT_MONEY_NOTIFY: { seat: number; seatMoney: number };
  G2U_DEBUG_CLIENT_TOOL_USE_ACK: { toolType: number; errorCode: number; target: number };
  /** 面板顯示 = 客戶端清單 ∩ fishIds，依 server 順序 */
  G2U_SMART_FILTER_LIST_ACK: { fishIds: number[] };
}

export type C2SCmd = keyof ClientToServer;
export type S2CCmd = keyof ServerToClient;

export interface NetMessage<C extends string = string, D = unknown> {
  cmd: C;
  data: D;
}
