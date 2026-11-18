/**
 * 上方功能列（SPEC-UGC §2.1）：房間（目前房間 / 場景）、魚卡、抽卡（券數）、家園（未領取抽成），
 * 以及在別人家園時的屋主資訊（已貢獻的抽成）。取代原本左上角的房間名稱。
 */
import type { GameContext } from '@game/GameContext';
import type { UgcClient } from '../UgcClient';
import { el, fmt, sceneName } from './dom';
import { uiIcon } from './icons';

export interface TopBarActions {
  rooms(): void;
  cards(): void;
  gacha(): void;
  home(): void;
}

export class TopBar {
  readonly root: HTMLDivElement;
  /** 掉券表演的落點 */
  readonly gachaButton: HTMLButtonElement;
  private readonly roomName = el('span', 'ugc-room-name', '…');
  private readonly roomSub = el('span', 'ugc-room-sub');
  private readonly ticketBadge = el('span', 'ugc-badge', '0');
  private readonly incomeBadge = el('span', 'ugc-badge gold hidden');
  private readonly visit = el('div', 'ugc-visit hidden');
  private sceneType = -1;
  private readonly buttons = new Map<keyof TopBarActions, HTMLButtonElement>();

  constructor(
    ctx: GameContext,
    private readonly ugc: UgcClient,
    actions: TopBarActions,
  ) {
    const room = el('button', 'ugc-chip', uiIcon('rooms'), el('span', 'ugc-room-copy', this.roomName, this.roomSub), el('span', 'ugc-nav-chevron', '⌄'));
    room.title = '房間列表';
    room.addEventListener('click', actions.rooms);
    const cards = el('button', 'ugc-btn ugc-nav-button', uiIcon('cards'), '魚卡');
    cards.addEventListener('click', actions.cards);
    this.gachaButton = el('button', 'ugc-btn ugc-nav-button', uiIcon('gacha'), '抽卡', this.ticketBadge);
    this.gachaButton.addEventListener('click', actions.gacha);
    const home = el('button', 'ugc-btn ugc-nav-button', uiIcon('home'), '家園', this.incomeBadge);
    home.addEventListener('click', actions.home);

    this.buttons.set('rooms', room).set('cards', cards).set('gacha', this.gachaButton).set('home', home);
    for (const b of this.buttons.values()) { b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); }
    this.root = el('div', 'ugc-topbar ui-interactive', el('div', 'ugc-nav-dock', room, cards, this.gachaButton, home), this.visit);
    this.root.setAttribute('aria-label', '遊戲功能');
    // 功能列上的點擊不要變成開砲
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    ctx.ui.layers.hud.appendChild(this.root);

    const { events } = ctx;
    events.on('ugc:room', () => this.renderRoom());
    events.on('scene:change', ({ sceneType }) => {
      this.sceneType = sceneType;
      this.renderRoom();
    });
    events.on('ugc:profile', ({ profile }) => (this.ticketBadge.textContent = fmt(profile.tickets)));
    events.on('ugc:income', () => this.renderIncome());
    events.on('ugc:commission', () => this.renderRoom());
    this.renderRoom();
  }

  setActive(name: keyof TopBarActions | null): void {
    for (const [key, button] of this.buttons) {
      button.classList.toggle('active', key === name);
      button.setAttribute('aria-expanded', String(key === name));
    }
  }

  private renderRoom(): void {
    const room = this.ugc.room;
    if (!room) return;
    this.roomName.textContent = room.name;
    const scene = this.sceneType >= 0 ? this.sceneType : room.slots[room.slotIndex]?.sceneType;
    const n = room.slots.length;
    this.roomSub.textContent = `${sceneName(scene)}${n > 1 ? `　${room.slotIndex + 1} / ${n}` : ''}`;

    // 別人的家園：屋主 + 我貢獻的抽成；自己的家園：訪客數
    let text = '';
    if (room.kind === 'home' && !room.isMine) text = `屋主 ${room.ownerName}　已貢獻抽成 ${fmt(this.ugc.visitCommission)}`;
    else if (room.isMine) text = `人氣 ${room.popularity}　訪客約 ${room.visitors} 人`;
    this.visit.textContent = text;
    this.visit.classList.toggle('hidden', !text);
  }

  private renderIncome(): void {
    const pending = this.ugc.income?.pending ?? 0;
    this.incomeBadge.textContent = `+${fmt(pending)}`;
    this.incomeBadge.title = `家園收益待領取 ${fmt(pending)}`;
    this.incomeBadge.classList.toggle('hidden', pending < 1);
  }
}
