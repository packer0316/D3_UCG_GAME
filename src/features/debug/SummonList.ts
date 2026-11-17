/**
 * 召喚腳本魚名單 — 原版 DragonTycoon3Lua/Test/_TestContentDefine.lua GroupIdMap（逐字）
 * + 本版支援魚種的一般群組（方便測試新武器）。顯示格式與原版 TestSummonUI 相同：「<groupId>-<名稱>」，groupId 由大到小。
 */
import { getGroup, listGroupIds, type FishDataFile, type GroupDataMap } from '@game/path/PathTypes';

/** 原版 GroupIdMap（_TestContentDefine.lua:23-88） */
export const GROUP_ID_MAP: [string, number][] = [
  ['世足龍', 139],
  ['世足龍(客隊)', 140],
  ['巨獸爭霸', 112],
  ['風神翼龍', 37],
  ['遠古巨蠍', 36],
  ['帝王暴龍', 35],
  ['樹精哥布林', 33],
  ['鐮刀龍', 28],
  ['腫頭龍', 29],
  ['火盜龍', 31],
  ['無人機', 59],
  ['巨大機器人', 60],
  ['獵龍騎士(地面)', 47],
  ['翔空蒼龍', 57],
  ['滿月雙兔', 61],
  ['南瓜首領', 68],
  ['暴食巨魔', 69],
  ['聖誕雪橇', 72],
  ['煌金龍', 70],
  ['煌金龍1', 70],
  ['煌金龍2', 70],
  ['煌金龍3', 70],
  ['煌金龍4', 70],
  ['煌金龍5', 70],
  ['煌金龍6', 70],
  ['財神', 71],
  ['素食巨魔', 73],
  ['邱比特', 74],
  ['超.邱比特', 80],
  ['真超.邱比特89', 89],
  ['魷魚巨魔', 94],
  ['棉花糖巨魔', 95],
  ['龍蝦巨魔', 96],
  ['聚寶財神', 97],
  ['炙炎巨猩', 98],
  ['百變財神', 101],
  ['黃金騰雲', 102],
  ['點數騰雲', 103],
  ['禮券騰雲', 104],
  ['集字騰雲', 105],
  ['樹精哥布林★', 106],
  ['帝王暴龍★', 107],
  ['煙火巨魔', 108],
  ['寶珠貝', 119],
  ['寶珠騰雲', 120],
  ['寶珠騰雲(地面2)', 121],
  ['寶珠騰雲(空中)', 122],
  ['強棒巨魔', 123],
  ['呂布', 126],
  ['這箱有鑽', 127],
  ['獵龍領主130', 130],
  ['獵龍領主131', 131],
  ['獵龍領主132', 132],
  ['獵龍領主133', 133],
  ['獵龍領主134', 134],
  ['端午龍舟', 138],
  ['貂蟬', 141],
  ['豪車騰雲(小館-休閒)', 142],
  ['豪車騰雲(大館-尊榮)', 145],
  ['豪車騰雲(狂歡)', 148],
  ['獨角獸(火)', 151],
];

export interface SummonEntry {
  groupId: number;
  name: string;
  /** 群組內魚種本版都有支援 */
  supported: boolean;
  /** 來自原版 GroupIdMap */
  original: boolean;
  label: string;
}

export function buildSummonList(
  groups: GroupDataMap,
  fishData: FishDataFile,
  isSupported: (fishType: number) => boolean,
): SummonEntry[] {
  const names = new Map(fishData.Fishes.map((f) => [f.Data, f.Name]));
  const groupSupported = (id: number) => {
    const g = getGroup(groups, id);
    return !!g && g.every((e) => isSupported(e.fish + 1));
  };
  const out: SummonEntry[] = GROUP_ID_MAP.map(([name, groupId]) => ({
    groupId,
    name,
    supported: groupSupported(groupId),
    original: true,
    label: `${groupId}-${name}`,
  }));
  const listed = new Set(out.map((e) => e.groupId));
  for (const id of listGroupIds(groups)) {
    if (listed.has(id) || !groupSupported(id)) continue;
    const types = [...new Set(getGroup(groups, id)!.map((e) => e.fish + 1))];
    const name = types.map((t) => names.get(t) ?? `#${t}`).join('、');
    out.push({ groupId: id, name, supported: true, original: false, label: `${id}-${name}` });
  }
  // 原版：依 groupId 由大到小（同 id 維持原順序）
  return out.map((e, i) => ({ e, i })).sort((a, b) => b.e.groupId - a.e.groupId || a.i - b.i).map((x) => x.e);
}
