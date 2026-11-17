/**
 * UGC 協定（SPEC-UGC §10）：以 declaration merging 加進 @net/protocol，不改原本的協定檔。
 * client（features/ugc）與假 server（server-fake/ugc）都要 import 這個檔。
 */
import type { DecoPlacement, GachaResult, HomeIncome, HomeSlot, LevelUpAllPlan, PlayerProfile, RoomDetail, RoomState } from './UgcTypes';

/** 請求的共通回覆 */
export interface UgcAck {
  ok: boolean;
  /** 失敗原因（給玩家看的文字） */
  reason?: string;
}

/** Debug 工具（U2G_DEBUG_CLIENT_TOOL_USE_REQ 的 toolType，接在原本的後面） */
export const UgcDebugTool = {
  /** quantity = 張數 */
  AddTickets: 200,
  /** 解鎖全部魚卡 / 場景 / 裝飾物 */
  UnlockAll: 201,
  ResetProfile: 202,
} as const;

declare module '@net/protocol' {
  interface ClientToServer {
    U2G_ROOM_LIST_REQ: Record<string, never>;
    U2G_ENTER_ROOM_REQ: { roomId: number };
    U2G_GACHA_DRAW_REQ: { times: number };
    U2G_CARD_LEVELUP_REQ: { fishType: number };
    /** 一鍵升級；maxGold = 確認框的金幣總花費（server 的預算上限） */
    U2G_CARD_LEVELUP_ALL_REQ: { maxGold: number };
    U2G_HOME_SAVE_REQ: { slots: HomeSlot[] };
    /** 進入 / 離開裝潢模式（暫停 / 恢復這間房的魚群與輪替） */
    U2G_HOME_EDIT_REQ: { editing: boolean };
    U2G_HOME_DECO_SAVE_REQ: { items: DecoPlacement[] };
    U2G_HOME_CLAIM_REQ: Record<string, never>;
  }

  interface ServerToClient {
    G2U_ROOM_LIST_ACK: { rooms: RoomDetail[]; currentRoomId: number };
    G2U_ENTER_ROOM_ACK: UgcAck & { roomId: number };
    /** 進房：房間內容（緊接在 G2U_ROOM_DATA_NOTIFY 之前送） */
    G2U_ROOM_INFO_NOTIFY: { room: RoomState };
    /** 換場景格（場景不同時另外會送 G2U_CHANGE_SCENE_NOTIFY） */
    G2U_ROOM_SLOT_NOTIFY: { slotIndex: number; slotRemainMs: number };
    /** 目前房間的裝潢更新 */
    G2U_ROOM_DECO_NOTIFY: { items: DecoPlacement[] };
    /** 玩家資產（完整快照；登入後與每次變動時） */
    G2U_PROFILE_NOTIFY: { profile: PlayerProfile };
    /** 掉抽卡券（在對應的擊殺通知之前送） */
    G2U_TICKET_DROP_NOTIFY: { scriptIdData: ScriptIdData; count: number; tickets: number };
    G2U_GACHA_DRAW_ACK: UgcAck & { results: GachaResult[] };
    G2U_CARD_LEVELUP_ACK: UgcAck & { fishType: number; level: number };
    G2U_CARD_LEVELUP_ALL_ACK: UgcAck & LevelUpAllPlan;
    G2U_HOME_SAVE_ACK: UgcAck;
    G2U_HOME_EDIT_ACK: UgcAck & { editing: boolean };
    G2U_HOME_DECO_SAVE_ACK: UgcAck;
    G2U_HOME_CLAIM_ACK: { amount: number; seatMoney: number };
    /** 家園收益（線上時定期送） */
    G2U_HOME_INCOME_NOTIFY: HomeIncome;
    /** 我在這間房已貢獻給屋主的抽成 */
    G2U_VISIT_COMMISSION_NOTIFY: { total: number };
  }
}
