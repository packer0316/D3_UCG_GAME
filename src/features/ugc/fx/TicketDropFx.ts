/**
 * 掉抽卡券的表演（SPEC-UGC §4.1，3D）：
 *   彈出（魚的位置）→ 翻轉落地、彈兩下、平躺 → 停一下 → 像金幣一樣飛向自己的砲台
 *   → 抵達時在座位跳金色獎圈（Reward_Min 金框，中間是券、數字 xN），功能列的抽卡按鈕跳一下。
 * server 把 G2U_TICKET_DROP_NOTIFY 排在擊殺通知之前送，所以這時還找得到那隻魚。
 * 券畫在自己的 render pass（3D 世界之後、2D overlay 之前，先清深度）→ 不會被地板或魚擋住。
 */
import * as THREE from 'three';
import '@game/ugc/UgcProtocol';
import { WinCircleType } from '@game/define/FishDefine';
import { Sound } from '@game/define/SoundDefine';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import type { RenderPass } from '@engine/stage/Stage';
import { TICKET_REST_Z, createGroundFlash, createTicket, ticketIconFrame, type GroundFlash, type TicketView } from './TicketModel';

/** 重力（世界單位 / 秒²） */
const GRAVITY = -320;
/** 彈出：往上的初速、水平飄移速度 */
const POP_UP = 105;
const POP_DRIFT = 22;
/** 彈出時縮放 0 → 1 的時間 */
const POP_TIME = 0.16;
/** 落地反彈：速度保留比例；低於這個速度就停 */
const RESTITUTION = 0.42;
const MIN_BOUNCE = 22;
/** 在地上停多久才飛 */
const REST_TIME = 0.35;
/** 飛回座位：設計像素 / 秒，時間夾在 min ~ max；路徑往上拱的高度 */
const FLY_SPEED = 1100;
const FLY_MIN = 0.35;
const FLY_MAX = 0.9;
const FLY_ARC = 20;
/** 抵達前縮小到幾成 */
const FLY_END_SCALE = 0.6;
/** 多張時每張間隔 */
const STAGGER = 0.08;
/** 地面金光 */
const FLASH_TIME = 0.5;
const FLASH_RADIUS = 13;

type Phase = 'wait' | 'air' | 'rest' | 'fly';

interface FlyingTicket {
  view: TicketView;
  phase: Phase;
  /** 進入目前階段後的秒數 */
  age: number;
  delay: number;
  vel: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spin: number;
  /** 平躺時的朝向（繞 Z） */
  yaw: number;
  bounces: number;
  fly: { from: THREE.Vector3; to: THREE.Vector3; dur: number; t: number; q0: THREE.Quaternion; ppu0: number } | null;
  onArrive: (() => void) | null;
}

interface Flash {
  view: GroundFlash;
  age: number;
}

const tmpQ = new THREE.Quaternion();
const flatQ = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

export class TicketDropFx {
  private readonly scene = new THREE.Scene();
  private readonly pass: RenderPass;
  private readonly tickets: FlyingTicket[] = [];
  private readonly flashes: Flash[] = [];

  constructor(
    private readonly ctx: GameContext,
    /** 功能列的抽卡按鈕（抵達時跳一下） */
    private readonly target: HTMLElement,
  ) {
    this.pass = {
      id: 'ugc-ticket',
      order: 250,
      enabled: false,
      render: (s) => {
        s.renderer.state.buffers.depth.setMask(true);
        s.renderer.clearDepth();
        s.renderer.render(this.scene, s.camera);
      },
    };
    ctx.stage.addPass(this.pass);
    ctx.net.on('G2U_TICKET_DROP_NOTIFY', ({ scriptIdData, count }) => {
      const fish = ctx.services.get(Tokens.FishSystem).getFish(scriptIdData.groupIndex * 1000 + scriptIdData.fishIndex);
      this.play(count, fish?.getLockPos());
    });
  }

  /** 播表演（不加券）；from = 彈出的世界座標，沒有 → 畫面中央的地面 */
  play(count = 1, from?: THREE.Vector3): void {
    if (count <= 0) return;
    const start = from?.clone() ?? this.groundAt(this.ctx.stage.designWidth / 2, this.ctx.stage.designHeight / 2).setZ(20);
    for (let i = 0; i < count; i++) {
      const view = createTicket();
      view.root.position.copy(start);
      view.root.visible = false;
      view.root.scale.setScalar(0.001);
      this.scene.add(view.root);
      const dir = Math.random() * Math.PI * 2;
      const drift = POP_DRIFT * (0.5 + Math.random() * 0.5);
      this.tickets.push({
        view,
        phase: 'wait',
        age: 0,
        delay: i * STAGGER,
        vel: new THREE.Vector3(Math.cos(dir) * drift, Math.sin(dir) * drift, POP_UP * (0.9 + Math.random() * 0.2)),
        spinAxis: new THREE.Vector3(1, Math.random() - 0.5, (Math.random() - 0.5) * 0.6).normalize(),
        spin: 11 + Math.random() * 4,
        yaw: (Math.random() - 0.5) * 0.9,
        bounces: 0,
        fly: null,
        // 獎圈只跳一個（第一張抵達時）
        onArrive: i === 0 ? () => this.arrive(count) : null,
      });
    }
    this.pass.enabled = true;
  }

  update(dt: number): void {
    if (this.tickets.length === 0 && this.flashes.length === 0) {
      this.pass.enabled = false;
      return;
    }
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      if (this.step(this.tickets[i], dt)) continue;
      this.tickets[i].view.dispose();
      this.tickets.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const t = Math.min(1, f.age / FLASH_TIME);
      const e = 1 - (1 - t) ** 3;
      f.view.ring.scale.setScalar(1 + e * (FLASH_RADIUS - 1));
      f.view.ring.material.opacity = 1 - t;
      f.view.disc.scale.setScalar(FLASH_RADIUS * (0.4 + 0.6 * e));
      f.view.disc.material.opacity = 0.9 * (1 - t);
      if (t < 1) continue;
      f.view.dispose();
      this.flashes.splice(i, 1);
    }
  }

  /** 推進一張券；回傳 false = 結束（移除） */
  private step(t: FlyingTicket, dt: number): boolean {
    const root = t.view.root;
    t.age += dt;
    if (t.phase === 'wait') {
      t.delay -= dt;
      if (t.delay > 0) return true;
      t.phase = 'air';
      t.age = 0;
      root.visible = true;
    }
    // 掃光：每 1.4 秒掃一次
    t.view.face.uniforms.sweep.value = ((t.age * 1.1) % 1.6) - 0.3;

    if (t.phase === 'air') {
      root.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, t.age / POP_TIME))));
      t.view.glow.material.opacity = 0.55 + 0.45 * Math.max(0, 1 - t.age / 0.3);
      t.vel.z += GRAVITY * dt;
      root.position.addScaledVector(t.vel, dt);
      root.quaternion.premultiply(tmpQ.setFromAxisAngle(t.spinAxis, t.spin * dt));
      // 第一次落地後慢慢翻正
      if (t.bounces > 0) root.quaternion.slerp(flatQ.setFromAxisAngle(Z, t.yaw), 1 - Math.exp(-10 * dt));
      if (root.position.z <= TICKET_REST_Z && t.vel.z < 0) {
        root.position.z = TICKET_REST_Z;
        if (t.bounces === 0) this.land(root.position);
        t.bounces++;
        t.vel.z = -t.vel.z * RESTITUTION;
        t.vel.x *= 0.5;
        t.vel.y *= 0.5;
        t.spin *= 0.35;
        if (t.vel.z < MIN_BOUNCE || t.bounces >= 3) {
          t.phase = 'rest';
          t.age = 0;
          t.vel.set(0, 0, 0);
        }
      }
      return true;
    }

    if (t.phase === 'rest') {
      root.quaternion.slerp(flatQ.setFromAxisAngle(Z, t.yaw), 1 - Math.exp(-16 * dt));
      t.view.glow.material.opacity = 0.55 + 0.15 * Math.sin(t.age * 12);
      if (t.age >= REST_TIME) this.startFly(t);
      return true;
    }

    // fly
    const f = t.fly!;
    f.t = Math.min(1, f.t + dt / f.dur);
    // 越飛越快（同金幣 MoveTo 的感覺），路徑往上拱
    const e = f.t * f.t;
    root.position.lerpVectors(f.from, f.to, e);
    root.position.z += FLY_ARC * Math.sin(Math.PI * e);
    // 轉成面向鏡頭（物件跟相機同朝向 = 正面朝鏡頭），略為傾斜
    tmpQ.copy(this.ctx.stage.camera.quaternion).multiply(flatQ.setFromAxisAngle(Z, -0.25 + 0.5 * e));
    root.quaternion.slerpQuaternions(f.q0, tmpQ, smooth(Math.min(1, f.t / 0.45)));
    // 透視補償：看起來跟在地上時差不多大，抵達前縮小
    const ppu = this.ctx.stage.pixelsPerUnit(root.position);
    root.scale.setScalar((f.ppu0 / ppu) * (1 - (1 - FLY_END_SCALE) * e));
    t.view.glow.material.opacity = 0.7;
    if (f.t < 1) return true;
    t.onArrive?.();
    return false;
  }

  private startFly(t: FlyingTicket): void {
    const { stage, services } = this.ctx;
    const seats = services.get(Tokens.SeatSystem);
    const seat = seats.seatAnchor(seats.yourSeat);
    const from = t.view.root.position.clone();
    // 終點：座位錨點投到地面（砲台腳下）
    const to = this.groundAt(seat.x, seat.y).setZ(TICKET_REST_Z);
    const d = stage.worldToDesign(from);
    const dur = Math.min(FLY_MAX, Math.max(FLY_MIN, Math.hypot(seat.x - d.x, seat.y - d.y) / FLY_SPEED));
    t.fly = { from, to, dur, t: 0, q0: t.view.root.quaternion.clone(), ppu0: stage.pixelsPerUnit(from) };
    t.phase = 'fly';
    t.age = 0;
  }

  /** 第一次落地：地面金光 + 音效 */
  private land(pos: THREE.Vector3): void {
    const view = createGroundFlash();
    view.root.position.set(pos.x, pos.y, 0.05);
    this.scene.add(view.root);
    this.flashes.push({ view, age: 0 });
    this.ctx.audio.play(Sound.DROP_ITEM);
  }

  /** 抵達座位：金色獎圈 + 抽卡按鈕跳一下 */
  private arrive(count: number): void {
    const { services } = this.ctx;
    const seat = services.get(Tokens.SeatSystem).yourSeat;
    // Small = 金框（Middle 是灰石框、Big 會震鏡頭）
    services.get(Tokens.RewardSystem).winCircles.show(seat, {
      type: WinCircleType.Small,
      money: count,
      label: `x${count}`,
      fishImage: '',
      image: ticketIconFrame(),
      isSelf: true,
    });
    this.target.classList.remove('ugc-pulse');
    // 重新觸發動畫
    void this.target.offsetWidth;
    this.target.classList.add('ugc-pulse');
  }

  /** 設計座標 → 地面世界座標（射線碰不到地面就取射線上一點） */
  private groundAt(dx: number, dy: number): THREE.Vector3 {
    const hit = this.ctx.stage.designToGround(dx, dy);
    if (hit) return hit;
    const cam = this.ctx.stage.camera;
    return new THREE.Vector3(((dx / this.ctx.stage.designWidth) * 2 - 1), (dy / this.ctx.stage.designHeight) * 2 - 1, 0.5)
      .unproject(cam)
      .sub(cam.position)
      .normalize()
      .multiplyScalar(80)
      .add(cam.position);
  }
}
