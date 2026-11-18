/**
 * 射擊：開砲扣款（押注 × 成本倍率）、命中判定（RtpEngine，可一次多條魚）、DUD 退款。
 *
 * UGC（SPEC-UGC §4、§7、§8.2）：
 * - 家園：魚卡等級 → 賠率倍率（原倍率的 0.4 ~ 1.4 倍；原倍率 < 10 固定；中獎機率與倍率成反比）
 * - 別人的家園：命中的子彈抽成給屋主（開砲成本 × 抽成率），這顆子彈的 RTP = 目標 − 抽成率
 * - 公有地 / 別人的家園：打死怪物時 10% 掉抽卡券（自己的家園不掉）
 */
import '@game/ugc/UgcProtocol';
import { commissionRate } from '@game/ugc/CultivateRule';
import { ticketDrop } from '@game/ugc/TicketRule';
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
      // 裝潢模式不能開砲
      const reason = room().editing ? 'edit' : rate === undefined || !room().betList.includes(req.bet) ? 'bet' : seat.money < cost ? 'money' : null;
      if (reason) {
        server.send('G2U_SHOOT_REJECT', { bulletId: req.bulletId, reason, seatMoney: seat.money });
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
      // 魚卡等級 → 倍率（公有地 ×1）；別人的家園：抽成（依被打中的龍的等級，多隻取平均）從這顆子彈的 RTP 扣
      const levels = targets.map((t) => room().fishLevel(t.fish.fishType));
      const othersHome = room().isOthersHome;
      const rate = othersHome ? levels.reduce((s, l) => s + commissionRate(l), 0) / levels.length : 0;
      if (rate > 0) room().addVisitCommission(b.cost * rate);
      // 一顆子彈的成本（押注 × 倍率）以注水法分攤給命中的魚 → 每顆子彈期望回收 = RTP × 成本
      const results = server.rtp.judgeMulti(
        targets.map((t) => t.fish.fishType),
        b.bet,
        b.cost / b.bet,
        { rtp: server.rtp.targetRtp - rate, mults: targets.map((t) => room().fishMultiplier(t.fish.fishType)) },
      );
      // 自己的家園不掉券
      const dropsTickets = !room().current.isMine;
      targets.forEach(({ id, fish }, i) => {
        const result = results[i];
        if (!result.win || !result.outcome) return;
        const money = room().addMoney(result.money);
        const unDead = !!result.outcome.unDead;
        if (!unDead) server.script.killFish(id);
        if (dropsTickets) this.rollTicket(id, unDead, levels[i], othersHome);
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

  /** 打死怪物擲抽卡券（§4：10%）；掉了就在擊殺通知之前送（client 還找得到那隻魚的位置） */
  private rollTicket(id: { groupIndex: number; fishIndex: number }, unDead: boolean, level: number, levelBonus: boolean): void {
    const drop = ticketDrop(unDead, level, levelBonus);
    if (!drop.count || this.server.rng.next() >= drop.chance) return;
    const store = this.server.profile;
    store.profile.tickets += drop.count;
    store.profile.stats.ticketsEarned += drop.count;
    store.markDirty();
    this.server.send('G2U_TICKET_DROP_NOTIFY', { scriptIdData: id, count: drop.count, tickets: store.profile.tickets });
  }

  private refund(bulletId: number, b: ServerBullet): void {
    const refund = this.refundDud ? b.cost : 0;
    const money = this.server.room.addMoney(refund);
    this.server.send('G2U_DUD_ACK', { bulletId, seatMoney: money, refund });
  }

  /** 換房：飛行中的子彈全部退款（不逐顆通知，房間資料會帶最新餘額） */
  refundAll(): void {
    for (const b of this.bullets.values()) if (this.refundDud) this.server.room.addMoney(b.cost);
    this.bullets.clear();
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
