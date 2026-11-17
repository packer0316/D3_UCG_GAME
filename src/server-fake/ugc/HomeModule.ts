/**
 * 家園（SPEC-UGC §8、§9）：輪替表 / 裝潢存檔、裝潢模式開關、模擬訪客抽成（線上累積 + 離線補算）、領取。
 */
import '@game/ugc/UgcProtocol';
import { validateDecoLayout } from '@game/ugc/DecoDefine';
import { homePopularity, incomePerSecond, validateSlots, visitorCount } from '@game/ugc/HomeRule';
import { INCOME_NOTIFY_INTERVAL_MS, OFFLINE_CAP_MS } from '@game/ugc/UgcDefine';
import type { HomeIncome } from '@game/ugc/UgcTypes';
import type { FakeServer, FakeServerModule } from '../FakeServer';

/** 取整數金額：收益是小數累加，1199.9999… 這種浮點誤差要當成 1200 */
const whole = (v: number) => Math.floor(v + 1e-6);

export class HomeModule implements FakeServerModule {
  readonly id = 'home';
  private server!: FakeServer;
  private nextNotify = 0;
  /** 這次啟動補算的離線收益（登入後通知一次） */
  private offlineEarned = 0;

  install(server: FakeServer): void {
    this.server = server;
    this.accrueOffline();

    server.on('U2G_HOME_CLAIM_REQ', () => {
      const store = server.profile;
      const home = store.profile.home;
      const amount = whole(home.pending);
      home.pending -= amount;
      store.profile.money += amount;
      store.markDirty();
      server.room.syncMoney();
      server.send('G2U_HOME_CLAIM_ACK', { amount, seatMoney: store.profile.money });
      server.send('G2U_HOME_INCOME_NOTIFY', this.income());
    });

    server.on('U2G_HOME_SAVE_REQ', ({ slots }) => {
      const store = server.profile;
      const p = store.profile;
      const r = validateSlots(
        slots,
        (t) => !!p.fish[t],
        (s) => p.scenes.includes(s),
      );
      if (r.ok) {
        p.home.slots = slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] }));
        store.markDirty();
      }
      server.send('G2U_HOME_SAVE_ACK', r);
      if (!r.ok) return;
      server.sendProfile();
      server.send('G2U_HOME_INCOME_NOTIFY', this.income());
      // 人在自己的家園：從第一格重新開始
      if (server.room.current.isMine) server.room.restartCurrent();
    });

    server.on('U2G_HOME_EDIT_REQ', ({ editing }) => {
      const ok = server.room.setEditing(editing);
      server.send('G2U_HOME_EDIT_ACK', ok ? { ok, editing } : { ok, editing: false, reason: '只能裝潢自己的家園' });
    });

    server.on('U2G_HOME_DECO_SAVE_REQ', ({ items }) => {
      const store = server.profile;
      const p = store.profile;
      const r = validateDecoLayout(items, p.decos);
      if (r.ok) {
        p.home.deco = items.map((d) => ({ id: d.id, x: d.x, y: d.y, rot: d.rot }));
        store.markDirty();
      }
      server.send('G2U_HOME_DECO_SAVE_ACK', r);
      if (!r.ok) return;
      server.sendProfile();
      if (server.room.current.isMine) {
        server.room.refreshInfo();
        server.send('G2U_ROOM_DECO_NOTIFY', { items: p.home.deco });
      }
    });
  }

  private get levelOf(): (fishType: number) => number {
    const fish = this.server.profile.profile.fish;
    return (t) => fish[t]?.level ?? 1;
  }

  private perSecond(): number {
    const home = this.server.profile.profile.home;
    return incomePerSecond(home.slots, home.deco.length, this.levelOf);
  }

  income(): HomeIncome {
    const home = this.server.profile.profile.home;
    const popularity = homePopularity(home.slots, home.deco.length, this.levelOf);
    return {
      pending: whole(home.pending),
      totalEarned: whole(home.totalEarned),
      visitors: Math.round(visitorCount(popularity) * 10) / 10,
      popularity,
      perSecond: Math.round(this.perSecond() * 10) / 10,
    };
  }

  private accrue(ms: number): number {
    const home = this.server.profile.profile.home;
    const earned = (this.perSecond() * ms) / 1000;
    home.pending += earned;
    home.totalEarned += earned;
    return earned;
  }

  /** 離線收益：依上次結算到現在的時間補算，最多 8 小時 */
  private accrueOffline(): void {
    const store = this.server.profile;
    const home = store.profile.home;
    const now = this.server.wallClock();
    const elapsed = Math.min(OFFLINE_CAP_MS, Math.max(0, now - home.lastAccrueAt));
    this.offlineEarned = whole(this.accrue(elapsed));
    home.lastAccrueAt = now;
    store.markDirty();
  }

  /** 登入後呼叫：送目前收益，離線補算的金額只報一次 */
  sendIncome(): void {
    const data = this.income();
    this.server.send('G2U_HOME_INCOME_NOTIFY', this.offlineEarned > 0 ? { ...data, offlineEarned: this.offlineEarned } : data);
    this.offlineEarned = 0;
  }

  tick(now: number, dtMs: number): void {
    this.accrue(dtMs);
    if (now < this.nextNotify) return;
    this.nextNotify = now + INCOME_NOTIFY_INTERVAL_MS;
    const store = this.server.profile;
    store.profile.home.lastAccrueAt = this.server.wallClock();
    store.markDirty();
    this.server.send('G2U_HOME_INCOME_NOTIFY', this.income());
  }
}
