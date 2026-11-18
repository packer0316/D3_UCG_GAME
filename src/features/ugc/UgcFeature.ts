/**
 * UGC 家園功能（docs/SPEC-UGC.md）：房間列表 / 魚卡 / 抽卡 / 家園設定 / 裝潢 / 掉券表演。
 *
 * 規則在 game/ugc（與假 server 共用），這裡只有 client：
 *   UgcClient  資料層（玩家資產 / 房間快照、送請求）
 *   ui/        上方功能列與四個面板（DOM）
 *   decor/     裝潢顯示（DecoLayer）與裝潢模式（DecorMode）
 *   fx/        掉券表演
 */
import type { GameFeature } from '@core/feature/Feature';
import type { GameContext } from '@game/GameContext';
import { UgcClient, UgcToken } from './UgcClient';
import { DecoLayer } from './decor/DecoLayer';
import { DecorMode } from './decor/DecorMode';
import { TicketDropFx } from './fx/TicketDropFx';
import { CardPanel } from './ui/CardPanel';
import { GachaPanel } from './ui/GachaPanel';
import { HomePanel } from './ui/HomePanel';
import { closeCurrentPanel } from './ui/Panel';
import { RoomListPanel } from './ui/RoomListPanel';
import { TopBar } from './ui/TopBar';
import { fmt } from './ui/dom';
import './ui/ugc.css';

export class UgcFeature implements GameFeature<GameContext> {
  readonly id = 'ugc';
  private ticketFx: TicketDropFx | null = null;

  update(dt: number): void {
    this.ticketFx?.update(dt);
  }

  install(ctx: GameContext): void {
    const ugc = new UgcClient(ctx);
    ugc.init();
    ctx.services.register(UgcToken, ugc);
    // 原本左上角的房間名稱由功能列取代
    ctx.ui.root.classList.add('ugc-on');

    const rooms = new RoomListPanel(ctx, ugc);
    const cards = new CardPanel(ctx, ugc);
    const gacha = new GachaPanel(ctx, ugc);
    const home = new HomePanel(ctx, ugc);
    const decoLayer = new DecoLayer(ctx, ugc);
    const decor = new DecorMode(ctx, ugc, decoLayer);
    home.onDecorate = () => void decor.enter();

    const bar = new TopBar(ctx, ugc, {
      rooms: () => rooms.panel.toggle(),
      cards: () => cards.panel.toggle(),
      gacha: () => gacha.panel.toggle(),
      home: () => home.panel.toggle(),
    });
    for (const [name, view] of Object.entries({ rooms, cards, gacha, home })) {
      const { onOpen, onClose } = view.panel;
      view.panel.onOpen = () => { onOpen?.(); bar.setActive(name as 'rooms' | 'cards' | 'gacha' | 'home'); };
      view.panel.onClose = () => { onClose?.(); bar.setActive(null); };
    }
    const ticketFx = (this.ticketFx = new TicketDropFx(ctx, bar.gachaButton));

    // 換房：關掉開著的面板，提示進了哪一間
    let lastRoom = 0;
    ctx.events.on('ugc:room', ({ room }) => {
      if (room.roomId === lastRoom) return;
      const first = lastRoom === 0;
      lastRoom = room.roomId;
      if (first) return;
      closeCurrentPanel();
      ctx.ui.toast(`進入 ${room.name}`);
    });
    // 離線期間的家園收益（登入後通知一次）
    ctx.events.on('ugc:income', (income) => {
      if (income.offlineEarned) ctx.ui.toast(`離線期間家園抽成 +${fmt(income.offlineEarned)}，到「家園」領取`, 3500);
    });

    // console / 自動化測試用
    (window as unknown as { __ugc: unknown }).__ugc = { client: ugc, decor, ticketFx, panels: { rooms, cards, gacha, home } };
  }
}
