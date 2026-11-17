/**
 * 右側技能按鈕 — 翻譯自原版 View/UI/Skill/SkillCtrlView.lua、SkillCtrlViewBase.lua、main/Card.csd
 */
import { SpecialBulletType, type SpecialBulletTypeId } from './BulletDefine';

export type SkillButtonId = 'AutoShoot' | 'Skill_1' | 'Skill_2' | 'Skill_3' | 'AIAuto';

export interface SkillButtonDefine {
  id: SkillButtonId;
  /** Card.csd 節點名稱 */
  node: string;
  bulletType: SpecialBulletTypeId;
  /** 決定子彈類型：開啟中權重最高者 */
  weight: number;
  /** 同群組互斥 */
  group: 'auto' | 'skill';
  /** 是否顯示成本標籤（Cost） */
  showCost: boolean;
  label: string;
}

/** 由上到下：準心、火箭、紫漩渦、無人機、自動 */
export const SKILL_BUTTONS: SkillButtonDefine[] = [
  { id: 'AutoShoot', node: 'ImgBtn_1', bulletType: SpecialBulletType.Lock, weight: 1, group: 'auto', showCost: false, label: '自動瞄準' },
  { id: 'Skill_1', node: 'ImgBtn_2', bulletType: SpecialBulletType.Focus, weight: 2, group: 'skill', showCost: true, label: '榴彈砲' },
  { id: 'Skill_3', node: 'ImgBtn_4', bulletType: SpecialBulletType.Advanced, weight: 2, group: 'skill', showCost: true, label: '紫雷擊' },
  { id: 'Skill_2', node: 'ImgBtn_3', bulletType: SpecialBulletType.LaserLock, weight: 2, group: 'skill', showCost: true, label: '巡光炮' },
  { id: 'AIAuto', node: 'ImgBtn_5', bulletType: SpecialBulletType.Lock, weight: 1, group: 'auto', showCost: false, label: '自動' },
];

/** Card.csd 在 Main.csd 的位置（RightEdge / BottomEdge）：x = 設計寬 − 5、y = 150 */
export const SKILL_PANEL_CSD = 'DinosaurExport/main/Card.csd';
export const SKILL_PANEL_RIGHT_MARGIN = 5;
export const SKILL_PANEL_Y = 150;
/** 按下縮放（GlobalFunc 按鈕效果） */
export const SKILL_PRESS_SCALE = 0.85;
export const SKILL_PRESS_TIME = 0.2;
/** 紫雷擊按鈕常駐動畫（Card_lighting.csd） */
export const SKILL_LIGHTING = { node: 'FileNode_2', idle: 'idle_normal', on: 'idle_click' };
export const SKILL_CLICK_SOUND = 'sound/S_24';
export const LOCK_CHANGE_SOUND = 'sound/L_4';
export const LOCK_AIM_CSD = 'DinosaurExport/main/LockAim_Anim.csd';
