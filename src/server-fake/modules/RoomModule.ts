/**
 * 房間：單人房、3 席（本人 seat 0，其他「等待加入」）+ 目前所在房間的狀態（SPEC-UGC §2）
 *
 * - 目前房間（current）= 公有地或某個家園；輪替表（場景格）依時間換格，場景不同才轉場清場
 * - 允許魚種 = 目前場景格放出的龍（含附帶魚種，例如蒼龍翅膀）；魚群排程依此過濾
 * - 餘額以玩家資產（ProfileStore）為準，座位資料同步
 */
import '@game/ugc/UgcProtocol';
import type { SeatData } from '@net/protocol';
import { SCENE_DEFINES, SceneType, isSkyScene } from '@game/define/SceneDefine';
import { cardOf, expandCards } from '@game/ugc/CardDefine';
import { fishMultiplier } from '@game/ugc/CultivateRule';
import { PUBLIC_ROOM_ID } from '@game/ugc/UgcDefine';
import type { RoomDetail, RoomState } from '@game/ugc/UgcTypes';
import type { FakeServer, FakeServerModule } from '../FakeServer';
import { SMART_FILTER_ORDER, SUPPORTED_FISH_TYPES } from '../config/scheduleConfig';

export const ROOM_CONFIG = {
  seatCount: 3,
  yourSeat: 0,
  betList: [10, 50, 100, 500, 1000, 5000],
  defaultBet: 500,
  vip: 6, // 暫時固定 VIP6（VipLevel.VIP_6 紫金）
};

export class RoomModule implements FakeServerModule {
  readonly id = 'room';
  private server!: FakeServer;
  readonly seats: (SeatData | null)[] = [];
  readonly yourSeat = ROOM_CONFIG.yourSeat;
  readonly betList = ROOM_CONFIG.betList;
  /** 目前所在房間 */
  current!: RoomDetail;
  /** 目前在輪替表的第幾格 */
  slotIndex = 0;
  /** 這一格結束的 server 時間（毫秒） */
  private slotEndsAt = 0;
  /** 目前場景（排程 / 召喚依此限制魚種，SPEC §15.4） */
  sceneType: number = SceneType.NONE;
  /** 裝潢模式中：暫停輪替與魚群 */
  editing = false;
  /** 我在這間房貢獻給屋主的抽成（別人的家園才有） */
  visitCommission = 0;
  private commissionDirty = false;
  private nextCommissionNotify = 0;
  /** 目前場景格允許的魚種 */
  private allowed = new Set<number>();

  install(server: FakeServer): void {
    this.server = server;
    const profile = server.profile.profile;
    for (let i = 0; i < ROOM_CONFIG.seatCount; i++) this.seats.push(null);
    this.seats[this.yourSeat] = {
      seatIndex: this.yourSeat,
      accountId: profile.accountId,
      name: profile.name,
      vip: ROOM_CONFIG.vip,
      money: profile.money,
      bet: ROOM_CONFIG.defaultBet,
    };
    this.setRoom(server.world.getRoom(PUBLIC_ROOM_ID)!, false);

    server.on('U2G_LOGIN_REQ', () => {
      server.sendProfile();
      this.sendRoomData();
      server.home.sendIncome();
    });
    server.on('U2G_SMART_FILTER_LIST_REQ', () => {
      server.send('G2U_SMART_FILTER_LIST_ACK', { fishIds: SMART_FILTER_ORDER.filter((t) => SUPPORTED_FISH_TYPES.has(t)) });
    });
    server.on('U2G_CHANGE_BET_REQ', ({ bet }) => {
      const seat = this.self;
      if (this.betList.includes(bet)) seat.bet = bet;
    });
  }

  get self(): SeatData {
    return this.seats[this.yourSeat]!;
  }

  // ------------------------------------------------------------------
  // 餘額（以玩家資產為準）
  // ------------------------------------------------------------------

  addMoney(delta: number): number {
    const p = this.server.profile;
    p.profile.money += delta;
    p.markDirty();
    this.self.money = p.profile.money;
    return this.self.money;
  }

  /** 其他模組直接改了 profile.money（抽卡 / 升級 / 領取）→ 同步座位並通知 client */
  syncMoney(): void {
    this.self.money = this.server.profile.profile.money;
    this.server.send('G2U_SEAT_MONEY_NOTIFY', { seat: this.yourSeat, seatMoney: this.self.money });
  }

  /** debug：補錢 */
  setMoney(m: number): void {
    this.server.profile.profile.money = m;
    this.server.profile.markDirty();
    this.syncMoney();
  }

  // ------------------------------------------------------------------
  // 房間
  // ------------------------------------------------------------------

  private get slotMs(): number {
    return this.current.slotSeconds * 1000;
  }

  /** 換到某間房的狀態（不送封包）。fromStart = 從第一格開始；否則依時鐘決定第幾格 */
  private setRoom(room: RoomDetail, fromStart: boolean): void {
    this.current = room;
    this.editing = false;
    this.visitCommission = 0;
    this.commissionDirty = false;
    const now = this.server.now();
    const n = room.slots.length;
    if (fromStart || n <= 1) {
      this.slotIndex = 0;
      this.slotEndsAt = now + this.slotMs;
    } else {
      const wall = this.server.wallClock();
      this.slotIndex = Math.floor(wall / this.slotMs) % n;
      this.slotEndsAt = now + (this.slotMs - (wall % this.slotMs));
    }
    this.applySlot();
    this.sceneType = room.slots[this.slotIndex].sceneType;
  }

  private applySlot(): void {
    this.allowed = expandCards(this.current.slots[this.slotIndex].fishTypes);
  }

  /** 進房：退回飛行中的子彈 → 換房 → 送房間資料（魚群等 client 的 U2G_SYNC_SCRIPT_REQ 再回填） */
  enter(roomId: number, fromStart = false): boolean {
    const room = this.server.world.getRoom(roomId);
    if (!room) return false;
    this.server.shoot.refundAll();
    this.setRoom(room, fromStart);
    this.server.script.reset();
    this.sendRoomData();
    return true;
  }

  /** 目前房間的內容改了（家園輪替表）→ 從第一格重新開始 */
  restartCurrent(): void {
    this.enter(this.current.roomId, true);
  }

  /** 目前房間的等級 / 人氣改了 → 更新內容並通知 client（不清場） */
  refreshInfo(): void {
    const room = this.server.world.getRoom(this.current.roomId);
    if (!room) return;
    this.current = room;
    this.server.send('G2U_ROOM_INFO_NOTIFY', { room: this.state() });
  }

  state(): RoomState {
    return { ...this.current, slotIndex: this.slotIndex, slotRemainMs: Math.max(0, this.slotEndsAt - this.server.now()) };
  }

  private sendRoomData(): void {
    const s = this.server;
    s.send('G2U_ROOM_INFO_NOTIFY', { room: this.state() });
    s.send('G2U_ROOM_DATA_NOTIFY', {
      yourseat: this.yourSeat,
      sceneType: this.sceneType,
      seats: this.seats,
      betList: this.betList,
      roomName: this.current.name,
    });
  }

  get isHome(): boolean {
    return this.current.kind === 'home';
  }

  /** 別人的家園（抽成、掉券等級加成） */
  get isOthersHome(): boolean {
    return this.current.kind === 'home' && !this.current.isMine;
  }

  /** 目前場景格有沒有放出這種魚 */
  isAllowed(fishType: number): boolean {
    return this.allowed.has(fishType);
  }

  /** 這種魚在這間房的等級（公有地一律 1；蒼龍翅膀跟著蒼龍） */
  fishLevel(fishType: number): number {
    return this.isHome ? (this.current.levels[cardOf(fishType)] ?? 1) : 1;
  }

  /** 這種魚在這間房的賠率倍率（公有地 = 原倍率 ×1；家園看魚卡等級，SPEC-UGC §7） */
  fishMultiplier(fishType: number): number {
    return this.isHome ? fishMultiplier(fishType, this.fishLevel(fishType)) : 1;
  }

  // ------------------------------------------------------------------
  // 場景輪替
  // ------------------------------------------------------------------

  /** 換到第 idx 格：場景不同才轉場清場；同場景只換放出的魚 */
  private gotoSlot(idx: number): void {
    this.slotIndex = idx;
    this.slotEndsAt = this.server.now() + this.slotMs;
    this.applySlot();
    const scene = this.current.slots[idx].sceneType;
    if (scene !== this.sceneType) this.setScene(scene);
    this.server.send('G2U_ROOM_SLOT_NOTIFY', { slotIndex: idx, slotRemainMs: this.slotMs });
  }

  /** 通知 client 換場景 → 清掉腳本、新場景從頭排程（SPEC §15.3） */
  private setScene(sceneType: number): void {
    this.sceneType = sceneType;
    this.server.send('G2U_CHANGE_SCENE_NOTIFY', { type: sceneType });
    this.server.script.resetScene();
  }

  /**
   * 指定場景（debug 下拉選單）：輪替表有這個場景 → 跳到那一格；
   * 沒有 → 臨時換場景（放出的魚不變，到下一次輪替為止）。未定義的場景或已在該場景 → false
   */
  changeScene(sceneType: number): boolean {
    if (!SCENE_DEFINES[sceneType] || sceneType === this.sceneType) return false;
    const idx = this.current.slots.findIndex((s) => s.sceneType === sceneType);
    if (idx >= 0) this.gotoSlot(idx);
    else this.setScene(sceneType);
    return true;
  }

  /**
   * 裝潢模式（只有自己的家園）：進入 → 暫停輪替與魚群，天空場景先換到第一個地面場景格；
   * 離開 → 輪替重新計時、魚群回填
   */
  setEditing(editing: boolean): boolean {
    if (!this.current.isMine) return false;
    if (editing === this.editing) return true;
    this.editing = editing;
    if (editing) {
      if (isSkyScene(this.sceneType)) {
        const ground = this.current.slots.findIndex((s) => !isSkyScene(s.sceneType));
        if (ground >= 0) this.gotoSlot(ground);
      }
      this.server.script.pause();
    } else {
      this.slotEndsAt = this.server.now() + this.slotMs;
      this.server.script.resume();
    }
    return true;
  }

  /** 在別人的家園命中：記錄貢獻給屋主的抽成 */
  addVisitCommission(amount: number): void {
    this.visitCommission += amount;
    this.commissionDirty = true;
  }

  tick(now: number): void {
    if (this.commissionDirty && now >= this.nextCommissionNotify) {
      this.commissionDirty = false;
      this.nextCommissionNotify = now + 500;
      this.server.send('G2U_VISIT_COMMISSION_NOTIFY', { total: Math.floor(this.visitCommission) });
    }
    if (this.editing || this.current.slots.length <= 1 || now < this.slotEndsAt) return;
    this.gotoSlot((this.slotIndex + 1) % this.current.slots.length);
  }
}
