/**
 * 翔空蒼龍 — 翻譯自原版 FishAzureDragon.lua + FishAzureDragonSprite.lua（SPEC §14.4 / §14.5）
 *
 * PlayAnims：
 *   Reset → 隱藏；InGameShow → Boss 來襲；InGame → 顯示、播一次；Declare → PlayRunAnimation + 可打（翅膀一起）
 *   Back  → 播一次，播完可打 + PlayRunAnimation；Out → 播一次、不可打、鎖住受傷動畫
 *   Hurt / Atk_Tornado / Stage_Change 依 AnimDegree 決定能否打斷目前動畫
 *   播到 RunAnimation → degree 歸零、可打、解除受傷鎖
 *
 * 翅膀：
 *   翅膀魚（type 28）生成後呼叫 generateWing(fishIndex)：該翅膀 mesh 換成發光貼圖
 *   翅膀被打掉 destroyWing(fishIndex)：播 Hurt + Hurt<n> 羽毛 EFK、換回暗貼圖；剩餘數為偶數且不是 6 → Stage_Change
 *
 * 未做：身體呼吸光 / 翅膀刷光 shader（normal_umbrellaLizard / azureDragonWing）、大獎 BossShow。
 */
import * as THREE from 'three';
import { findCocosNode } from '@engine/loaders/C3bLoader';
import type { FishMaterial } from '@engine/materials/FishMaterial';
import type { KillFloatOddsNotify } from '@net/protocol';
import { Fish, type FishInit } from '../Fish';

/** 翅膀 fishIndex → 掛載骨骼（原版 partBoneDefine[idx].boneName） */
export const AZURE_WING_BONES: Record<number, string> = {
  1: 'Feather_Bone042',
  2: 'Feather_Bone033',
  3: 'Feather_Bone047',
  4: 'Feather_Bone042(mirrored)',
  5: 'Feather_Bone033(mirrored)',
  6: 'Feather_Bone047(mirrored)',
};

/** 翅膀 fishIndex → mesh（原版 meshIdx 1/0/2/5/6/7 = c3b 節點 wing1/wing3/wing5/wing2/wing4/wing6） */
export const AZURE_WING_MESHES: Record<number, string> = {
  1: 'dt3_boss_001_wing1',
  2: 'dt3_boss_001_wing3',
  3: 'dt3_boss_001_wing5',
  4: 'dt3_boss_001_wing2',
  5: 'dt3_boss_001_wing4',
  6: 'dt3_boss_001_wing6',
};

/** 翅膀存在時的發光貼圖（MeshShaderTexturePath.light_wing） */
export const AZURE_WING_LIGHT_TEXTURE =
  'Models/Dinosaur_dt3/1_Boss/dt3_boss_AzureDragon/shader/dt3_boss_001_wing_d_emissive.jpg';

const ANIM_DEGREE: Record<string, number> = {
  Idle_1: 0,
  Idle_2: 0,
  Idle_3: 0,
  Hurt: 1,
  Atk_Tornado: 2,
  Stage_Change: 3,
  InGame: 4,
};

/** SetHurtBlock 時不能播的動畫（hurtKey） */
const HURT_KEYS = ['Hurt', 'Hurt1', 'Hurt2', 'Hurt3', 'Hurt4', 'Hurt5', 'Hurt6', 'Atk_Tornado', 'Stage_Change'];

const WIN_1 = 1;

export class AzureDragonFish extends Fish {
  /** 可打（SetShootable：蒼龍與翅膀一起） */
  shootable = false;
  private readonly wings = new Set<number>();
  private curAnimDegree = 0;
  private evolving = false;
  private hurtBlock = false;
  /** 翅膀 mesh 的材質與原本（暗）的貼圖 */
  private readonly wingMats = new Map<number, { mats: FishMaterial[]; dark: THREE.Texture | null }>();

  constructor(init: FishInit) {
    super(init);
    for (const [idx, name] of Object.entries(AZURE_WING_MESHES)) {
      const mats: FishMaterial[] = [];
      this.sprite.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.cocosName === name && this.materials.includes(mesh.material as FishMaterial)) {
          mats.push(mesh.material as FishMaterial);
        }
      });
      const dark = (mats[0]?.uniforms.map.value as THREE.Texture | null) ?? null;
      this.wingMats.set(Number(idx), { mats, dark });
    }
  }

  protected override onInit(): void {
    super.onInit();
    this.setVisible(false);
    this.setShootable(false);
  }

  /** 翅膀掛載骨骼（GetAttachFishBone） */
  wingBone(idx: number): THREE.Object3D | null {
    const name = AZURE_WING_BONES[idx];
    return name ? findCocosNode(this.sprite, name) : null;
  }

  generateWing(idx: number): void {
    this.wings.add(idx);
    this.setWingLit(idx, true);
  }

  destroyWing(idx: number): void {
    if (!this.wings.delete(idx)) return;
    this.playAnims('Hurt', false, 1);
    this.fx.playAnim(`Hurt${idx}`);
    this.setWingLit(idx, false);
    this.checkEvolution();
  }

  get wingCount(): number {
    return this.wings.size;
  }

  /** CheckEvolution：剩餘翅膀為偶數且不是 6 → Stage_Change */
  private checkEvolution(): void {
    const n = this.wings.size;
    if (n % 2 === 0 && n !== 6 && !this.evolving) {
      this.evolving = true;
      this.playAnims('Stage_Change', false, 1);
    }
  }

  /** SetWingShader：翅膀存在 → 發光貼圖，否則原本的暗貼圖 */
  private setWingLit(idx: number, lit: boolean): void {
    const w = this.wingMats.get(idx);
    if (!w) return;
    const tex = lit ? (this.env.peekTexture(AZURE_WING_LIGHT_TEXTURE) ?? w.dark) : w.dark;
    for (const m of w.mats) m.uniforms.map.value = tex;
  }

  setShootable(v: boolean): void {
    this.shootable = v;
    this.hittable = v;
  }

  override playAnims(key: string, loop = true, _speed = 1, onEnd?: () => void): void {
    if (this.hurtBlock && HURT_KEYS.includes(key)) return;
    switch (key) {
      case 'Reset':
        this.setVisible(false);
        break;
      case 'Hurt':
        if (this.curAnimDegree > ANIM_DEGREE.Hurt) return;
        onEnd = () => this.playRunAnimation();
        break;
      case 'Atk_Tornado':
        if (this.curAnimDegree > ANIM_DEGREE.Atk_Tornado) return;
        this.curAnimDegree = ANIM_DEGREE.Atk_Tornado;
        onEnd = () => {
          this.curAnimDegree = 0;
          this.playRunAnimation();
        };
        break;
      case 'Stage_Change':
        if (this.curAnimDegree === ANIM_DEGREE.Stage_Change) return;
        this.curAnimDegree = ANIM_DEGREE.Stage_Change;
        onEnd = () => {
          this.curAnimDegree = 0;
          this.evolving = false;
          this.playRunAnimation();
        };
        break;
      case 'InGame':
        this.setVisible(true);
        loop = false;
        break;
      case 'Declare':
        this.playRunAnimation();
        this.setShootable(true);
        return;
      case 'InGameShow':
        this.bossComing();
        break;
      case 'Back':
        loop = false;
        onEnd = () => {
          this.setShootable(true);
          this.playRunAnimation();
        };
        break;
      case 'Out':
        loop = false;
        this.setShootable(false);
        this.hurtBlock = true;
        break;
      default:
        if (this.isRunAnim(key)) {
          this.curAnimDegree = 0;
          this.setShootable(true);
          this.hurtBlock = false;
        }
    }
    super.playAnims(key, loop, 1, onEnd);
  }

  /** OnKillNotify：Win_1（小獎不死）→ 受傷動畫 */
  override onKillNotify(n: KillFloatOddsNotify): void {
    if (n.showType === WIN_1 && n.unDead) this.playAnims('Hurt', false, 1);
  }
}
