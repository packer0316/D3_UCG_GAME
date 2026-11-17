/**
 * 魚類別註冊 — 對照原版 Define/FishDefine_Extra.lua FishClassType。
 * FishDefine.fishClass 對應這裡的名稱；沒設定的魚用一般 Fish（鐮刀龍 / 腫頭龍 / 火盜龍本階段也是一般魚）。
 */
import type { FishClassRegistry } from '../FishClassRegistry';
import { AzureDragonFish } from './AzureDragonFish';
import { AzureDragonWingFish } from './AzureDragonWingFish';
import { DragonSlainKnightFish } from './DragonSlainKnightFish';
import { QuetzalcoatlusFish, ScorpionFish } from './ScorpionFish';
import { TreeGoblinFish } from './TreeGoblinFish';
import { TRexFish } from './TRexFish';

export function registerFishClasses(registry: FishClassRegistry): void {
  registry.register('trex', TRexFish);
  registry.register('treeGoblin', TreeGoblinFish);
  registry.register('scorpion', ScorpionFish);
  registry.register('quetzalcoatlus', QuetzalcoatlusFish);
  registry.register('azureDragon', AzureDragonFish);
  registry.register('azureDragonWing', AzureDragonWingFish);
  registry.register('knight', DragonSlainKnightFish);
}

export {
  AzureDragonFish,
  AzureDragonWingFish,
  DragonSlainKnightFish,
  QuetzalcoatlusFish,
  ScorpionFish,
  TreeGoblinFish,
  TRexFish,
};
