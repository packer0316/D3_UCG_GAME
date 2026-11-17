/**
 * 技能按鈕狀態 — 翻譯自原版 SkillCtrlView.lua / SkillCtrlViewBase.lua
 *
 * - 自動瞄準（AutoShoot）與自動（AIAuto）互斥；三個技能互斥；瞄準可以和技能同時開
 * - 子彈類型 = 開啟中權重最高者；全關 = 一般子彈
 * - auto = AutoShoot 或 AIAuto 開啟
 */
import { SpecialBulletType, type SpecialBulletTypeId } from '../define/BulletDefine';
import { SKILL_BUTTONS, type SkillButtonDefine, type SkillButtonId } from '../define/SkillDefine';
import type { GameContext } from '../GameContext';

export class SkillSystem {
  private on = new Set<SkillButtonId>();
  private disabled = new Set<SkillButtonId>();

  constructor(private readonly ctx: GameContext) {}

  init(): void {
    // 空白鍵 = 自動按鈕，由 SkillPanel 處理（需要開設定面板）
  }

  isOn(id: SkillButtonId): boolean {
    return this.on.has(id);
  }

  isEnabled(id: SkillButtonId): boolean {
    return !this.disabled.has(id);
  }

  setEnabled(id: SkillButtonId, enabled: boolean): void {
    if (enabled) this.disabled.delete(id);
    else {
      this.disabled.add(id);
      this.on.delete(id);
    }
    this.emit();
  }

  private def(id: SkillButtonId): SkillButtonDefine {
    return SKILL_BUTTONS.find((b) => b.id === id)!;
  }

  toggle(id: SkillButtonId): void {
    if (this.disabled.has(id)) return;
    this.set(id, !this.on.has(id));
  }

  set(id: SkillButtonId, value: boolean): void {
    if (value === this.on.has(id)) return;
    if (value) {
      const g = this.def(id).group;
      for (const b of SKILL_BUTTONS) if (b.group === g) this.on.delete(b.id);
      this.on.add(id);
    } else {
      this.on.delete(id);
    }
    this.emit();
  }

  get bulletType(): SpecialBulletTypeId {
    let best: SkillButtonDefine | null = null;
    for (const b of SKILL_BUTTONS) if (this.on.has(b.id) && (!best || b.weight > best.weight)) best = b;
    return best ? best.bulletType : SpecialBulletType.None;
  }

  get auto(): boolean {
    return this.on.has('AutoShoot') || this.on.has('AIAuto');
  }

  get active(): SkillButtonId[] {
    return [...this.on];
  }

  private emit(): void {
    this.ctx.events.emit('skill:change', { bulletType: this.bulletType, auto: this.auto, active: this.active });
  }
}
