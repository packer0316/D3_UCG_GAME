/**
 * 座位 / 押注 / 餘額。
 * 餘額顯示 = server seatMoney − 尚未被 server 確認的開砲成本（本地預扣，避免連射時數字跳動）。
 */
import type { SeatData } from '@net/protocol';
import { SEAT_ANCHORS, SEAT_COUNT } from '../define/CannonDefine';
import { WIN_CIRCLE_ANCHOR_OFFSET_Y } from '../define/RewardDefine';
import type { GameContext } from '../GameContext';

export class SeatSystem {
  yourSeat = 0;
  roomName = '';
  seats: (SeatData | null)[] = new Array(SEAT_COUNT).fill(null);
  betList: number[] = [];
  private betIndex = 0;
  private serverMoney = 0;
  private pending = new Map<number, number>();

  constructor(private readonly ctx: GameContext) {}

  init(): void {
    const { net, events } = this.ctx;
    net.on('G2U_ROOM_DATA_NOTIFY', (d) => {
      this.yourSeat = d.yourseat;
      this.roomName = d.roomName;
      this.betList = [...d.betList].sort((a, b) => a - b);
      this.seats = d.seats;
      const self = d.seats[d.yourseat];
      // 換房：飛行中的子彈 server 已退款，房間資料帶的是最新餘額
      this.pending.clear();
      this.serverMoney = self?.money ?? 0;
      const bi = this.betList.indexOf(self?.bet ?? this.betList[0]);
      this.betIndex = bi >= 0 ? bi : 0;
      events.emit('room:ready', { yourSeat: d.yourseat, roomName: d.roomName, betList: this.betList });
      d.seats.forEach((s, i) => events.emit('seat:update', { seat: i, data: s }));
      this.emitMoney();
      events.emit('seat:bet', { seat: this.yourSeat, bet: this.bet });
    });
    net.on('G2U_SHOOT_NOTIFY', (d) => {
      if (d.seat !== this.yourSeat) return;
      this.pending.delete(d.bulletId);
      this.setServerMoney(d.seatMoney);
    });
    net.on('G2U_SHOOT_REJECT', (d) => {
      this.pending.delete(d.bulletId);
      this.setServerMoney(d.seatMoney);
    });
    net.on('G2U_DUD_ACK', (d) => this.setServerMoney(d.seatMoney));
    net.on('G2U_KILL_FLOATODDS_FISH_NOTIFY', (d) => {
      if (d.seatIndex === this.yourSeat) this.setServerMoney(d.seatMoney);
      else {
        const s = this.seats[d.seatIndex];
        if (s) s.money = d.seatMoney;
        events.emit('seat:money', { seat: d.seatIndex, money: d.seatMoney });
      }
    });
    net.on('G2U_SEAT_MONEY_NOTIFY', (d) => {
      if (d.seat === this.yourSeat) this.setServerMoney(d.seatMoney);
    });
  }

  private setServerMoney(m: number): void {
    this.serverMoney = m;
    this.emitMoney();
  }

  private emitMoney(): void {
    this.ctx.events.emit('seat:money', { seat: this.yourSeat, money: this.displayMoney });
  }

  get displayMoney(): number {
    let p = 0;
    for (const c of this.pending.values()) p += c;
    return this.serverMoney - p;
  }

  /** 開砲本地預扣 */
  predictShot(bulletId: number, cost: number): void {
    this.pending.set(bulletId, cost);
    this.emitMoney();
  }

  get bet(): number {
    return this.betList[this.betIndex] ?? 0;
  }

  /** ±1 格，兩端夾住（FishBaseBetMgr） */
  changeBet(delta: number): void {
    if (!this.betList.length) return;
    const next = Math.min(this.betList.length - 1, Math.max(0, this.betIndex + delta));
    if (next === this.betIndex) return;
    this.betIndex = next;
    this.ctx.net.send('U2G_CHANGE_BET_REQ', { bet: this.bet });
    this.ctx.events.emit('seat:bet', { seat: this.yourSeat, bet: this.bet });
  }

  get canBetUp(): boolean {
    return this.betIndex < this.betList.length - 1;
  }
  get canBetDown(): boolean {
    return this.betIndex > 0;
  }

  /** 座位砲台錨點（設計座標） */
  seatAnchor(seat: number): { x: number; y: number } {
    const a = SEAT_ANCHORS[seat] ?? SEAT_ANCHORS[0];
    return { x: this.ctx.stage.designWidth / 2 + a.dx, y: a.y };
  }

  /** 獎圈錨點（設計座標） */
  winCircleAnchor(seat: number): { x: number; y: number } {
    const a = this.seatAnchor(seat);
    return { x: a.x, y: a.y + WIN_CIRCLE_ANCHOR_OFFSET_Y };
  }

  /** 餘額文字位置 + (-25, 50)（DropItemMgr:JumpValueAtSeat） */
  moneyJumpPos(seat: number): { x: number; y: number } {
    const a = this.seatAnchor(seat);
    return { x: a.x + 95 - 25, y: 22 + 50 };
  }
}
