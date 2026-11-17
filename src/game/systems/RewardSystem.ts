/**
 * 獎勵系統：收 118 KILL_FLOATODDS → KillShowRegistry 分派 → 表演。
 * 預設 handler = SmallWinShow（對照原版 FishBase:OnKillNotify）：
 *   1. 獎圈（依 FishRewardSetting.winCircle[showType]）或 跳字「+N」
 *   2. 噴錢（money > 0）
 *   3. unDead = false → 死亡表演；unDead = true → 魚繼續走
 * BOSSSHOW（showType == bossShowType）且沒有註冊 BossShow → 同樣走 SmallWinShow（Big 獎圈）
 */
import type { KillFloatOddsNotify } from '@net/protocol';
import { Act } from '@core/tween/Action';
import { WinCircleType, getFishDefine, type FishDefine } from '../define/FishDefine';
import { REWARD_PLISTS, FONT_JUMP_OTHER, FONT_JUMP_SELF, FONT_WIN_CIRCLE, WIN_CIRCLE_SHOCK_WORLD } from '../define/RewardDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';
import type { Fish } from '../world/Fish';
import { BulletHitFx } from '../show/BulletHitFx';
import { CoinSpray } from '../show/CoinSpray';
import { JumpNumber } from '../show/JumpNumber';
import { KillShowRegistry, type KillShowHandler } from '../show/KillShowRegistry';
import type { OverlayDeps } from '../show/OverlayDeps';
import { WinCircleManager } from '../show/WinCircleManager';

export class RewardSystem {
  readonly jumpNumber: JumpNumber;
  readonly coinSpray: CoinSpray;
  readonly winCircles: WinCircleManager;
  readonly hitFx: BulletHitFx;

  constructor(private readonly ctx: GameContext) {
    const deps: OverlayDeps = {
      assets: ctx.assets,
      actions: ctx.actions,
      audio: ctx.audio,
      stage: ctx.stage,
      layer: ctx.layers.reward,
    };
    this.jumpNumber = new JumpNumber(deps);
    this.coinSpray = new CoinSpray(deps);
    this.winCircles = new WinCircleManager(
      deps,
      (seat) => this.seats.winCircleAnchor(seat),
      () => ctx.events.emit('camera:shake', WIN_CIRCLE_SHOCK_WORLD),
    );
    this.hitFx = new BulletHitFx(ctx.csd, ctx.stage, ctx.layers.hitFx);
    ctx.registries.killShow.setDefault(new SmallWinShow(this, ctx));
  }

  async preload(): Promise<void> {
    const { assets } = this.ctx;
    await Promise.all([
      ...REWARD_PLISTS.map((p) => assets.atlas(p)),
      assets.font(FONT_JUMP_SELF),
      assets.font(FONT_JUMP_OTHER),
      assets.font(FONT_WIN_CIRCLE),
    ]);
  }

  private get seats() {
    return this.ctx.services.get(Tokens.SeatSystem);
  }

  init(): void {
    this.ctx.net.on('G2U_KILL_FLOATODDS_FISH_NOTIFY', (n) => this.onKill(n));
  }

  private onKill(n: KillFloatOddsNotify): void {
    const fishSys = this.ctx.services.get(Tokens.FishSystem);
    const fish = fishSys.getFish(n.scriptIdData.groupIndex * 1000 + n.scriptIdData.fishIndex) ?? null;
    const define = getFishDefine(n.fishType);
    this.ctx.events.emit('fish:kill', { notify: n, fish });
    this.ctx.registries.killShow.resolve(n, define).play(n, fish, define);
  }

  update(dt: number): void {
    this.winCircles.update(dt);
    this.hitFx.update(dt);
  }
}

/** 一般小獎表演（含 BOSSSHOW 降級） */
export class SmallWinShow implements KillShowHandler {
  constructor(
    private readonly reward: RewardSystem,
    private readonly ctx: GameContext,
  ) {}

  play(n: KillFloatOddsNotify, fish: Fish | null, define: FishDefine | undefined): void {
    const { stage, services } = this.ctx;
    const seats = services.get(Tokens.SeatSystem);
    const isSelf = n.seatIndex === seats.yourSeat;
    const fishPos = fish ? stage.worldToDesign(fish.getLockPos()) : seats.winCircleAnchor(n.seatIndex);

    // 1. 獎圈 or 跳字（FishBonus:PlayCircleShow）
    const isBossShow = KillShowRegistry.isBossShow(n, define);
    const wc = define?.reward.winCircle?.[n.showType];
    let type = wc?.type ?? WinCircleType.Non;
    if (isBossShow && type === WinCircleType.Non) type = WinCircleType.Big;
    if (type !== WinCircleType.Non && n.money > 0) {
      this.reward.winCircles.show(n.seatIndex, {
        type,
        money: n.money,
        fishImage: define?.reward.image ?? 'D3_00.png',
        mega: wc?.mega,
        isSelf,
      });
    } else {
      this.reward.jumpNumber.spawn(n.money, fishPos, isSelf);
    }

    // 2. 噴錢（FishBonus:PlayCoinShow）
    this.reward.coinSpray.play({
      money: n.money,
      bet: n.bet,
      floatedOdds: n.floatedOdds,
      from: fishPos,
      to: seats.seatAnchor(n.seatIndex),
      isSelf,
      onFirstArrive: () => this.reward.jumpNumber.spawn(n.money, seats.moneyJumpPos(n.seatIndex), isSelf),
    });

    // 3. 死亡 or 不死（被雷擊打到的魚依距離延遲死亡）
    if (!n.unDead && fish) {
      const fishSys = services.get(Tokens.FishSystem);
      const delay = fish.consumeKillDelay();
      if (delay > 0) {
        fish.hittable = false;
        this.ctx.actions.run(Act.seq(Act.delay(delay), Act.call(() => fishSys.killFish(fish))));
      } else {
        fishSys.killFish(fish);
      }
    }
  }
}
