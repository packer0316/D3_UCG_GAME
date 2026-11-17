/**
 * 假 server 賠付表（第一版）。odds 預設取 FishData.json，這裡只定義 outcome 分布。
 *
 * showType 的意義由各魚定義（client FishDefine 的 winCircle / bossShowType）：
 *   1–11：showType 1（9–11 會出 Middle 獎圈）
 *   12–14：1 = 無獎圈、2/3/4 = Big 獎圈 ×5 / ×10 / ×100
 *   24 帝王暴龍：1 = 小獎不死、3 = BOSSSHOW（本階段 client 降級為小獎 + 死亡）
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
};

export function buildPayouts(fishOdds: Map<number, number>): Map<number, FishPayout> {
  const out = new Map<number, FishPayout>();
  for (const [type, outcomes] of Object.entries(PAYOUT_OUTCOMES)) {
    const t = Number(type);
    out.set(t, { odds: fishOdds.get(t) ?? 1, outcomes });
  }
  return out;
}
