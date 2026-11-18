/**
 * 射擊系統 — 對照原版 ShootingSystem.lua + BulletLayer.lua + BulletManager.lua + ShootCtrl.lua
 *
 * 子彈類型（SkillSystem 決定）：
 * - None：按住朝觸控點連射，直線、撞牆反彈、地面 OBB 碰撞（第一階段）
 * - 鎖定類（Lock / Focus / Spread / Advanced / LaserLock）：需要目標
 *     auto：自動選目標連射；手動：點到魚 → 鎖定，按住才射；點空白不射
 *     追蹤彈 / 雷擊 / 雷射由 BulletBehaviorRegistry 建立，抵達後 host.hit()
 * 開砲：本地先建子彈 → 送 U2G_SHOOT_REQ（原版 Net_Shoot）；本地預扣 押注 × 成本倍率
 */
import * as THREE from 'three';
import { obbIntersects, pointInPolygon } from '@core/math/geom2d';
import type { ScriptIdData } from '@net/protocol';
import type { PointerInfo } from '@engine/input/PointerRouter';
import {
  BULLET_BLANK_TIME,
  BULLET_DATA,
  BULLET_MAX_COUNT,
  BULLET_OUTSIDE_CHECK_INTERVAL,
  LIGHTNING_EXTRA_HITS,
  SPECIAL_BULLETS,
  SpecialBulletType,
  type BulletDefine,
  type CannonSkinId,
  type SpecialBulletTypeId,
} from '../define/BulletDefine';
import { CANNON_SKINS } from '../define/CannonDefine';
import type { GameContext } from '../GameContext';
import { Tokens } from '../Tokens';
import { NormalBullet } from '../bullet/NormalBullet';
import { TrackBullet } from '../bullet/TrackBullet';
import { LightningBullet } from '../bullet/LightningBullet';
import { LaserBeam, LaserShot } from '../bullet/LaserShot';
import type { ActiveBullet, BulletHost } from '../bullet/BulletTypes';
import { Cannon, type CannonSkinAssets } from '../world/Cannon';
import type { Fish } from '../world/Fish';
import type { PlayField } from '../world/PlayField';
import { FishHitShow } from '../show/FishHitShow';
import type { BulletHitFx } from '../show/BulletHitFx';

/** 一般子彈也可打飛行魚（原版需鎖定彈，見 SPEC §12） */
const NORMAL_BULLET_HITS_FLYING = true;

const toId = (f: Fish): ScriptIdData => ({ groupIndex: f.groupIndex, fishIndex: f.fishIndex });

/** 觀看模式點場地的提示，最短間隔（秒） */
const OBSERVER_HINT_INTERVAL = 3;

export class ShootingSystem implements BulletHost {
  private cannons = new Map<number, Cannon>();
  private normals: NormalBullet[] = [];
  private lockShots: ActiveBullet[] = [];
  private skins = new Map<CannonSkinId, CannonSkinAssets>();
  private beam: LaserBeam | null = null;
  private bulletSeq = 0;
  private cd = 0;
  private holding = false;
  private releaseAt = -1;
  private time = 0;
  private outsideTimer = 0;
  private aimTarget: THREE.Vector3 | null = null;
  private hitShow: FishHitShow;
  private hitFx: BulletHitFx | null = null;
  private type: SpecialBulletTypeId = SpecialBulletType.None;
  private auto = false;
  /** 一般模式下點到魚：按住期間以鎖定彈射擊該魚（放開解除） */
  private clickLock = false;
  /** 觀看模式提示：下一次可以提示的時間 */
  private observerHintAt = 0;
  /** 子彈牆（跟相機設定走） */
  private readonly playField: PlayField;

  constructor(private readonly ctx: GameContext) {
    this.playField = ctx.services.get(Tokens.PlayField);
    this.hitShow = new FishHitShow(ctx.actions);
    ctx.registries.bullet.register('track', (p) => new TrackBullet(p));
    ctx.registries.bullet.register('lightning', (p) => new LightningBullet(p));
    ctx.registries.bullet.register('laser', (p) => new LaserShot(p));
  }

  // ---- BulletHost
  get stage() {
    return this.ctx.stage;
  }
  get efk() {
    return this.ctx.efk;
  }
  get csd() {
    return this.ctx.csd;
  }
  get actions() {
    return this.ctx.actions;
  }
  get layer3d() {
    return this.ctx.layers.bullet;
  }
  get overlay() {
    return this.ctx.layers.hitFx;
  }

  setHitFx(fx: BulletHitFx): void {
    this.hitFx = fx;
  }

  async preload(): Promise<void> {
    const { assets, efk, csd } = this.ctx;
    const opt = <T>(p: Promise<T>) => p.catch((e) => (console.warn('[ShootingSystem] preload', e), null));
    await Promise.all(
      Object.values(CANNON_SKINS).map(async (def) => {
        const [template, map, normalMap, matcap, fire, attached] = await Promise.all([
          assets.model(def.model),
          def.texture ? opt(assets.texture(def.texture)) : Promise.resolve(null),
          opt(assets.texture(def.shaderImg.normalMap)),
          opt(assets.texture(def.shaderImg.matCap)),
          opt(assets.texture(def.shaderImg.fireTexture)),
          Promise.all((def.attached ?? []).map((a) => assets.model(a.model))),
        ]);
        this.skins.set(def.id, { def, template, map, normalMap, matcap, fire, attached });
      }),
    );
    const efks = new Set<string>();
    for (const b of Object.values(BULLET_DATA)) if (b.efk) efks.add(b.efk.file);
    for (const s of Object.values(CANNON_SKINS)) {
      for (const e of s.atkEfk) efks.add(e.efk.file);
      efks.add(s.coolDownEfk.efk.file);
    }
    const csds = new Set<string>(['DinosaurExport/Bullet_dt3/dt3_cannon_E_Bullet.csd']);
    for (const b of Object.values(BULLET_DATA)) {
      if (b.csd) csds.add(b.csd);
      if (b.hitFx) csds.add(b.hitFx.csd);
    }
    await Promise.all([...[...efks].map((f) => opt(efk.load(f))), ...[...csds].map((c) => opt(csd.load(c)))]);
    for (const s of new Set(Object.values(SPECIAL_BULLETS).map((s) => s.sound))) void this.ctx.audio.load(s);
  }

  init(): void {
    const { net, events, stage } = this.ctx;
    events.on('seat:update', ({ seat, data }) => {
      if (data) this.ensureCannon(seat);
      else this.removeCannon(seat);
    });
    events.on('skill:change', ({ bulletType, auto }) => this.setMode(bulletType, auto));
    net.on('G2U_SHOOT_REJECT', (d) => {
      const b = this.normals.find((x) => x.id === d.bulletId) ?? this.lockShots.find((x) => x.id === d.bulletId);
      if (b) this.removeBullet(b);
      events.emit('shoot:reject', { reason: d.reason });
    });
    stage.onResize(() => {
      for (const c of this.cannons.values()) this.placeCannon(c);
    });
    // 換房（SPEC-UGC §2.1）：飛行中的子彈直接清掉（server 已退款，不送 DUD）
    net.on('G2U_ROOM_DATA_NOTIFY', () => this.clearBullets());
    this.ctx.input.add({
      priority: 0,
      down: (p) => this.onPointerDown(p),
      move: (p) => this.onPointerMove(p),
      up: () => {
        // 原版：touch end 0.01s 後才清除射擊狀態 → 點一下至少一發
        if (this.holding) this.releaseAt = this.time + 0.01;
      },
    });
  }

  private get seatSystem() {
    return this.ctx.services.get(Tokens.SeatSystem);
  }
  private get lock() {
    return this.ctx.services.get(Tokens.LockSystem);
  }
  private get special() {
    return SPECIAL_BULLETS[this.type];
  }

  /** 子彈類型 / auto 改變（SkillSystem） */
  private setMode(type: SpecialBulletTypeId, auto: boolean): void {
    this.type = type;
    this.auto = auto;
    const sp = SPECIAL_BULLETS[type];
    this.lock.limitOdds = sp.limitOdds ?? 0;
    if (!sp.isLockFish) this.lock.clear();
    this.selfCannon?.setSkin(sp.cannonSkin);
    if (type !== SpecialBulletType.LaserLock) this.beam?.end();
    this.ctx.events.emit('shoot:auto', { enabled: auto });
  }

  get bulletType(): SpecialBulletTypeId {
    return this.type;
  }

  /** 舊介面相容（debug / 鍵盤）：開關 AIAuto */
  setAuto(enabled: boolean): void {
    this.ctx.services.get(Tokens.SkillSystem).set('AIAuto', enabled);
  }

  get isAuto(): boolean {
    return this.auto;
  }

  // ------------------------------------------------------------------
  // 砲台
  // ------------------------------------------------------------------

  private ensureCannon(seat: number): Cannon | null {
    if (this.cannons.has(seat)) return this.cannons.get(seat)!;
    if (!this.skins.size) return null;
    const c = new Cannon(seat, this.skins, this.ctx.efk, this.special.cannonSkin);
    this.cannons.set(seat, c);
    this.placeCannon(c);
    this.ctx.layers.cannon.add(c.node);
    return c;
  }

  private removeCannon(seat: number): void {
    const c = this.cannons.get(seat);
    if (!c) return;
    c.node.removeFromParent();
    this.cannons.delete(seat);
  }

  /** CannonView:InitPositionBy2DAnchor：座位錨點射線投到地面 */
  private placeCannon(c: Cannon): void {
    const a = this.seatSystem.seatAnchor(c.seat);
    const g = this.ctx.stage.designToGround(a.x, a.y);
    if (g) c.node.position.set(g.x, g.y, 0);
  }

  get selfCannon(): Cannon | undefined {
    return this.cannons.get(this.seatSystem.yourSeat);
  }

  // ------------------------------------------------------------------
  // 輸入（BulletLayer:onTouchBegan / Moved / Ended）
  // ------------------------------------------------------------------

  private onPointerDown(p: PointerInfo): boolean {
    if (p.button !== 0) return false;
    // 觀看模式（自己的家園）：不開砲、不鎖定，提示一下（最多每 3 秒一次）
    if (this.seatSystem.isObserver) {
      if (this.time >= this.observerHintAt) {
        this.observerHintAt = this.time + OBSERVER_HINT_INTERVAL;
        this.ctx.events.emit('shoot:reject', { reason: 'observer' });
      }
      return false;
    }
    this.releaseAt = -1;
    const fish = this.lock.pickAt(p.x, p.y);
    if (this.special.isLockFish) {
      // 點到魚 → 鎖定（點選優先）；手動模式點空白不射
      if (fish) this.lock.lock(fish, true);
      this.holding = !!fish || !!this.lock.target;
      return true;
    }
    if (fish) {
      // 一般模式點到魚 → 鎖定該魚，按住期間以鎖定彈（×1）射擊；放開解除
      // （使用者需求；原版一般模式只朝觸控點直射）
      this.clickLock = true;
      this.lock.lock(fish, true);
      this.holding = true;
      return true;
    }
    this.holding = true;
    this.aimAtDesign(p.x, p.y);
    return true;
  }

  private onPointerMove(p: PointerInfo): void {
    // 鎖定中移動觸控不改變瞄準（原版 BulletLayer.lua:233）
    if (this.holding && !this.special.isLockFish) this.aimAtDesign(p.x, p.y);
  }

  private aimAtDesign(x: number, y: number): void {
    const g = this.ctx.stage.designToGround(x, y);
    if (!g) return;
    this.aimTarget = g;
    this.selfCannon?.aimAt(g);
  }

  // ------------------------------------------------------------------
  // 開砲
  // ------------------------------------------------------------------

  private seatBulletCount(seat: number): number {
    let n = 0;
    for (const b of this.normals) if (b.seat === seat) n++;
    for (const b of this.lockShots) if (b.seat === seat) n++;
    return n;
  }

  /** 金額 / 數量檢查（ShootingSystem:shootCheck） */
  private canShoot(cost: number): boolean {
    const s = this.seatSystem;
    return s.bet > 0 && s.displayMoney >= cost && this.seatBulletCount(s.yourSeat) < BULLET_MAX_COUNT;
  }

  private sendShoot(id: number, bet: number, angle: number, targets: Fish[], type: SpecialBulletTypeId): void {
    const sp = SPECIAL_BULLETS[type];
    this.seatSystem.predictShot(id, bet * sp.costRate);
    this.ctx.net.send('U2G_SHOOT_REQ', {
      bulletId: id,
      bulletType: type,
      bet,
      angle: ((angle % 360) + 360) % 360,
      scriptIdDataVec: targets.map(toId),
    });
    this.ctx.audio.play(sp.sound, { volume: 0.6, minInterval: 0.08 });
    this.ctx.events.emit('shoot:fire', { seat: this.seatSystem.yourSeat, bulletId: id });
  }

  private fireNormal(): boolean {
    const seatSys = this.seatSystem;
    const cannon = this.selfCannon;
    const def = BULLET_DATA[this.special.bulletId];
    if (!cannon || !this.canShoot(seatSys.bet * this.special.costRate)) return false;
    cannon.fire(false);
    const start = this.ctx.stage.projectToGround(cannon.getMuzzleWorld()) ?? cannon.node.position.clone();
    const id = ++this.bulletSeq;
    const b = new NormalBullet(id, seatSys.yourSeat, seatSys.bet, def, { x: start.x, y: start.y }, cannon.angle, this.ctx.efk, true);
    this.normals.push(b);
    this.ctx.layers.bullet.add(b.node);
    this.sendShoot(id, seatSys.bet, cannon.angle, [], this.type);
    return true;
  }

  /** 雷擊目標：主目標 + 範圍內其他可打的魚（依距離），總數 random(2,5)+1 */
  private lightningTargets(main: Fish, def: BulletDefine): Fish[] {
    const range = def.range ?? 60;
    const [a, b] = LIGHTNING_EXTRA_HITS;
    const extra = a + Math.floor(Math.random() * (b - a + 1));
    const mp = main.node.position;
    const near: { f: Fish; d: number }[] = [];
    for (const f of this.ctx.services.get(Tokens.FishSystem).hittable()) {
      if (f === main || !this.lock.isSelectable(f)) continue;
      const d = Math.hypot(f.node.position.x - mp.x, f.node.position.y - mp.y);
      if (d <= range) near.push({ f, d });
    }
    near.sort((x, y) => x.d - y.d);
    return [main, ...near.slice(0, extra).map((n) => n.f)];
  }

  private fireLock(target: Fish, type: SpecialBulletTypeId): boolean {
    const seatSys = this.seatSystem;
    const cannon = this.selfCannon;
    const sp = SPECIAL_BULLETS[type];
    const def = BULLET_DATA[sp.bulletId];
    if (!cannon || !this.canShoot(seatSys.bet * sp.costRate)) return false;
    cannon.aimAt(target.node.position);
    cannon.fire(true);
    const targets = def.kind === 'lightning' ? this.lightningTargets(target, def) : [target];
    const id = ++this.bulletSeq;
    const shot = this.ctx.registries.bullet.create(def.kind, {
      host: this,
      id,
      seat: seatSys.yourSeat,
      bet: seatSys.bet,
      def,
      bulletType: type,
      isSelf: true,
      muzzle: cannon.getMuzzleWorld(),
      targets,
    });
    this.lockShots.push(shot);
    if (def.kind === 'laser') this.ensureBeam(def).shoot();
    this.sendShoot(id, seatSys.bet, def.kind === 'lightning' ? 0 : cannon.angle, targets, type);
    return true;
  }

  private ensureBeam(def: BulletDefine): LaserBeam {
    if (!this.beam) {
      this.beam = new LaserBeam(this.ctx.csd, this.ctx.stage, this.ctx.layers.hitFx, def.csd!);
      this.beam.onEnd = () => this.selfCannon?.stopLoopEfk();
    }
    return this.beam;
  }

  // ------------------------------------------------------------------
  // 命中 / 消失（BulletHost）
  // ------------------------------------------------------------------

  hit(bullet: ActiveBullet | NormalBullet, fishes: Fish[], point: THREE.Vector3): void {
    if (bullet.isSelf && fishes.length) {
      this.ctx.net.send('U2G_HIT_REQ', { bulletId: bullet.id, scriptIdDataVec: fishes.map(toId) });
      if (bullet.def.kind === 'lightning') {
        const main = fishes[0];
        const range = bullet.def.range ?? 60;
        const dur = bullet.def.duration ?? 0.3;
        fishes.forEach((f, i) => {
          const d = i === 0 ? 0 : (dur * f.node.position.distanceTo(main.node.position)) / range;
          f.setKillDelay(d);
          this.hitShow.playLightning(f, i === 0, d);
        });
      } else {
        for (const f of fishes) this.hitShow.play(f);
      }
      for (const f of fishes) this.ctx.events.emit('fish:hit', { fish: f });
    }
    this.hitFx?.play(bullet.seat, point, bullet.def.hitFx);
    this.removeBullet(bullet);
  }

  /** 子彈消失（撞牆 3 次、超時、出界、目標消失）：送 DUD + 命中特效 */
  blank(bullet: ActiveBullet | NormalBullet, point: THREE.Vector3): void {
    if (bullet.isSelf) this.ctx.net.send('U2G_DUD_REQ', { bulletId: bullet.id });
    this.hitFx?.play(bullet.seat, point, bullet.def.hitFx);
    this.removeBullet(bullet);
  }

  /** 清掉所有飛行中的子彈與雷射光束（不通知 server） */
  clearBullets(): void {
    for (const b of [...this.normals, ...this.lockShots]) b.destroy();
    this.normals = [];
    this.lockShots = [];
    this.beam?.end();
    this.holding = false;
    this.releaseAt = -1;
    this.clickLock = false;
  }

  private removeBullet(b: ActiveBullet | NormalBullet): void {
    b.destroy();
    if (b instanceof NormalBullet) {
      const i = this.normals.indexOf(b);
      if (i >= 0) this.normals.splice(i, 1);
    } else {
      const i = this.lockShots.indexOf(b);
      if (i >= 0) this.lockShots.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    if (this.releaseAt >= 0 && this.time >= this.releaseAt) {
      this.holding = false;
      this.releaseAt = -1;
      if (this.clickLock) {
        this.clickLock = false;
        this.lock.clear();
      }
    }

    // ---- 開砲（ShootCtrl：CD 迴圈）
    const sp = this.special;
    this.cd -= dt;
    if (sp.isLockFish || this.clickLock) {
      // 一般模式點魚 → 以鎖定彈（Lock）射擊
      const type = sp.isLockFish ? this.type : SpecialBulletType.Lock;
      const target = this.lock.ensureTarget(sp.isLockFish && this.auto);
      if (target && (this.auto || this.holding)) {
        if (this.cd <= 0 && this.fireLock(target, type)) this.cd = SPECIAL_BULLETS[type].shootCD;
      }
    } else {
      if (this.holding && this.aimTarget) this.selfCannon?.aimAt(this.aimTarget);
      if (this.holding && this.cd <= 0 && this.fireNormal()) this.cd = sp.shootCD;
    }
    for (const c of this.cannons.values()) c.update(dt);

    // ---- 鎖定類子彈
    for (const b of [...this.lockShots]) b.update(dt);

    // ---- 雷射光束
    if (this.beam?.active) {
      const cannon = this.selfCannon;
      if (cannon) this.beam.update(dt, cannon.getMuzzleWorld(), this.type === SpecialBulletType.LaserLock ? this.lock.target : null);
    }

    // ---- 一般子彈（大 dt 時分段，避免穿透）
    const fishSys = this.ctx.services.get(Tokens.FishSystem);
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of [...this.normals]) {
        if (!b.alive) continue;
        const r = b.update(sdt, this.playField.wall);
        if (r === 'blank' || b.age >= BULLET_BLANK_TIME) {
          this.blank(b, new THREE.Vector3(b.node.position.x, b.node.position.y, 0));
          continue;
        }
        const obb = b.getOBB();
        for (const fish of fishSys.hittable()) {
          if (fish.isFlying && !NORMAL_BULLET_HITS_FLYING) continue;
          const center = fish.isFlying ? this.ctx.stage.projectToGround(fish.getLockPos()) : null;
          if (obbIntersects(obb, fish.getOBB(center ?? undefined))) {
            this.hit(b, [fish], new THREE.Vector3(b.node.position.x, b.node.position.y, 0));
            break;
          }
        }
      }
    }

    // ---- 每秒清除牆外子彈
    this.outsideTimer += dt;
    if (this.outsideTimer >= BULLET_OUTSIDE_CHECK_INTERVAL) {
      this.outsideTimer = 0;
      for (const b of [...this.normals]) {
        if (!pointInPolygon(b.pos, this.playField.wall)) this.blank(b, new THREE.Vector3(b.pos.x, b.pos.y, 0));
      }
    }
  }

  get bulletCount(): number {
    return this.normals.length + this.lockShots.length;
  }
}
