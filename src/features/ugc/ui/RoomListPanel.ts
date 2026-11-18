/**
 * 房間列表（SPEC-UGC §2.1）：左邊房間清單，右邊選到的房間的內容（輪替表、每種龍的等級與倍率），按「進入」換房。
 */
import type { GameContext } from '@game/GameContext';
import { commissionRate, fishMultiplier, hasFixedOdds } from '@game/ugc/CultivateRule';
import { MAX_LEVEL } from '@game/ugc/UgcDefine';
import type { RoomDetail } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, el, fishIcon, fmtMult, fmtPct, sceneChip } from './dom';

export class RoomListPanel {
  readonly panel: Panel;
  private readonly list = el('div', 'ugc-room-list');
  private readonly detail = el('div', 'ugc-room-detail');
  private rooms: RoomDetail[] = [];
  private currentRoomId = 0;
  private selected = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.panel = new Panel(ctx.ui, { title: '房間列表', width: 940, height: 580 });
    this.panel.body.append(el('div', 'ugc-rooms', this.list, this.detail));
    this.panel.onOpen = () => void this.refresh();
  }

  private async refresh(): Promise<void> {
    const r = await this.ugc.listRooms();
    this.rooms = r.rooms;
    this.currentRoomId = r.currentRoomId;
    if (!this.rooms.some((x) => x.roomId === this.selected)) this.selected = this.currentRoomId;
    this.renderList();
    this.renderDetail();
  }

  private renderList(): void {
    clear(this.list);
    for (const room of this.rooms) {
      const fish = new Set(room.slots.flatMap((s) => s.fishTypes));
      const maxLv = Math.max(1, ...Object.values(room.levels));
      const tags = el(
        'div',
        'ugc-room-tags',
        el('span', '', `場景 ${new Set(room.slots.map((s) => s.sceneType)).size}`),
        el('span', '', `龍 ${fish.size}`),
        room.kind === 'home' && el('span', '', `最高 Lv.${maxLv}`),
        room.kind === 'home' && el('span', '', `人氣 ${room.popularity}`),
      );
      const row = el(
        'button',
        `ugc-room-row${room.roomId === this.selected ? ' on' : ''}${room.isMine ? ' mine' : ''}`,
        el('span', 'ugc-room-no', String(room.roomId)),
        el('span', 'ugc-room-info', el('span', 'ugc-room-title', room.name.replace(/^\d+號房\s*/, '')), tags),
        room.roomId === this.currentRoomId && el('span', 'ugc-room-here', '目前'),
      );
      row.addEventListener('click', () => {
        this.selected = room.roomId;
        this.renderList();
        this.renderDetail();
      });
      this.list.append(row);
    }
  }

  private renderDetail(): void {
    clear(this.detail);
    const room = this.rooms.find((r) => r.roomId === this.selected);
    if (!room) return;
    const here = room.roomId === this.currentRoomId;
    const enter = el('button', 'ugc-btn primary', here ? '目前所在的房間' : '進入');
    enter.disabled = here;
    enter.addEventListener('click', async () => {
      enter.disabled = true;
      const r = await this.ugc.enterRoom(room.roomId);
      if (r.ok) this.panel.close();
      else {
        this.ctx.ui.toast(r.reason ?? '進房失敗');
        enter.disabled = false;
      }
    });

    const desc =
      room.kind === 'public'
        ? '公有地：所有的龍、所有的場景都會出現。在這裡打龍會掉抽卡券。'
        : room.isMine
          ? '我的家園：在這裡打龍不會掉抽卡券。訪客來打龍，我可以拿到抽成。'
          : `${room.ownerName}的家園：打龍會掉抽卡券（等級越高越容易掉），開砲成本的 ${fmtPct(commissionRate(1), 0)} ~ ${fmtPct(commissionRate(MAX_LEVEL), 0)}（依龍的等級）會抽成給屋主。`;
    this.detail.append(
      el('div', 'ugc-detail-head', el('div', 'ugc-detail-title', room.name), enter),
      el('div', 'ugc-detail-desc', desc),
    );
    if (room.kind === 'home') {
      this.detail.append(
        el('div', 'ugc-stats', stat('人氣', String(room.popularity)), stat('平均訪客', `${room.visitors} 人`), stat('裝飾物', `${room.deco.length} 個`)),
      );
    }

    const slots = el('div', 'ugc-slot-list');
    room.slots.forEach((slot, i) => {
      const fish = el('div', 'ugc-fish-row');
      for (const t of slot.fishTypes) {
        const lv = room.levels[t] ?? 1;
        const icon = fishIcon(this.ctx.ui, t, 44);
        if (room.kind === 'home') {
          icon.append(el('span', 'ugc-icon-lv', `Lv.${lv}`));
          icon.title += `　Lv.${lv}　倍率 ${hasFixedOdds(t) ? '×1（固定）' : fmtMult(fishMultiplier(t, lv), 3)}　抽成 ${fmtPct(commissionRate(lv), 2)}`;
        }
        fish.append(icon);
      }
      slots.append(el('div', 'ugc-slot', el('div', 'ugc-slot-scene', el('span', 'ugc-slot-no', String(i + 1)), sceneChip(slot.sceneType)), fish));
    });
    this.detail.append(el('div', 'ugc-section-title', `場景輪替（每格 ${room.slotSeconds} 秒）`), slots);
  }
}

function stat(label: string, value: string): HTMLDivElement {
  return el('div', 'ugc-stat', el('span', 'ugc-stat-label', label), el('span', 'ugc-stat-value', value));
}
