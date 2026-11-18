/**
 * 抽卡券掉落（SPEC-UGC §4）：每次打死怪物擲一次（給獎但魚沒死的不算）；只在公有地 / 別人的家園掉。
 */
import { ticketLevelFactor } from './CultivateRule';

/** 打死一隻怪物掉券的機率 */
export const TICKET_DROP_CHANCE = 0.1;
/** 一次掉幾張 */
export const TICKET_DROP_COUNT = 1;

export interface TicketDrop {
  /** 掉落機率（0 ~ 1） */
  chance: number;
  /** 掉幾張 */
  count: number;
}

/**
 * 這次中獎的掉券機率與張數。
 * unDead = 給獎但魚沒死（不掉）；level = 這隻龍在這間房的等級；levelBonus = 是否套用等級係數（只有別人的家園）
 */
export function ticketDrop(unDead: boolean, level: number, levelBonus: boolean): TicketDrop {
  if (unDead) return { chance: 0, count: 0 };
  const chance = TICKET_DROP_CHANCE * (levelBonus ? ticketLevelFactor(level) : 1);
  return { chance: Math.min(1, chance), count: TICKET_DROP_COUNT };
}
