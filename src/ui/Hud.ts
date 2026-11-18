/**
 * 戰鬥 HUD：座位面板、左上房間。右側技能按鈕改由 SkillPanel（原版 Card.csd）負責。
 *
 * 座位面板直接載入原版 main/SeatInfo.csd（CsdDom），行為對照 SeatInfoUIViewBase / SeatInfoUIView：
 * - 有人：CannonGroup 可見（押注 CannonNum、名字 Name、VIP 卡 IconVIP、餘額 GoldNum）；± 按鈕只有本人座位
 * - 沒人：WaitNode「等待加入」呼吸（FadeTo 1.2s → 150、FadeIn 1.2s，重複）
 * - VIP 卡：LoadVipCardSprite → 換成 vip/VIPCards.plist 影格，保持 csd 原本的節點尺寸
 * - 押注顯示 tostring(bet)（不加千分位）；餘額 formatnumberthousands(max(money, 0))
 * - ± 按鈕（FishBaseBetBtn + CreateTouchListener）：按下縮到 0.85（0.2s）、放開回 1；
 *   放開時觸發一次，長按 1s 後每 0.2s、2s 後每 0.1s 重複；移動超過按鈕大小取消
 * - FileNode_1（蒼龍羽毛加成）尚未實作，先隱藏
 */
import { formatCurrency } from '@core/math/cocos';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { SEAT_ANCHORS, SEAT_COUNT, SEAT_INFO_Y } from '@game/define/CannonDefine';
import { Sound } from '@game/define/SoundDefine';
import { VIP_CARD_PLIST, vipCardFrame } from '@game/define/VipDefine';
import type { SeatData } from '@net/protocol';
import { CsdDom, setCsdPixelScale, type CsdDomNode } from './CsdDom';
import type { UIRoot } from './UIRoot';

export const HUD_PLISTS = ['DinosaurExport/plist/MainUI.plist', 'DinosaurExport/plist/common.plist'];
export const SEAT_INFO_CSD = 'DinosaurExport/main/SeatInfo.csd';

/** 開砲被拒的提示（G2U_SHOOT_REJECT.reason；observer = 自己的家園觀看模式，SPEC-UGC §2.5） */
const SHOOT_REJECT_TEXT: Record<string, string> = {
  money: '餘額不足',
  bet: '押注無效',
  edit: '裝潢中不能開砲',
  observer: '在自己的家園只能觀看，到公有地或別人的家園打龍',
};

/** CreateTouchListener isActivateAction：按下 ScaleTo(0.2, 0.85) */
const BET_BTN_PRESS_SCALE = 0.85;
/** FishBaseBetBtn ConditionTable：長按超過 ThresHoldTime 秒後，每 ConditionVal 秒觸發一次 */
const BET_HOLD_CONDITIONS = [
  { threshold: 0, interval: 1 },
  { threshold: 1, interval: 0.2 },
  { threshold: 2, interval: 0.1 },
];

/** 座位 UI 需要的資源（SeatInfo.csd 及其 plist / 字型，加上 VIP 卡圖集） */
export function preloadHud(ctx: GameContext): Promise<unknown> {
  return Promise.all([ctx.csd.load(SEAT_INFO_CSD), ctx.assets.atlas(VIP_CARD_PLIST)]);
}

interface SeatView {
  /** Main.csd SeatInfo_n 的位置 */
  root: HTMLDivElement;
  cannonGroup?: CsdDomNode;
  betCtrl?: CsdDomNode;
  waitNode?: CsdDomNode;
  name?: CsdDomNode;
  vip?: CsdDomNode;
  goldNum?: CsdDomNode;
  cannonNum?: CsdDomNode;
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

    const csd = ctx.csd.get(SEAT_INFO_CSD);
    if (!csd) console.error('[Hud] SeatInfo.csd not loaded');
    // 九宮格（PlayerBg）依實際螢幕倍率烘焙
    setCsdPixelScale(ctx.stage.designScale * (window.devicePixelRatio || 1));
    for (let i = 0; i < SEAT_COUNT; i++) {
      const root = document.createElement('div');
      root.className = 'seat-info';
      root.style.bottom = `${SEAT_INFO_Y}px`;
      hud.appendChild(root);
      const view: SeatView = { root };
      if (csd) {
        const dom = new CsdDom(ctx.csd, csd);
        root.appendChild(dom.root);
        Object.assign(view, {
          cannonGroup: dom.find('CannonGroup'),
          betCtrl: dom.find('BetCtrlNode'),
          waitNode: dom.find('WaitNode'),
          name: dom.find('Name'),
          vip: dom.find('IconVIP'),
          goldNum: dom.find('GoldNum'),
          cannonNum: dom.find('CannonNum'),
        });
        dom.find('FileNode_1')?.setVisible(false);
        this.bindBetButton(dom.find('UpBtn'), 1);
        this.bindBetButton(dom.find('DownBtn'), -1);
      }
      this.seats.push(view);
      this.setCannonGroupVisible(view, false, false);
    }
    ui.onResize(() => this.layout());
    this.layout();

    const { events } = ctx;
    events.on('room:ready', (d) => (this.roomLabel.textContent = d.roomName));
    events.on('seat:update', ({ seat, data }) => this.renderSeat(seat, data));
    events.on('seat:money', ({ seat, money }) => this.seats[seat]?.goldNum?.setText(formatCurrency(Math.max(money, 0))));
    events.on('seat:bet', ({ seat, bet }) => this.seats[seat]?.cannonNum?.setText(String(bet)));
    events.on('shoot:reject', ({ reason }) => ui.toast(SHOOT_REJECT_TEXT[reason] ?? '押注無效'));
  }

  private layout(): void {
    const W = this.ui.width;
    this.seats.forEach((s, i) => {
      s.root.style.left = `${W / 2 + SEAT_ANCHORS[i].dx}px`;
    });
  }

  /** SeatInfoUIViewBase:SetCannonGroupVisible */
  private setCannonGroupVisible(v: SeatView, visible: boolean, isYourSeat: boolean): void {
    v.cannonGroup?.setVisible(visible);
    v.betCtrl?.setVisible(visible && isYourSeat);
    v.waitNode?.setVisible(!visible);
    v.waitNode?.el.classList.toggle('seat-wait-breath', !visible);
  }

  /** SeatInfoUIViewBase:SetSeatInfo / Reset */
  private renderSeat(seat: number, data: SeatData | null): void {
    const v = this.seats[seat];
    if (!v) return;
    const seatSys = this.ctx.services.get(Tokens.SeatSystem);
    const isSelf = seat === seatSys.yourSeat;
    this.setCannonGroupVisible(v, !!data, isSelf);
    if (!data) return;
    // UpdateVIP：LoadVipCardSprite 換圖後 setContentSize 回原尺寸
    const atlas = this.ctx.assets.peekAtlas(VIP_CARD_PLIST);
    const frame = atlas?.frames[vipCardFrame(data.vip)];
    if (atlas && frame) v.vip?.setFrame({ atlas, frame }, true);
    v.name?.setText(data.name);
    const bet = isSelf ? seatSys.bet : data.bet;
    const money = isSelf ? seatSys.displayMoney : data.money;
    v.cannonNum?.setText(String(bet));
    v.goldNum?.setText(formatCurrency(Math.max(money, 0)));
  }

  /** FishBaseBetBtn：放開觸發一次；長按依 BET_HOLD_CONDITIONS 重複 */
  private bindBetButton(node: CsdDomNode | undefined, delta: number): void {
    if (!node) return;
    const el = node.el;
    el.classList.add('ui-interactive', 'seat-bet-btn');
    const trigger = () => {
      this.ctx.audio.play(Sound.BTN_CLICK2);
      this.ctx.services.get(Tokens.SeatSystem).changeBet(delta);
    };

    let pointerId = -1;
    let downX = 0;
    let downY = 0;
    let raf = 0;
    const stopHold = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const release = () => {
      stopHold();
      pointerId = -1;
      node.setPressed(false).setExtraScale(1);
    };

    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (pointerId >= 0) return;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      downX = e.clientX;
      downY = e.clientY;
      node.setPressed(true).setExtraScale(BET_BTN_PRESS_SCALE);
      // holdChange：每幀累計，超過目前條件的間隔就觸發
      let last = performance.now();
      let total = 0;
      let check = 0;
      const hold = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        total += dt;
        check += dt;
        let interval = 0;
        for (const c of BET_HOLD_CONDITIONS) if (total >= c.threshold) interval = c.interval;
        if (check >= interval) {
          check = 0;
          trigger();
        }
        raf = requestAnimationFrame(hold);
      };
      raf = requestAnimationFrame(hold);
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pointerId) return;
      release();
      // HandleTouchEvent：移動超過按鈕大小 → 取消
      const k = this.ctx.stage.designScale || 1;
      const { w, h } = node.size;
      if (Math.abs(e.clientX - downX) / k > w || Math.abs(e.clientY - downY) / k > h) return;
      trigger();
    });
    el.addEventListener('pointercancel', (e) => {
      if (e.pointerId === pointerId) release();
    });
  }
}
