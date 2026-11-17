/**
 * 掉抽卡券的表演（SPEC-UGC §4）：券從魚的位置飛到上方功能列的抽卡按鈕，按鈕跳一下。
 * server 把 G2U_TICKET_DROP_NOTIFY 排在擊殺通知之前送，所以這時還找得到那隻魚。
 */
import '@game/ugc/UgcProtocol';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { el } from '../ui/dom';

const FLY_MS = 700;

export class TicketDropFx {
  constructor(
    private readonly ctx: GameContext,
    /** 落點：功能列的抽卡按鈕 */
    private readonly target: HTMLElement,
  ) {
    ctx.net.on('G2U_TICKET_DROP_NOTIFY', ({ scriptIdData, count }) => this.play(scriptIdData.groupIndex * 1000 + scriptIdData.fishIndex, count));
  }

  private play(serial: number, count: number): void {
    const { stage, ui } = this.ctx;
    const fish = this.ctx.services.get(Tokens.FishSystem).getFish(serial);
    // 設計座標原點在左下，DOM 在左上
    const from = fish ? stage.worldToDesign(fish.getLockPos()) : { x: ui.width / 2, y: ui.height / 2 };
    const rect = this.target.getBoundingClientRect();
    const to = stage.clientToDesign(rect.left + rect.width / 2, rect.top + rect.height / 2);

    const ticket = el('div', 'ugc-ticket-fly', `+${count}`);
    ticket.style.left = `${from.x}px`;
    ticket.style.top = `${ui.height - from.y}px`;
    ui.layers.toast.appendChild(ticket);
    const dx = to.x - from.x;
    const dy = -(to.y - from.y);
    const anim = ticket.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -90%) scale(1.25)', opacity: 1, offset: 0.25 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 1 },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
    );
    const done = () => {
      ticket.remove();
      this.target.classList.remove('ugc-pulse');
      // 重新觸發動畫
      void this.target.offsetWidth;
      this.target.classList.add('ugc-pulse');
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }
}
