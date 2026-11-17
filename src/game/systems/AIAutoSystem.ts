/**
 * 自動（AIAuto / 智能篩選）執行 — 翻譯自原版 ShootingSystem.lua（SetAIAutoData、StopShoot、停止條件）、
 * AIAutoShootModel.lua
 *
 * - 開始：AIAuto 按鈕開啟；子彈類型 = 目前技能（榴彈 / 雷擊 / 雷射），沒有則鎖定彈（SkillSystem 權重規則）
 * - 目標：LockSystem 依優先順序挑選；新魚出現 → 重選（最佳魚種不同才換）
 * - 子彈數量：每射一發 −1，到 0 停止（最後一發仍送出）；顯示在自動按鈕
 * - 停止：自己擊殺 floatedOdds > 倍率、籌碼 < 下限 或 > 上限；停止時沒有提示訊息
 */
import type { AIAutoConfig } from '../define/AIAutoDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';

export class AIAutoSystem {
  active = false;
  config: AIAutoConfig | null = null;
  /** 剩餘子彈數；-1 = 不限 */
  shotsLeft = -1;

  constructor(private readonly ctx: GameContext) {}

  private get skills() {
    return this.ctx.services.get(Tokens.SkillSystem);
  }
  private get lock() {
    return this.ctx.services.get(Tokens.LockSystem);
  }
  private get seats() {
    return this.ctx.services.get(Tokens.SeatSystem);
  }

  init(): void {
    const { events } = this.ctx;
    events.on('shoot:fire', ({ seat }) => {
      if (!this.active || seat !== this.seats.yourSeat || this.shotsLeft < 0) return;
      this.shotsLeft--;
      this.emit();
      if (this.shotsLeft <= 0) this.stop();
    });
    events.on('fish:spawn', () => {
      if (this.active) this.lock.requestRecheck();
    });
    events.on('fish:kill', ({ notify }) => {
      const c = this.config;
      if (!this.active || !c || c.stopOverOdds === null || notify.seatIndex !== this.seats.yourSeat) return;
      if (notify.floatedOdds > c.stopOverOdds) this.stop();
    });
    events.on('seat:money', ({ seat, money }) => {
      const c = this.config;
      if (!this.active || !c || seat !== this.seats.yourSeat) return;
      if ((c.stopLessCoin !== null && money < c.stopLessCoin) || (c.stopMoreCoin !== null && money > c.stopMoreCoin)) this.stop();
    });
    // 其他方式關掉了自動（例如按下自動瞄準，兩者互斥）
    events.on('skill:change', ({ active }) => {
      if (this.active && !active.includes('AIAuto')) this.finish();
    });
  }

  /** ShootingSystem:SetAIAutoData */
  start(config: AIAutoConfig): void {
    this.config = config;
    this.shotsLeft = config.limitShoot ?? -1;
    this.active = true;
    this.lock.clear();
    this.lock.setPriority(config.targetFishList);
    this.skills.set('AIAuto', true);
    this.emit();
  }

  /** ShootingSystem:StopShoot */
  stop(): void {
    if (!this.active) return;
    this.finish();
    this.skills.set('AIAuto', false);
  }

  private finish(): void {
    this.active = false;
    this.shotsLeft = -1;
    this.lock.setPriority(null);
    this.emit();
  }

  private emit(): void {
    this.ctx.events.emit('ai:change', { active: this.active, shotsLeft: this.shotsLeft });
  }
}
