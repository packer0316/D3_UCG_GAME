/**
 * 房間的裝潢顯示（SPEC-UGC §9.5）：依目前房間的配置在 layers.deco 建立裝飾物。
 * 只在地面場景顯示（天空場景隱藏）；純裝飾，不擋子彈也不擋魚。
 * 裝潢模式時由 DecorMode 直接呼叫 show() 顯示編輯中的配置。
 */
import * as THREE from 'three';
import { isSkyScene } from '@game/define/SceneDefine';
import type { GameContext } from '@game/GameContext';
import type { DecoPlacement } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { createPlacedDeco, disposeDecoObject } from './DecoFactory';

export class DecoLayer {
  private readonly group = new THREE.Group();
  /** 目前顯示的配置（判斷要不要重建） */
  private shown = '';
  private readonly objects = new Map<string,THREE.Object3D>();
  /** 裝潢模式中：不跟著房間資料更新 */
  private editing = false;
  private sky = false;

  constructor(
    ctx: GameContext,
    private readonly ugc: UgcClient,
  ) {
    this.group.name = 'ugc_deco';
    ctx.layers.deco.add(this.group);
    ctx.events.on('ugc:room', () => this.syncRoom());
    ctx.events.on('scene:change', ({ sceneType }) => {
      this.sky = isSkyScene(sceneType);
      this.group.visible = !this.sky || this.editing;
    });
  }

  /** 顯示目前房間的裝潢 */
  syncRoom(): void {
    if (!this.editing) this.show(this.ugc.room?.deco ?? [], false);
  }

  /** 進入 / 離開裝潢模式 */
  setEditing(editing: boolean): void {
    this.editing = editing;
    this.shown = '';
    this.group.visible = !this.sky || editing;
    if (!editing) this.syncRoom();
  }

  /** 依配置增刪；保留未變動的模型與 GPU buffers，避免每放一件就重建整個家園。 */
  show(items: readonly DecoPlacement[], editing: boolean): void {
    const key = `${editing ? 'E' : 'N'}${JSON.stringify(items)}`;
    if (key === this.shown) return;
    this.shown = key;
    const keyed=items.map(item=>({item,key:`${editing?'E':'N'}:${item.id}:${item.x}:${item.y}:${item.rot}`}));
    const wanted=new Set(keyed.map(({key})=>key));
    for(const [key,obj] of this.objects)if(!wanted.has(key)){
      this.group.remove(obj);disposeDecoObject(obj);this.objects.delete(key);
    }
    for (const {item,key} of keyed) {
      if(this.objects.has(key))continue;
      const obj = createPlacedDeco(item, { editing });
      if (obj) {this.group.add(obj);this.objects.set(key,obj);}
    }
  }
}
