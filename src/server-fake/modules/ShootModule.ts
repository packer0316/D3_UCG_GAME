/**
 * 射擊：開砲扣款（押注 × 成本倍率）、命中判定（RtpEngine，可一次多條魚）、DUD 退款。
 */
import type { FakeServer, FakeServerModule } from '../FakeServer';

/** SpecialBulletType → 成本倍率（BulletDefine.lua SpecialBulletDefine） */
export const COST_RATE: Record<number, number> = { 0: 1, 1: 1, 2: 5, 3: 15, 4: 20, 5: 30 };

interface ServerBullet {
  bet: number;
  cost: number;
  bulletType: number;
  time: number;
}

export class ShootModule implements FakeServerModule {
  readonly id = 'shoot';
  private server!: FakeServer;
  private bullets = new Map<number, ServerBullet>();
  private killIndex = 0;
  /** DUD（沒打到魚）是否退款 */
  refundDud = true;

  install(server: FakeServer): void {
    this.server = server;
    const room = () => server.room;

    server.on('U2G_SHOOT_REQ', (req) => {
      const seat = room().self;
      const rate = COST_RATE[req.bulletType];
      const cost = req.bet * (rate ?? 1);
      if (rate === undefined || !room().betList.includes(req.bet) || seat.money < cost) {
        server.send('G2U_SHOOT_REJECT', { bulletId: req.bulletId, reason: seat.money < cost ? 'money' : 'bet', seatMoney: seat.money });
        return;
      }
      room().addMoney(-cost);
      this.bullets.set(req.bulletId, { bet: req.bet, cost, bulletType: req.bulletType, time: server.now() });
      server.send('G2U_SHOOT_NOTIFY', {
        seat: room().yourSeat,
        bulletId: req.bulletId,
        bet: req.bet,
        angle: req.angle,
        seatMoney: seat.money,
        bulletType: req.bulletType,
      });
    });

    server.on('U2G_HIT_REQ', (req) => {
      const b = this.bullets.get(req.bulletId);
      if (!b) return;
      this.bullets.delete(req.bulletId);
      const targets = req.scriptIdDataVec
        .map((id) => ({ id, fish: server.script.getFish(id) }))
        .filter((t): t is { id: typeof t.id; fish: { fishType: number } } => !!t.fish);
      if (targets.length === 0) {
        // 魚都已不存在 → 視同 DUD
        this.refund(req.bulletId, b);
        return;
      }
      // 一顆子彈的成本（押注 × 倍率）以注水法分攤給命中的魚 → 每顆子彈期望回收 = RTP × 成本
      const results = server.rtp.judgeMulti(
        targets.map((t) => t.fish.fishType),
        b.bet,
        b.cost / b.bet,
      );
      targets.forEach(({ id, fish }, i) => {
        const result = results[i];
        if (!result.win || !result.outcome) return;
        const money = room().addMoney(result.money);
        const unDead = !!result.outcome.unDead;
        if (!unDead) server.script.killFish(id);
        server.send('G2U_KILL_FLOATODDS_FISH_NOTIFY', {
          accountId: room().self.accountId,
          scriptIdData: id,
          fishType: fish.fishType,
          showType: result.outcome.showType,
          money: result.money,
          seatIndex: room().yourSeat,
          seatMoney: money,
          bet: b.bet,
          floatedOdds: result.odds ?? 0,
          floatedRate: result.outcome.rate,
          unDead,
          killIndex: ++this.killIndex,
        });
      });
    });

    server.on('U2G_DUD_REQ', (req) => {
      const b = this.bullets.get(req.bulletId);
      if (!b) return;
      this.bullets.delete(req.bulletId);
      this.refund(req.bulletId, b);
    });
  }

  private refund(bulletId: number, b: ServerBullet): void {
    const refund = this.refundDud ? b.cost : 0;
    const money = this.server.room.addMoney(refund);
    this.server.send('G2U_DUD_ACK', { bulletId, seatMoney: money, refund });
  }

  tick(now: number): void {
    // 超過 60 秒沒回報的子彈視同 DUD
    for (const [id, b] of this.bullets)
      if (now - b.time > 60000) {
        this.bullets.delete(id);
        this.refund(id, b);
      }
  }
}
