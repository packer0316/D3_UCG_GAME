/**
 * 抽卡與培養（SPEC-UGC §6、§7）：規則在 game/ugc（GachaDefine / CultivateRule），這裡只做收發與入帳。
 */
import '@game/ugc/UgcProtocol';
import { applyLevelUp, applyLevelUpAll } from '@game/ugc/CultivateRule';
import { GACHA_COST, applyGachaItem, rollGacha } from '@game/ugc/GachaDefine';
import type { FakeServer, FakeServerModule } from '../FakeServer';

export class GachaModule implements FakeServerModule {
  readonly id = 'gacha';

  install(server: FakeServer): void {
    server.on('U2G_GACHA_DRAW_REQ', ({ times }) => {
      const store = server.profile;
      const p = store.profile;
      const cost = GACHA_COST[times];
      if (!cost) {
        server.send('G2U_GACHA_DRAW_ACK', { ok: false, reason: '只能單抽或十連', results: [] });
        return;
      }
      if (p.tickets < cost) {
        server.send('G2U_GACHA_DRAW_ACK', { ok: false, reason: `抽卡券不足（需要 ${cost} 張）`, results: [] });
        return;
      }
      p.tickets -= cost;
      p.stats.draws += times;
      const results = rollGacha(times, server.rng).map((item) => applyGachaItem(p, item));
      store.markDirty();
      // 場景重複會換成金幣
      server.room.syncMoney();
      server.send('G2U_GACHA_DRAW_ACK', { ok: true, results });
      server.sendProfile();
    });

    // 升級成功後：存檔、同步座位餘額；人在自己的家園 → 等級（倍率 / 抽成率）立即生效
    const afterLevelUp = () => {
      server.profile.markDirty();
      server.room.syncMoney();
      if (server.room.current.isMine) server.room.refreshInfo();
    };

    server.on('U2G_CARD_LEVELUP_REQ', ({ fishType }) => {
      const store = server.profile;
      const r = applyLevelUp(store.profile, fishType);
      const level = store.profile.fish[fishType]?.level ?? 0;
      if (r.ok) afterLevelUp();
      server.send('G2U_CARD_LEVELUP_ACK', { ...r, fishType, level });
      if (r.ok) server.sendProfile();
    });

    // 一鍵升級（§7.1）：以 min(餘額, maxGold) 為預算重算並套用
    server.on('U2G_CARD_LEVELUP_ALL_REQ', ({ maxGold }) => {
      const plan = applyLevelUpAll(server.profile.profile, maxGold);
      if (!plan.levels) {
        server.send('G2U_CARD_LEVELUP_ALL_ACK', { ok: false, reason: '沒有可升級的魚卡', ...plan });
        return;
      }
      afterLevelUp();
      server.send('G2U_CARD_LEVELUP_ALL_ACK', { ok: true, ...plan });
      server.sendProfile();
    });
  }
}
