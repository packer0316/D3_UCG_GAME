/** 房間：單人房、3 席（本人 seat 0，其他「等待加入」） */
import type { SeatData } from '@net/protocol';
import type { FakeServer, FakeServerModule } from '../FakeServer';

export const ROOM_CONFIG = {
  roomName: '狂歡32房',
  seatCount: 3,
  yourSeat: 0,
  initMoney: 31_708_504,
  betList: [10, 50, 100, 500, 1000, 5000],
  defaultBet: 500,
  sceneType: 2, // Snow
};

export class RoomModule implements FakeServerModule {
  readonly id = 'room';
  private server!: FakeServer;
  readonly seats: (SeatData | null)[] = [];
  readonly yourSeat = ROOM_CONFIG.yourSeat;
  readonly betList = ROOM_CONFIG.betList;

  install(server: FakeServer): void {
    this.server = server;
    for (let i = 0; i < ROOM_CONFIG.seatCount; i++) this.seats.push(null);
    this.seats[this.yourSeat] = {
      seatIndex: this.yourSeat,
      accountId: 1,
      name: 'Player',
      money: ROOM_CONFIG.initMoney,
      bet: ROOM_CONFIG.defaultBet,
    };

    server.on('U2G_LOGIN_REQ', () => {
      server.send('G2U_ROOM_DATA_NOTIFY', {
        yourseat: this.yourSeat,
        sceneType: ROOM_CONFIG.sceneType,
        seats: this.seats,
        betList: this.betList,
        roomName: ROOM_CONFIG.roomName,
      });
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

  /** debug：補錢 */
  setMoney(m: number): void {
    this.self.money = m;
    this.server.send('G2U_SEAT_MONEY_NOTIFY', { seat: this.yourSeat, seatMoney: m });
  }
}
