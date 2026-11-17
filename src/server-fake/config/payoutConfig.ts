/**
 * 假 server 賠付表（第一版）。odds 預設取 FishData.json，這裡只定義 outcome 分布。
 *
 * showType 的意義由各魚定義（client FishDefine 的 winCircle / bossShowType）：
 *   1–11：showType 1（9–11 會出 Middle 獎圈）
 *   12–14：1 = 無獎圈、2/3/4 = Big 獎圈 ×5 / ×10 / ×100
 *   24 帝王暴龍：1 = 小獎不死、3 = BOSSSHOW（本階段 client 降級為小獎 + 死亡）
 *   15–17 特色魚：1 = 無獎圈死亡、2 = Big 死亡（原版 HitMore 大招 → 降級）
 *   22 獵龍騎士：1 = 無獎圈、不死（client 播 Attack）
 *   23 / 25 / 26 / 27 Boss：1 = 小獎不死、3 = Big 死亡（原版 Overlay BossShow → 降級）
 *   28 蒼龍翅膀：1 = Middle 獎圈、翅膀移除
 *   （SPEC §14.6）
 */
import type { FishPayout, PayoutOutcome } from '../rtp/RtpEngine';

export const TARGET_RTP = 1.1;

const normal: PayoutOutcome[] = [{ showType: 1, rate: 1, weight: 1 }];
const mega: PayoutOutcome[] = [
  { showType: 1, rate: 1, weight: 70 },
  { showType: 2, rate: 5, weight: 20 },
  { showType: 3, rate: 10, weight: 9 },
  { showType: 4, rate: 100, weight: 1 },
];
/** 特色魚 15–17（FishData 賠率 300） */
const special: PayoutOutcome[] = [
  { showType: 1, rate: 1, weight: 70 },
  { showType: 2, rate: 1, weight: 30 },
];
/** Boss（樹精 / 巨蠍 / 風神 / 蒼龍）：FishData 賠率 15000–30000 是 BossShow 總額，這裡覆寫成小獎 30、大獎 300 */
const boss: PayoutOutcome[] = [
  { showType: 1, rate: 1, weight: 90, unDead: true, odds: 30 },
  { showType: 3, rate: 1, weight: 10, odds: 300 },
];

/** fishType → outcomes（odds 由 FishData 補上；有 odds 欄位者覆寫） */
export const PAYOUT_OUTCOMES: Record<number, PayoutOutcome[]> = {
  1: normal,
  2: normal,
  3: normal,
  4: normal,
  5: normal,
  6: normal,
  7: normal,
  8: normal,
  9: normal,
  10: normal,
  11: normal,
  12: mega,
  13: mega,
  14: mega,
  24: [
    { showType: 1, rate: 1, weight: 90, unDead: true, odds: 30 },
    { showType: 3, rate: 1, weight: 10, odds: 300 },
  ],
  15: special,
  16: special,
  17: special,
  22: [{ showType: 1, rate: 1, weight: 1, unDead: true, odds: 50 }],
  23: boss,
  25: boss,
  26: boss,
  27: boss,
  28: normal,
};

export function buildPayouts(fishOdds: Map<number, number>): Map<number, FishPayout> {
  const out = new Map<number, FishPayout>();
  for (const [type, outcomes] of Object.entries(PAYOUT_OUTCOMES)) {
    const t = Number(type);
    out.set(t, { odds: fishOdds.get(t) ?? 1, outcomes });
  }
  return out;
}
