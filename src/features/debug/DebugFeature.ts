/**
 * Debug 面板（按 ` 鍵開關）— 對照原版 TMDCommon 共用測試模組：
 *   A「出獎模式開關」（TestCheatModeContent）：按鈕顯示目前狀態，送 DEBUG_U2G_CLIENT_TOOL_USE_REQ toolType 1
 *   B「召喚腳本魚」（TestSummonContent / TestSummonUI）：篩選框 + 「<groupId>-<名稱>」列表，送 toolType 2
 * 只透過 GameContext / NetClient 存取遊戲（Feature 擴充機制的範例）。
 */
import type { GameFeature } from '@core/feature/Feature';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { isFishSupported } from '@game/define/FishDefine';
import type { Fish } from '@game/world/Fish';
import { DebugErrorCode, DebugToolType } from '@net/protocol';
import type { FakeServer } from '@server-fake/FakeServer';
import { buildSummonList, type SummonEntry } from './SummonList';
import './debug.css';

export class DebugFeature implements GameFeature<GameContext> {
  readonly id = 'debug';
  private ctx!: GameContext;
  private cheatBtn!: HTMLButtonElement;
  private menu!: HTMLDivElement;
  private list!: HTMLDivElement;
  private filter!: HTMLInputElement;
  private cheatOn = false;
  private cheatPending = false;
  private entries: SummonEntry[] = [];

  install(ctx: GameContext): void {
    this.ctx = ctx;
    this.entries = buildSummonList(ctx.data.groups, ctx.data.fishData, isFishSupported);

    const p = document.createElement('div');
    p.className = 'debug-panel ui-interactive';
    p.innerHTML = `
      <div class="debug-title">DEBUG <small>(\` 鍵開關)</small></div>
      <button class="dbg-btn dbg-cheat" data-act="cheat"></button>
      <button class="dbg-btn dbg-summon" data-act="summon">召喚魚 ▾</button>
      <div class="dbg-menu hidden">
        <div class="dbg-filter">
          <input type="text" placeholder="篩選關鍵字" />
          <button data-act="clear" title="清除">X</button>
        </div>
        <div class="dbg-list"></div>
      </div>`;
    ctx.ui.layers.popup.appendChild(p);
    this.cheatBtn = p.querySelector('.dbg-cheat')!;
    this.menu = p.querySelector('.dbg-menu')!;
    this.list = p.querySelector('.dbg-list')!;
    this.filter = p.querySelector('.dbg-filter input')!;
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.addEventListener('click', (e) => this.onClick(e));
    this.filter.addEventListener('input', () => this.renderList());
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' && document.activeElement !== this.filter) p.classList.toggle('hidden');
    });

    ctx.net.on('G2U_DEBUG_CLIENT_TOOL_USE_ACK', (ack) => this.onAck(ack));
    this.renderCheat();
    this.renderList();
    this.exposeConsoleHelpers();
  }

  // ------------------------------------------------------------------

  private send(toolType: number, target: number): void {
    this.ctx.net.send('U2G_DEBUG_CLIENT_TOOL_USE_REQ', { toolType, target, quantity: 0 });
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = el?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'cheat':
        if (this.cheatPending) return;
        this.cheatPending = true;
        this.renderCheat();
        this.send(DebugToolType.CheatMode, this.cheatOn ? 0 : 1);
        break;
      case 'summon':
        this.menu.classList.toggle('hidden');
        if (!this.menu.classList.contains('hidden')) this.filter.focus();
        break;
      case 'clear':
        this.filter.value = '';
        this.renderList();
        break;
      case 'row': {
        const id = Number(el!.dataset.gid);
        if (el!.classList.contains('disabled')) {
          this.ctx.ui.toast(`${el!.textContent?.trim()}：本版尚未支援此魚種`);
          return;
        }
        this.send(DebugToolType.Summon, id);
        break;
      }
    }
  }

  private onAck(ack: { toolType: number; errorCode: number; target: number }): void {
    const ok = ack.errorCode === DebugErrorCode.Success;
    if (ack.toolType === DebugToolType.CheatMode) {
      this.cheatPending = false;
      if (ok) this.cheatOn = ack.target === 1;
      this.renderCheat();
      this.ctx.ui.toast(ok ? `出獎模式：${this.cheatOn ? '開啟' : '關閉'}` : '出獎模式切換失敗');
    } else if (ack.toolType === DebugToolType.Summon) {
      const entry = this.entries.find((e) => e.groupId === ack.target);
      this.ctx.ui.toast(`${ok ? '已召喚' : '召喚失敗'}：${entry?.label ?? ack.target}`);
    }
  }

  private renderCheat(): void {
    const b = this.cheatBtn;
    b.textContent = this.cheatPending ? '出獎模式：切換中…' : `出獎模式：${this.cheatOn ? '開啟' : '關閉'}`;
    b.classList.toggle('on', this.cheatOn);
  }

  /** 原版 TestSummonUI：不分大小寫子字串篩選整列文字 */
  private renderList(): void {
    const key = this.filter.value.trim().toLowerCase();
    const rows = this.entries.filter((e) => !key || e.label.toLowerCase().includes(key));
    this.list.innerHTML = rows
      .map(
        (e) =>
          `<div class="dbg-row${e.supported ? '' : ' disabled'}${e.original ? '' : ' extra'}" data-act="row" data-gid="${e.groupId}">${e.label}${
            e.supported ? '' : '<span class="dbg-tag">未支援</span>'
          }</div>`,
      )
      .join('');
  }

  // ------------------------------------------------------------------

  /** console / 自動化測試用 */
  private exposeConsoleHelpers(): void {
    const ctx = this.ctx;
    (window as unknown as { __debug: unknown }).__debug = {
      ctx,
      tokens: Tokens,
      get server() {
        return ctx.services.tryGet(Tokens.FakeServer);
      },
      get fish() {
        return ctx.services.get(Tokens.FishSystem);
      },
      cheat: (on: boolean) => this.send(DebugToolType.CheatMode, on ? 1 : 0),
      summon: (groupId: number) => this.send(DebugToolType.Summon, groupId),
      /** 對場上第一隻符合條件的魚模擬一則 server 擊殺通知 */
      kill: (fishType: number, showType: number, unDead = false, odds = 100) => {
        const fs = ctx.services.get(Tokens.FishSystem) as unknown as { alive: Map<number, Fish> };
        const target = [...fs.alive.values()].find((f) => f.type === fishType && f.hittable);
        const s = ctx.services.tryGet(Tokens.FakeServer) as FakeServer | undefined;
        if (!target || !s) return false;
        const bet = 500;
        const money = bet * odds;
        s.room.addMoney(money);
        s.send('G2U_KILL_FLOATODDS_FISH_NOTIFY', {
          accountId: 1,
          scriptIdData: { groupIndex: target.groupIndex, fishIndex: target.fishIndex },
          fishType,
          showType,
          money,
          seatIndex: s.room.yourSeat,
          seatMoney: s.room.self.money,
          bet,
          floatedOdds: odds,
          floatedRate: 1,
          unDead,
          killIndex: 0,
        });
        return true;
      },
    };
  }
}
