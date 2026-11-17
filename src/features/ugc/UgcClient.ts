/**
 * UGC client 資料層（SPEC-UGC §11.3）：保存 server 送來的玩家資產 / 房間內容 / 家園收益快照，
 * 轉成遊戲事件（ugc:profile / ugc:room / ugc:income / ugc:commission），並提供送請求的方法。
 * 介面與裝潢模式都透過它（服務 token：UgcToken）取資料，不直接碰 net。
 */
import '@game/ugc/UgcProtocol';
import { createToken } from '@core/services/ServiceRegistry';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import type { ServerToClient } from '@net/protocol';
import { MY_HOME_ROOM_ID } from '@game/ugc/UgcDefine';
import type { UgcAck } from '@game/ugc/UgcProtocol';
import type { DecoPlacement, HomeIncome, HomeSlot, PlayerProfile, RoomDetail, RoomState } from '@game/ugc/UgcTypes';

export class UgcClient {
  profile: PlayerProfile | null = null;
  room: RoomState | null = null;
  income: HomeIncome | null = null;
  /** 我在目前這間房貢獻給屋主的抽成 */
  visitCommission = 0;

  constructor(private readonly ctx: GameContext) {}

  init(): void {
    const { net, events } = this.ctx;
    net.on('G2U_PROFILE_NOTIFY', ({ profile }) => {
      this.profile = profile;
      events.emit('ugc:profile', { profile });
    });
    net.on('G2U_ROOM_INFO_NOTIFY', ({ room }) => {
      // 換了一間房：抽成從 0 開始算
      if (room.roomId !== this.room?.roomId) this.setCommission(0);
      this.room = room;
      events.emit('ugc:room', { room });
    });
    net.on('G2U_ROOM_DATA_NOTIFY', () => this.setCommission(0));
    net.on('G2U_ROOM_SLOT_NOTIFY', ({ slotIndex, slotRemainMs }) => {
      if (!this.room) return;
      this.room = { ...this.room, slotIndex, slotRemainMs };
      events.emit('ugc:room', { room: this.room });
    });
    net.on('G2U_ROOM_DECO_NOTIFY', ({ items }) => {
      if (!this.room) return;
      this.room = { ...this.room, deco: items };
      events.emit('ugc:room', { room: this.room });
    });
    net.on('G2U_TICKET_DROP_NOTIFY', ({ tickets }) => {
      if (!this.profile) return;
      this.profile = { ...this.profile, tickets };
      events.emit('ugc:profile', { profile: this.profile });
    });
    net.on('G2U_HOME_INCOME_NOTIFY', (income) => {
      this.income = income;
      events.emit('ugc:income', income);
    });
    net.on('G2U_VISIT_COMMISSION_NOTIFY', ({ total }) => this.setCommission(total));
    // 資產快照不會每發子彈都送：金幣跟著座位餘額更新（魚卡面板判斷金幣夠不夠用）
    events.on('seat:money', ({ seat, money }) => {
      if (this.profile && seat === this.ctx.services.get(Tokens.SeatSystem).yourSeat) this.profile.money = money;
    });
  }

  private setCommission(total: number): void {
    if (total === this.visitCommission) return;
    this.visitCommission = total;
    this.ctx.events.emit('ugc:commission', { total });
  }

  /** 人在自己的家園 */
  get atHome(): boolean {
    return !!this.room?.isMine;
  }

  /** 魚卡等級（沒有這張卡 = 0） */
  cardLevel(fishType: number): number {
    return this.profile?.fish[fishType]?.level ?? 0;
  }

  // ------------------------------------------------------------------
  // 請求（回傳 server 的回覆；逾時當作失敗）
  // ------------------------------------------------------------------

  private async ask<K extends keyof ServerToClient>(send: () => void, ack: K): Promise<ServerToClient[K] | null> {
    const wait = this.ctx.net.wait(ack, 8000);
    send();
    try {
      return await wait;
    } catch {
      return null;
    }
  }

  async listRooms(): Promise<{ rooms: RoomDetail[]; currentRoomId: number }> {
    const r = await this.ask(() => this.ctx.net.send('U2G_ROOM_LIST_REQ', {}), 'G2U_ROOM_LIST_ACK');
    return r ?? { rooms: [], currentRoomId: this.room?.roomId ?? 0 };
  }

  /** 換房；成功後會收到新的房間資料（room:ready） */
  async enterRoom(roomId: number): Promise<UgcAck> {
    if (roomId === this.room?.roomId) return { ok: true };
    const r = await this.ask(() => this.ctx.net.send('U2G_ENTER_ROOM_REQ', { roomId }), 'G2U_ENTER_ROOM_ACK');
    return r ?? { ok: false, reason: '連線逾時' };
  }

  goHome(): Promise<UgcAck> {
    return this.enterRoom(MY_HOME_ROOM_ID);
  }

  async draw(times: number): Promise<ServerToClient['G2U_GACHA_DRAW_ACK']> {
    const r = await this.ask(() => this.ctx.net.send('U2G_GACHA_DRAW_REQ', { times }), 'G2U_GACHA_DRAW_ACK');
    return r ?? { ok: false, reason: '連線逾時', results: [] };
  }

  async levelUp(fishType: number): Promise<UgcAck> {
    const r = await this.ask(() => this.ctx.net.send('U2G_CARD_LEVELUP_REQ', { fishType }), 'G2U_CARD_LEVELUP_ACK');
    return r ?? { ok: false, reason: '連線逾時' };
  }

  /** 一鍵升級；maxGold = 確認框顯示的金幣總花費（server 不會花超過） */
  async levelUpAll(maxGold: number): Promise<ServerToClient['G2U_CARD_LEVELUP_ALL_ACK']> {
    const r = await this.ask(() => this.ctx.net.send('U2G_CARD_LEVELUP_ALL_REQ', { maxGold }), 'G2U_CARD_LEVELUP_ALL_ACK');
    return r ?? { ok: false, reason: '連線逾時', upgrades: [], levels: 0, copies: 0, gold: 0 };
  }

  async saveHome(slots: HomeSlot[]): Promise<UgcAck> {
    const r = await this.ask(() => this.ctx.net.send('U2G_HOME_SAVE_REQ', { slots }), 'G2U_HOME_SAVE_ACK');
    return r ?? { ok: false, reason: '連線逾時' };
  }

  async setEditing(editing: boolean): Promise<UgcAck> {
    const r = await this.ask(() => this.ctx.net.send('U2G_HOME_EDIT_REQ', { editing }), 'G2U_HOME_EDIT_ACK');
    return r ?? { ok: false, reason: '連線逾時' };
  }

  async saveDeco(items: DecoPlacement[]): Promise<UgcAck> {
    const r = await this.ask(() => this.ctx.net.send('U2G_HOME_DECO_SAVE_REQ', { items }), 'G2U_HOME_DECO_SAVE_ACK');
    return r ?? { ok: false, reason: '連線逾時' };
  }

  async claim(): Promise<number> {
    const r = await this.ask(() => this.ctx.net.send('U2G_HOME_CLAIM_REQ', {}), 'G2U_HOME_CLAIM_ACK');
    return r?.amount ?? 0;
  }
}

export const UgcToken = createToken<UgcClient>('Ugc');
