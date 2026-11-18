import { RARITY_SCORE } from '@game/ugc/CardDefine';
import { LEVEL_CURVE_POWER } from '@game/ugc/CultivateRule';
import { homePopularityBreakdown, visitorCount } from '@game/ugc/HomeRule';
import { MAX_LEVEL, POPULARITY_DECO_CAP, POPULARITY_PER_SCENE, POPULARITY_PER_VISITOR, VISITOR_MIN, VISITOR_MAX } from '@game/ugc/UgcDefine';
import type { RoomDetail } from '@game/ugc/UgcTypes';

export interface MetricExplanation {
  title: string;
  formula: string;
  lines: string[];
  note: string;
}

export interface RoomMetric {
  label: string;
  value: string;
  icon: 'flame' | 'rooms' | 'cards' | 'gacha' | 'home';
  explanation: MetricExplanation;
}

const number = (value: number, digits = 1): string => Number(value.toFixed(digits)).toLocaleString('zh-TW', { maximumFractionDigits: digits });

/** 使用實際放出的龍種與共用規則，避免提示公式和伺服器計算分歧。 */
export function roomMetrics(room: RoomDetail): RoomMetric[] {
  const fish = [...new Set(room.slots.flatMap(slot => slot.fishTypes))];
  const scenes = new Set(room.slots.map(slot => slot.sceneType)).size;
  const highest = Math.max(1, ...fish.map(type => room.levels[type] ?? 1));
  const species: RoomMetric = {
    label: '登場龍種', value: `${fish.length} 種`, icon: 'cards',
    explanation: {
      title: '登場龍種怎麼算？', formula: '合併所有輪替場景的龍種，再去除重複',
      lines: [`${room.slots.length} 段輪替，共配置 ${room.slots.reduce((sum, s) => sum + s.fishTypes.length, 0)} 筆龍種。`, `去除重複後，共 ${fish.length} 種龍。`],
      note: '同一種龍出現在不同場景只算一次；未放入輪替表的收藏不計入。',
    },
  };
  if (room.kind === 'public') return [
    { label: '探索場景', value: `${scenes} 種`, icon: 'rooms', explanation: {
      title: '探索場景怎麼算？', formula: '輪替表中的場景種類，去除重複後計數',
      lines: [`${room.slots.length} 段輪替 → ${scenes} 種不同場景。`], note: '相同場景重複配置不會增加種類數。',
    } }, species,
    { label: '輪替間隔', value: `${room.slotSeconds} 秒`, icon: 'gacha', explanation: {
      title: '場景多久切換？', formula: `每段停留 ${room.slotSeconds} 秒，依輪替表循環`,
      lines: [`一輪 ${room.slots.length} 段 × ${room.slotSeconds} 秒／段 = ${room.slots.length * room.slotSeconds} 秒。`], note: '這是房間設定值，不受人氣或玩家等級影響。',
    } },
    { label: '入場限制', value: '自由進入', icon: 'home', explanation: {
      title: '公有地入場規則', formula: '公有地開放所有玩家進入',
      lines: ['不需要達到指定龍等級或家園人氣。'], note: '此欄為入場規則，沒有數值計算。',
    } },
  ];
  const breakdown = homePopularityBreakdown(room.slots, room.deco.length, type => room.levels[type] ?? 1);
  const rawVisitors = room.popularity / POPULARITY_PER_VISITOR;
  const limitedVisitors = visitorCount(room.popularity);
  const bounds = rawVisitors < VISITOR_MIN ? `低於下限，採用 ${VISITOR_MIN} 人。` : rawVisitors > VISITOR_MAX ? `超過上限，採用 ${VISITOR_MAX} 人。` : '位於上下限內，不需調整。';
  return [
    { label: '家園人氣', value: `${number(room.popularity)} 分`, icon: 'flame', explanation: {
      title: '家園人氣怎麼算？', formula: '龍種分（分）+ 場景分（分）+ 裝飾分（分）',
      lines: [
        `龍種：${breakdown.fishCount} 種，各自「稀有度分（分）× 等級係數（無單位）」加總 ≈ ${number(breakdown.dragonScore, 2)} 分。`,
        `場景：${scenes} 種 × ${POPULARITY_PER_SCENE} 分／種 = ${breakdown.sceneScore} 分。`,
        `裝飾：${room.deco.length} 件 × 1 分／件，上限 ${POPULARITY_DECO_CAP} 分 → ${breakdown.decorationScore} 分。`,
        `合計取小數 1 位 = ${number(breakdown.total)} 分。`,
      ],
      note: `每種龍的稀有度分：N ${RARITY_SCORE.N} 分／R ${RARITY_SCORE.R} 分／SR ${RARITY_SCORE.SR} 分／SSR ${RARITY_SCORE.SSR} 分。等級係數 = 1 + 2 × ((Lv − 1 級) ÷ ${MAX_LEVEL - 1} 級)^${LEVEL_CURVE_POWER}，Lv 為龍等級（級），1、2、指數 ${LEVEL_CURVE_POWER} 與計算結果皆無單位。同種龍與同種場景不重複計分。`,
    } }, species,
    { label: '最高龍等級', value: `Lv.${highest}`, icon: 'gacha', explanation: {
      title: '最高龍等級怎麼算？', formula: '取輪替表中所有登場龍種的最高等級（級）',
      lines: [`目前登場 ${fish.length} 種龍，最高為 Lv.${highest}（${highest} 級）。`, `等級上限為 Lv.${MAX_LEVEL}（${MAX_LEVEL} 級）。`],
      note: '這是龍的等級，不是屋主等級；收藏中尚未放出的龍不計入。',
    } },
    { label: '平均訪客', value: `${number(room.visitors)} 人`, icon: 'home', explanation: {
      title: '平均訪客怎麼算？', formula: `家園人氣（分）÷ 每位訪客所需人氣（分／人）`,
      lines: [`${number(room.popularity)} 分 ÷（${POPULARITY_PER_VISITOR} 分／人）= ${number(rawVisitors, 4)} 人。`, `${POPULARITY_PER_VISITOR} 分／人：每 ${POPULARITY_PER_VISITOR} 點人氣換算 1 位平均訪客。`, `範圍限制：${VISITOR_MIN}～${VISITOR_MAX} 人。${bounds}`, `取小數 1 位：${number(limitedVisitors, 4)} 人 → ${number(room.visitors)} 人。`],
      note: '平均訪客為家園收益用的模擬值，並非目前在線的真人數。',
    } },
  ];
}
