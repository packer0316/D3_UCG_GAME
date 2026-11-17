/**
 * 戰鬥 HUD：座位面板（押注 / 餘額 / ± 按鈕 / 等待加入）、左上房間。
 * 右側技能按鈕改由 SkillPanel（原版 Card.csd）負責。
 * 圖片使用原版 MainUI.plist / common.plist 影格（SeatInfo.csd：Block_5、BetMinus/BetPlus、EmptySeat_font、d_coin_min1）。
 */
import { formatCurrency } from '@core/math/cocos';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { SEAT_ANCHORS, SEAT_COUNT } from '@game/define/CannonDefine';
import type { UIRoot } from './UIRoot';

export const HUD_PLISTS = ['DinosaurExport/plist/MainUI.plist', 'DinosaurExport/plist/common.plist'];

interface SeatView {
  root: HTMLDivElement;
  money: HTMLDivElement | null;
  bet: HTMLDivElement | null;
}

export class Hud {
  private seats: SeatView[] = [];
  private roomLabel: HTMLDivElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: UIRoot,
  ) {
    const hud = ui.layers.hud;
    this.roomLabel = document.createElement('div');
    this.roomLabel.className = 'top-room';
    this.roomLabel.textContent = '…';
    hud.appendChild(this.roomLabel);

    for (let i = 0; i < SEAT_COUNT; i++) {
      const root = document.createElement('div');
      root.className = 'seat-panel';
      hud.appendChild(root);
      this.seats.push({ root, money: null, bet: null });
    }
    ui.onResize(() => this.layout());
    this.layout();

    const { events } = ctx;
    events.on('room:ready', (d) => (this.roomLabel.textContent = d.roomName));
    events.on('seat:update', ({ seat, data }) => this.renderSeat(seat, !!data, data?.name ?? ''));
    events.on('seat:money', ({ seat, money }) => {
      const m = this.seats[seat]?.money;
      if (m) m.lastChild!.textContent = formatCurrency(money);
    });
    events.on('seat:bet', ({ seat, bet }) => {
      const b = this.seats[seat]?.bet;
      if (b) b.textContent = formatCurrency(bet);
    });
    events.on('shoot:reject', ({ reason }) => ui.toast(reason === 'money' ? '餘額不足' : '押注無效'));
  }

  private layout(): void {
    const W = this.ui.width;
    this.seats.forEach((s, i) => {
      s.root.style.left = `${W / 2 + SEAT_ANCHORS[i].dx}px`;
    });
  }

  private renderSeat(seat: number, occupied: boolean, name: string): void {
    const v = this.seats[seat];
    if (!v) return;
    v.root.innerHTML = '';
    v.money = v.bet = null;
    const seatSys = this.ctx.services.get(Tokens.SeatSystem);
    if (!occupied) {
      const empty = document.createElement('div');
      empty.className = 'seat-empty';
      const img = document.createElement('div');
      if (!this.ui.applyFrame(img, 'EmptySeat_font.png')) {
        img.className = 'seat-empty-text';
        img.textContent = '等待加入';
      }
      empty.appendChild(img);
      v.root.appendChild(empty);
      return;
    }
    const isSelf = seat === seatSys.yourSeat;

    const bet = document.createElement('div');
    bet.className = 'seat-bet';
    v.root.appendChild(bet);
    v.bet = bet;

    const label = document.createElement('div');
    label.className = 'seat-name';
    label.textContent = name;
    v.root.appendChild(label);

    const money = document.createElement('div');
    money.className = 'seat-money';
    const coin = document.createElement('div');
    coin.className = 'seat-coin';
    this.ui.applyFrame(coin, 'd_coin_min1.png');
    money.appendChild(coin);
    money.appendChild(document.createElement('span'));
    v.root.appendChild(money);
    v.money = money;

    if (isSelf) {
      const mk = (cls: string, frame: string, text: string, delta: number) => {
        const b = document.createElement('button');
        b.className = `seat-btn ${cls} ui-interactive`;
        if (!this.ui.applyFrame(b, frame)) {
          b.classList.add('fallback');
          b.textContent = text;
        }
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          seatSys.changeBet(delta);
        });
        v.root.appendChild(b);
      };
      mk('minus', 'BetMinus.png', '−', -1);
      mk('plus', 'BetPlus.png', '+', 1);
    }
    bet.textContent = formatCurrency(seatSys.bet);
    (money.lastChild as HTMLSpanElement).textContent = formatCurrency(seatSys.displayMoney);
  }

}
