/** PathData.json / GroupData.json / FishData.json 的資料型別（原版格式，欄位名稱不變） */

export interface PathSplinePoint {
  x: number;
  y: number;
  wait?: number;
  duration?: number;
  /** 原版 client 未使用 */
  z?: number;
}

export interface PathSpline {
  pt: PathSplinePoint[];
  duration: number;
  /** cardinal tension（資料全為 0） */
  tangent?: number;
}

export interface PathWaypoint {
  x: number;
  y: number;
  duration: number;
  wait?: number;
  spline?: PathSpline;
  /** 原版 client 未使用 */
  speed?: number;
  z?: number;
}

export interface PathDatum {
  /** 原版 client 未使用（實際時間由各段 duration 決定） */
  duration?: number;
  wp: PathWaypoint[];
  IsBezier?: unknown;
}

export type PathDataMap = Record<string, PathDatum>;

export interface GroupEntry {
  /** 0-based FishData index → fishType = fish + 1 */
  fish: number;
  path: number;
  delay: number;
  duration: number;
}

/** GroupData.json：數字 key 為群組，另有 "extra" / "inverse" 兩個非群組欄位 */
export type GroupDataMap = Record<string, GroupEntry[] | Record<string, unknown>>;

export interface FishDatum {
  Data: number;
  Name: string;
  Odds: number;
  SwimSpeed: number;
}

export interface FishDataFile {
  Fishes: FishDatum[];
}

export function getGroup(groups: GroupDataMap, groupId: number): GroupEntry[] | null {
  const g = groups[String(groupId)];
  return Array.isArray(g) ? g : null;
}

export function listGroupIds(groups: GroupDataMap): number[] {
  return Object.keys(groups)
    .filter((k) => Array.isArray(groups[k]))
    .map(Number)
    .sort((a, b) => a - b);
}
