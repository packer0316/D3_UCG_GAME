/** 房間：單人房、3 席（本人 seat 0，其他「等待加入」） */
import type { SeatData } from '@net/protocol';
import { SCENE_DEFINES, SceneType } from '@game/define/SceneDefine';
import type { FakeServer, FakeServerModule } from '../FakeServer';
import { SMART_FILTER_ORDER, SUPPORTED_FISH_TYPES } from '../config/scheduleConfig';

export const ROOM_CONFIG = {
  roomName: '狂歡32房',
  seatCount: 3,
  yourSeat: 0,
  initMoney: 31_708_504,
  betList: [10, 50, 100, 500, 1000, 5000],
  defaultBet: 500,
  sceneType: SceneType.Snow as number,
  vip: 6, // 暫時固定 VIP6（VipLevel.VIP_6 紫金）
};

export class RoomModule implements FakeServerModule {
  readonly id = 'room';
  private server!: FakeServer;
  readonly seats: (SeatData | null)[] = [];
  readonly yourSeat = ROOM_CONFIG.yourSeat;
  readonly betList = ROOM_CONFIG.betList;
  /** 目前場景（排程 / 召喚依此限制魚種，SPEC §15.4） */
  sceneType = ROOM_CONFIG.sceneType;

  install(server: FakeServer): void {
    this.server = server;
    for (let i = 0; i < ROOM_CONFIG.seatCount; i++) this.seats.push(null);
    this.seats[this.yourSeat] = {
      seatIndex: this.yourSeat,
      accountId: 1,
      name: 'Player',
      vip: ROOM_CONFIG.vip,
      money: ROOM_CONFIG.initMoney,
      bet: ROOM_CONFIG.defaultBet,
    };

    server.on('U2G_LOGIN_REQ', () => {
      server.send('G2U_ROOM_DATA_NOTIFY', {
        yourseat: this.yourSeat,
        sceneType: this.sceneType,
        seats: this.seats,
        betList: this.betList,
        roomName: ROOM_CONFIG.roomName,
      });
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

  addMoney(delta: number): number {
    this.self.money += delta;
    return this.self.money;
  }

  /**
   * 換場景（原版 server 送 G2U_CHANGE_SCENE_NOTIFY）：通知 client → 清掉腳本、新場景從頭排程（SPEC §15.3）。
   * 未定義的場景或已在該場景 → false
   */
  changeScene(sceneType: number): boolean {
    if (!SCENE_DEFINES[sceneType] || sceneType === this.sceneType) return false;
    this.sceneType = sceneType;
    this.server.send('G2U_CHANGE_SCENE_NOTIFY', { type: sceneType });
    this.server.script.resetScene();
    return true;
  }

  /** debug：補錢 */
  setMoney(m: number): void {
    this.self.money = m;
    this.server.send('G2U_SEAT_MONEY_NOTIFY', { seat: this.yourSeat, seatMoney: m });
  }
}
