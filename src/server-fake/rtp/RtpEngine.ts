/**
 * 假 RTP 引擎（目標 RTP 預設 110%）。
 *
 * 每條魚有賠付結果表 outcomes；每次命中：
 *   E = Σ(weight × odds × rate) / Σweight
 *   P(中獎) = min(1, RTP / E)
 *   中獎 → 依 weight 抽 outcome → money = bet × odds × rate
 * 因此每顆「命中」子彈的期望回收 = RTP × bet。
 */
import { Random } from '@core/math/random';

export interface PayoutOutcome {
  showType: number;
  /** 倍率（floatedRate） */
  rate: number;
  weight: number;
  /** 給獎但魚不死 */
  unDead?: boolean;
  /** 覆寫賠率（例如 Boss 小獎） */
  odds?: number;
}

export interface FishPayout {
  odds: number;
  outcomes: PayoutOutcome[];
}

export interface JudgeResult {
  win: boolean;
  outcome?: PayoutOutcome;
  odds?: number;
  money: number;
}

export interface JudgeOptions {
  /** 這次判定用的目標 RTP（省略 = targetRtp）；家園 = 目標 − 屋主抽成率（SPEC-UGC §8.2） */
  rtp?: number;
  /** 每條魚的賠率倍率（魚卡等級，SPEC-UGC §7）；省略 = 1 */
  mults?: readonly number[];
}

export interface RtpStats {
  totalBet: number;
  totalWin: number;
  hits: number;
  wins: number;
  rtp: number;
}

export class RtpEngine {
  private payouts = new Map<number, FishPayout>();
  private rng: Random;
  private stats = { totalBet: 0, totalWin: 0, hits: 0, wins: 0 };
  /** debug：下一次命中必中（可指定 showType） */
  forceNext: { showType?: number } | null = null;
  /** 出獎模式（原版 SetCheatList）：每次命中必中獎 */
  cheatMode = false;

  constructor(
    public targetRtp: number,
    seed?: number,
  ) {
    this.rng = new Random(seed);
  }

  setPayout(fishType: number, payout: FishPayout): void {
    this.payouts.set(fishType, payout);
  }

  getPayout(fishType: number): FishPayout | undefined {
    return this.payouts.get(fishType);
  }

  expectedOdds(p: FishPayout): number {
    const tw = p.outcomes.reduce((s, o) => s + o.weight, 0);
    return p.outcomes.reduce((s, o) => s + o.weight * (o.odds ?? p.odds) * o.rate, 0) / tw;
  }

  /**
   * 命中一次的判定（bet 已在開砲時扣除，這裡只記帳）。
   * weight = 這次命中分到的成本 / 押注：一般子彈 1；榴彈 5；雷擊打到 n 條 = 20 / n
   * → 中獎機率 × weight，賠付仍以押注計算，每顆子彈期望回收 = RTP × 成本。
   */
  judge(fishType: number, bet: number, weight = 1): JudgeResult {
    return this.judgeMulti([fishType], bet, weight)[0];
  }

  /**
   * 一顆子彈同時命中多條魚（雷擊）。totalWeight = 成本 / 押注。
   * 期望派彩 RTP × totalWeight 以「注水法」分配：每條魚最多能吸收自己的期望賠率（機率 = 1），
   * 吸收不了的部分分給還有空間的魚 → 小魚多時 RTP 仍維持在目標值（總容量不足時才會低於）。
   * opts.mults：各魚的賠率倍率；opts.rtp：覆寫目標 RTP。
   */
  judgeMulti(fishTypes: number[], bet: number, totalWeight: number, opts: JudgeOptions = {}): JudgeResult[] {
    this.stats.totalBet += bet * totalWeight;
    this.stats.hits += fishTypes.length;
    const items = fishTypes.map((type, i) => {
      const p = this.payouts.get(type);
      const mult = opts.mults?.[i] ?? 1;
      const cap = p && p.outcomes.length ? this.expectedOdds(p) * mult : 0;
      return { i, p, cap, mult, value: 0 };
    });
    let remaining = (opts.rtp ?? this.targetRtp) * totalWeight;
    const order = [...items].filter((x) => x.cap > 0).sort((a, b) => a.cap - b.cap);
    for (let k = 0; k < order.length; k++) {
      const share = remaining / (order.length - k);
      order[k].value = Math.min(order[k].cap, share);
      remaining -= order[k].value;
    }
    return items.map((x) => this.roll(x.p, bet, x.cap > 0 ? x.value / x.cap : 0, x.mult));
  }

  private roll(p: FishPayout | undefined, bet: number, prob: number, mult: number): JudgeResult {
    if (!p || p.outcomes.length === 0) return { win: false, money: 0 };
    let outcome: PayoutOutcome | undefined;
    if (this.forceNext) {
      const want = this.forceNext.showType;
      outcome = (want !== undefined && p.outcomes.find((o) => o.showType === want)) || this.rng.weighted(p.outcomes, (o) => o.weight);
      this.forceNext = null;
    } else if (this.cheatMode) {
      outcome = this.rng.weighted(p.outcomes, (o) => o.weight);
    } else {
      if (this.rng.next() >= prob) return { win: false, money: 0 };
      outcome = this.rng.weighted(p.outcomes, (o) => o.weight);
    }
    // 倍率（魚卡等級）乘在賠率上：賠付變高、中獎機率等比例變低（期望回收不變）
    const odds = (outcome.odds ?? p.odds) * mult;
    const money = Math.round(bet * odds * outcome.rate);
    this.stats.totalWin += money;
    this.stats.wins++;
    return { win: true, outcome, odds, money };
  }

  getStats(): RtpStats {
    const s = this.stats;
    return { ...s, rtp: s.totalBet > 0 ? s.totalWin / s.totalBet : 0 };
  }

  resetStats(): void {
    this.stats = { totalBet: 0, totalWin: 0, hits: 0, wins: 0 };
  }
}
