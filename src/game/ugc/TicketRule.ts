/**
 * 抽卡券掉落（SPEC-UGC §4）：每次中獎擲一次；只在公有地 / 別人的家園掉。
 */
import { FishType } from '../define/FishDefine';
import { isBossCard } from './CardDefine';
import { ticketLevelFactor } from './CultivateRule';

export interface TicketDrop {
  /** 掉落機率（0 ~ 1） */
  chance: number;
  /** 掉幾張 */
  count: number;
}

/** 押注係數：押注 / 500，夾在 0.2 ~ 2（避免用最小押注刷券） */
export function ticketBetFactor(bet: number): number {
  return Math.min(2, Math.max(0.2, bet / 500));
}

/** 基礎機率 / 張數；unDead = 給獎但魚沒死（Boss 小獎、獵龍騎士） */
export function ticketBase(fishType: number, unDead: boolean): TicketDrop {
  if (isBossCard(fishType) && fishType !== FishType.AzureDragonWing) return unDead ? { chance: 0.1, count: 1 } : { chance: 1, count: 3 };
  if (fishType === FishType.AzureDragonWing) return { chance: 0.1, count: 1 };
  if (fishType === FishType.DragonSlainKnight) return { chance: 0.08, count: 1 };
  if (fishType >= FishType.Therizinosaurus && fishType <= FishType.Pyroraptor) return { chance: 0.2, count: 1 };
  if (fishType >= FishType.Scolosaurus && fishType <= FishType.Spinosaurus) return { chance: 0.3, count: 1 };
  if (fishType >= FishType.Smilodon_G && fishType <= FishType.Pterosau) return { chance: 0.06, count: 1 };
  return { chance: 0.015, count: 1 };
}

/**
 * 這次中獎的掉券機率與張數。
 * level = 這隻龍在這間房的等級（公有地一律 1）；levelBonus = 是否套用等級係數（只有別人的家園）
 */
export function ticketDrop(fishType: number, unDead: boolean, bet: number, level: number, levelBonus: boolean): TicketDrop {
  const base = ticketBase(fishType, unDead);
  const chance = base.chance * ticketBetFactor(bet) * (levelBonus ? ticketLevelFactor(level) : 1);
  return { chance: Math.min(1, chance), count: base.count };
}
