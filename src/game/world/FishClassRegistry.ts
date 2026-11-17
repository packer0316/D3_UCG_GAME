/**
 * fishClass → Fish 類別（對照原版 FishDefine_Extra FishClassType）。
 * 新 Boss 只要寫一個 Fish 子類別並 register，不用改 FishSystem。
 */
import { Fish, type FishInit } from './Fish';

export type FishCtor = new (init: FishInit) => Fish;

export class FishClassRegistry {
  private map = new Map<string, FishCtor>([['normal', Fish]]);

  register(name: string, ctor: FishCtor): void {
    this.map.set(name, ctor);
  }

  get(name: string | undefined): FishCtor {
    return this.map.get(name ?? 'normal') ?? Fish;
  }
}
