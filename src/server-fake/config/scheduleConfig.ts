/**
 * 假 server 群組排程（原版排程在 CasinoFishBase 函式庫，不在 repo；以下為自訂，可調）。
 * 參考 DT2 ScriptProcess_Normal：每個 kind 各自依間隔抽一個群組（依權重）。
 */
import type { GroupEntry } from '@game/path/PathTypes';

/** client 第一階段支援的魚種 */
export const SUPPORTED_FISH_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 24]);

export interface ScheduleKind {
  kind: string;
  intervalMs: number;
  /** 第一次出現延遲（開房回填時不套用） */
  firstDelayMs?: number;
  /** 同時存在上限 */
  maxActive: number;
  /** 是否參與開房回填 */
  backfill: boolean;
  /** 篩選群組（types = 群組內魚種） */
  filter: (groupId: number, types: Set<number>, entries: GroupEntry[]) => boolean;
  weight?: (groupId: number) => number;
}

const subset = (types: Set<number>, allowed: number[]) => [...types].every((t) => allowed.includes(t));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const SCHEDULE: ScheduleKind[] = [
  {
    kind: 'small',
    intervalMs: 4000,
    maxActive: 6,
    backfill: true,
    filter: (_id, types) => subset(types, range(1, 9)),
  },
  {
    kind: 'medium',
    intervalMs: 14000,
    firstDelayMs: 3000,
    maxActive: 2,
    backfill: true,
    filter: (_id, types) => subset(types, range(1, 11)) && (types.has(10) || types.has(11)),
  },
  {
    kind: 'big',
    intervalMs: 40000,
    firstDelayMs: 8000,
    maxActive: 1,
    backfill: true,
    filter: (_id, types) => subset(types, range(1, 14)) && [12, 13, 14].some((t) => types.has(t)),
  },
  {
    kind: 'boss',
    intervalMs: 180000,
    firstDelayMs: 20000,
    maxActive: 1,
    backfill: false,
    filter: (id) => id === 35, // 帝王暴龍
  },
];

/** 自動（智能篩選）可選魚種：server 的順序（同原版面板順序），只回傳本房會出現的魚種 */
export const SMART_FILTER_ORDER = [
  83, 79, 76, 77, 75, 80, 81, 82, 74, 64, 65, 63, 61, 62, 58, 52, 53, 54, 55, 49, 38, 32, 31, 36, 51, 50, 33, 30, 29, 27, 28, 24,
  26, 25, 34, 23, 22, 17, 16, 15, 14, 13, 12, 11, 10, 9,
];

/** 開房時回填的時間偏移（模擬進房時場上已有魚） */
export const BACKFILL_SHIFT_MS: [number, number] = [20000, 40000];
