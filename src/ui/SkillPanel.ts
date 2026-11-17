/**
 * 右側技能按鈕 — 直接載入原版 main/Card.csd（overlay），行為對照 SkillCtrlView / SkillButtonBase：
 * - 位置：Main.csd Card 節點，靠右下（x = 設計寬 − 5、y = 150）
 * - 按下 0.2s 縮到 0.85、放開回 1；移動超過按鈕大小取消點擊
 * - 開啟：ActEff（旋轉光暈）可見；技能按鈕顯示 Cost（押注 × 成本倍率）
 * - 停用：灰色 (128,128,128)
 * - 紫雷擊按鈕：Card_lighting.csd 關閉播 idle_normal、開啟播 idle_click
 */
import { Act } from '@core/tween/Action';
import { formatCurrency } from '@core/math/cocos';
import type { CsdInstance, CsdNodeView } from '@engine/csd/CsdPlayer';
import type { PointerInfo } from '@engine/input/PointerRouter';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { SPECIAL_BULLETS } from '@game/define/BulletDefine';
import {
  SKILL_BUTTONS,
  SKILL_CLICK_SOUND,
  SKILL_LIGHTING,
  SKILL_PANEL_CSD,
  SKILL_PANEL_RIGHT_MARGIN,
  SKILL_PANEL_Y,
  SKILL_PRESS_SCALE,
  SKILL_PRESS_TIME,
  type SkillButtonDefine,
} from '@game/define/SkillDefine';

interface ButtonView {
  def: SkillButtonDefine;
  view: CsdNodeView;
  actEff?: CsdNodeView;
  cost?: CsdNodeView;
  costText?: CsdNodeView;
}

export class SkillPanel {
  private inst: CsdInstance | null = null;
  private buttons: ButtonView[] = [];
  private pressed: { btn: ButtonView; x: number; y: number } | null = null;
  private lightingState = '';

  constructor(private readonly ctx: GameContext) {}

  async preload(): Promise<void> {
    await this.ctx.csd.load(SKILL_PANEL_CSD);
    void this.ctx.audio.load(SKILL_CLICK_SOUND);
  }

  init(): void {
    if (!this.ctx.csd.get(SKILL_PANEL_CSD)) {
      console.error('[SkillPanel] Card.csd not loaded');
      return;
    }
    const inst = this.ctx.csd.create(SKILL_PANEL_CSD);
    this.inst = inst;
    this.ctx.layers.ui.add(inst.root);
    for (const def of SKILL_BUTTONS) {
      const view = inst.find(def.node);
      if (!view) continue;
      const kid = (name: string) => view.children.find((c) => c.data.name === name);
      const cost = kid('Cost');
      this.buttons.push({
        def,
        view,
        actEff: kid('ActEff'),
        cost,
        costText: cost?.children.find((c) => c.data.name === 'useCost'),
      });
    }
    this.layout();
    this.ctx.stage.onResize(() => this.layout());
    this.ctx.input.add({
      priority: 100,
      down: (p) => this.onDown(p),
      move: (p) => this.onMove(p),
      up: (p, cancelled) => this.onUp(p, cancelled),
    });
    this.ctx.events.on('skill:change', () => this.refresh());
    this.ctx.events.on('seat:bet', () => this.refresh());
    this.refresh();
  }

  private layout(): void {
    if (!this.inst) return;
    this.inst.root.position.set(this.ctx.stage.designWidth - SKILL_PANEL_RIGHT_MARGIN, SKILL_PANEL_Y, 50);
  }

  private get skills() {
    return this.ctx.services.get(Tokens.SkillSystem);
  }

  /** 依技能狀態更新按鈕外觀（SkillButtonBase:SetActive / SkillCtrlViewBase:UpdateCost） */
  refresh(): void {
    const skills = this.skills;
    const bet = this.ctx.services.get(Tokens.SeatSystem).bet;
    const cost = bet * SPECIAL_BULLETS[skills.bulletType].costRate;
    for (const b of this.buttons) {
      const on = skills.isOn(b.def.id);
      const enabled = skills.isEnabled(b.def.id);
      if (b.actEff) b.actEff.visible = on;
      if (b.cost) b.cost.visible = on && b.def.showCost;
      b.costText?.setText(formatCurrency(cost));
      b.view.color = enabled ? [255, 255, 255] : [128, 128, 128];
    }
    const lighting = this.inst?.findSub(SKILL_LIGHTING.node);
    const want = skills.isOn('Skill_3') ? SKILL_LIGHTING.on : SKILL_LIGHTING.idle;
    if (lighting && want !== this.lightingState && lighting.hasAnimation(want)) {
      this.lightingState = want;
      lighting.play(want, true);
    }
  }

  private hitButton(x: number, y: number): ButtonView | null {
    for (const b of this.buttons) if (b.view.hitTest(x, y)) return b;
    return null;
  }

  private press(b: ButtonView, down: boolean): void {
    const v = b.view;
    this.ctx.actions.stopAll(v);
    const target = down ? SKILL_PRESS_SCALE : 1;
    this.ctx.actions.run(
      Act.tween(SKILL_PRESS_TIME, () => {
        const s0 = v.scaleX;
        return (t) => {
          v.scaleX = v.scaleY = s0 + (target - s0) * t;
        };
      }),
      v,
    );
  }

  private onDown(p: PointerInfo): boolean {
    const b = this.hitButton(p.x, p.y);
    if (!b) return false;
    if (!this.skills.isEnabled(b.def.id)) return true;
    this.pressed = { btn: b, x: p.x, y: p.y };
    this.press(b, true);
    return true;
  }

  private onMove(p: PointerInfo): void {
    const pr = this.pressed;
    if (!pr) return;
    // 移動超過按鈕大小 → 取消
    if (Math.hypot(p.x - pr.x, p.y - pr.y) > pr.btn.view.size.w) {
      this.press(pr.btn, false);
      this.pressed = null;
    }
  }

  private onUp(_p: PointerInfo, cancelled: boolean): void {
    const pr = this.pressed;
    this.pressed = null;
    if (!pr) return;
    this.press(pr.btn, false);
    if (cancelled) return;
    this.ctx.audio.play(SKILL_CLICK_SOUND);
    this.skills.toggle(pr.btn.def.id);
  }

  update(dt: number): void {
    this.inst?.update(dt);
  }
}
