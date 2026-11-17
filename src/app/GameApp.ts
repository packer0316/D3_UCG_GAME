/**
 * 組裝層（composition root）：建立引擎、通訊、系統、UI、功能，並驅動主迴圈。
 *
 * 啟動流程：
 *   1. Stage / Assets / EFK / Audio
 *   2. 資料（PathData / GroupData / FishData）
 *   3. 通訊：LocalTransport + FakeServer（之後換 WebSocketTransport）
 *   4. 系統（Seat / Fish / Shooting / Reward）+ HUD + Features
 *   5. 預載資源 → 登入 → 進房同步腳本 → 主迴圈
 */
import * as THREE from 'three';
import { EventBus } from '@core/events/EventBus';
import { FeatureManager } from '@core/feature/Feature';
import { ServiceRegistry } from '@core/services/ServiceRegistry';
import { ActionManager } from '@core/tween/ActionManager';
import { AssetManager } from '@engine/assets/AssetManager';
import { AudioManager } from '@engine/audio/AudioManager';
import { EfkSystem } from '@engine/effekseer/EfkSystem';
import { Stage } from '@engine/stage/Stage';
import { NetClient } from '@net/NetClient';
import type { Transport } from '@net/Transport';
import type { GameContext, GameEvents, GameLayers } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { DESIGN_HEIGHT, FIXED_3D_CAMERA } from '@game/define/DisplayDefine';
import { FISH_DEFINES } from '@game/define/FishDefine';
import { SceneType } from '@game/define/SceneDefine';
import { Sound } from '@game/define/SoundDefine';
import { PathLibrary } from '@game/path/PathTrack';
import type { FishDataFile, GroupDataMap, PathDataMap } from '@game/path/PathTypes';
import { FishSystem } from '@game/systems/FishSystem';
import { RewardSystem } from '@game/systems/RewardSystem';
import { SeatSystem } from '@game/systems/SeatSystem';
import { ShootingSystem } from '@game/systems/ShootingSystem';
import { KillShowRegistry } from '@game/show/KillShowRegistry';
import { BGScene } from '@game/world/BGScene';
import { CameraShake } from '@game/world/CameraShake';
import { FishClassRegistry } from '@game/world/FishClassRegistry';
import { TRexFish } from '@game/world/TRexFish';
import { FakeServer } from '@server-fake/FakeServer';
import { createLocalTransportPair } from '@server-fake/LocalTransport';
import { Hud, HUD_PLISTS } from '@ui/Hud';
import { UIRoot } from '@ui/UIRoot';
import { SkillPanel } from '@ui/SkillPanel';
import { CsdLibrary } from '@engine/csd/CsdPlayer';
import { PointerRouter } from '@engine/input/PointerRouter';
import { BulletBehaviorRegistry } from '@game/bullet/BulletTypes';
import { SkillSystem } from '@game/systems/SkillSystem';
import { LockSystem } from '@game/systems/LockSystem';
import { createFeatures } from './features';

export interface LoadingView {
  progress(p: number, text?: string): void;
  done(): void;
  error(msg: string): void;
}

export class GameApp {
  private ctx!: GameContext;
  private features!: FeatureManager<GameContext>;
  private fishSystem!: FishSystem;
  private shooting!: ShootingSystem;
  private reward!: RewardSystem;
  private skills!: SkillSystem;
  private lock!: LockSystem;
  private skillPanel!: SkillPanel;
  private bg!: BGScene;
  private lastTime = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly loading: LoadingView,
  ) {}

  async start(): Promise<void> {
    // three.js 設定：Z 朝上（Cocos 世界）、不做色彩管理
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    THREE.ColorManagement.enabled = false;

    // ---- 1. 引擎
    const stage = new Stage({ container: this.container, designHeight: DESIGN_HEIGHT, camera: FIXED_3D_CAMERA });
    const assets = new AssetManager();
    const efk = new EfkSystem(stage, (p) => assets.url(p));
    const audio = new AudioManager((p) => assets.url(p));
    const actions = new ActionManager();
    const events = new EventBus<GameEvents>();
    const services = new ServiceRegistry();

    const layers: GameLayers = {
      bg: new THREE.Group(),
      fish: new THREE.Group(),
      bullet: new THREE.Group(),
      cannon: new THREE.Group(),
      reward: new THREE.Group(),
      hitFx: new THREE.Group(),
      ui: new THREE.Group(),
    };
    for (const [k, g] of Object.entries(layers)) g.name = `layer_${k}`;
    stage.scene.add(layers.bg, layers.fish, layers.bullet, layers.cannon);
    stage.overlay.add(layers.hitFx, layers.reward, layers.ui);
    const csd = new CsdLibrary(assets);
    const input = new PointerRouter(stage);

    // ---- 2. 資料
    this.loading.progress(0.02, '載入資料…');
    const [paths, groups, fishData] = await Promise.all([
      assets.json<PathDataMap>('Data/PathData.json'),
      assets.json<GroupDataMap>('Data/GroupData.json'),
      assets.json<FishDataFile>('Data/FishData.json'),
    ]);

    // ---- 3. 通訊（假 server）
    const { client, server } = createLocalTransportPair();
    const fakeServer = new FakeServer(server, { groups, fishData });
    services.register(Tokens.FakeServer, fakeServer);
    const net = new NetClient(client as Transport);

    // ---- 4. Context / 系統
    const ui = new UIRoot(this.container, stage, assets);
    const registries = {
      fishClass: new FishClassRegistry(),
      killShow: new KillShowRegistry(),
      bullet: new BulletBehaviorRegistry(),
    };
    registries.fishClass.register('trex', TRexFish);
    this.ctx = {
      events,
      services,
      actions,
      stage,
      assets,
      csd,
      input,
      efk,
      audio,
      net,
      layers,
      data: { paths: new PathLibrary(paths), groups, fishData },
      registries,
      ui,
    };

    const seat = new SeatSystem(this.ctx);
    this.fishSystem = new FishSystem(this.ctx);
    this.skills = new SkillSystem(this.ctx);
    this.lock = new LockSystem(this.ctx);
    this.shooting = new ShootingSystem(this.ctx);
    this.reward = new RewardSystem(this.ctx);
    this.skillPanel = new SkillPanel(this.ctx);
    const shake = new CameraShake(stage, actions);
    services.register(Tokens.SeatSystem, seat);
    services.register(Tokens.SkillSystem, this.skills);
    services.register(Tokens.LockSystem, this.lock);
    services.register(Tokens.FishSystem, this.fishSystem);
    services.register(Tokens.ShootingSystem, this.shooting);
    services.register(Tokens.RewardSystem, this.reward);
    services.register(Tokens.CameraShake, shake);
    this.shooting.setHitFx(this.reward.hitFx);
    events.on('camera:shake', ({ times, delta }) => shake.shake(times, delta));
    this.bg = new BGScene(assets, layers.bg);

    // ---- 5. 預載
    let done = 0;
    const tasks: [string, () => Promise<unknown>][] = [
      ['特效', () => efk.init()],
      ['場景', () => this.bg.load(SceneType.Snow).then((d) => (this.fishSystem.shadowColor = d.shadowColor))],
      ['龍', () => this.fishSystem.preload(FISH_DEFINES.map((d) => d.type))],
      ['獎勵', () => this.reward.preload()],
      ['技能', () => Promise.all([this.skillPanel.preload(), this.lock.preload()])],
      ['介面', () => Promise.all(HUD_PLISTS.map((p) => assets.atlas(p)))],
      ['音效', () => Promise.all(Object.values(Sound).map((s) => audio.load(s)))],
    ];
    // 砲台的 EFK 需要 runtime 先初始化
    await tasks[0][1]();
    tasks.shift();
    tasks.push(['砲台', () => this.shooting.preload()]);
    await Promise.all(
      tasks.map(async ([name, fn]) => {
        try {
          await fn();
        } catch (err) {
          console.error(`[GameApp] preload ${name} failed`, err);
        }
        this.loading.progress(0.1 + (0.85 * ++done) / tasks.length, `載入${name}…`);
      }),
    );

    // ---- 6. 啟動系統 / UI / 功能
    seat.init();
    this.fishSystem.init();
    this.skills.init();
    this.lock.init();
    this.shooting.init();
    this.reward.init();
    new Hud(this.ctx, ui);
    this.skillPanel.init();
    this.features = new FeatureManager(this.ctx);
    await this.features.installAll(createFeatures());

    // ---- 7. 登入 → 進房同步
    events.once('room:ready', () => net.send('U2G_SYNC_SCRIPT_REQ', {}));
    net.send('U2G_LOGIN_REQ', {});
    await net.wait('G2U_SYNC_SCRIPT_ACK').catch((e) => console.error(e));
    void audio.playBgm(Sound.BGM_NORMAL);

    this.loading.done();
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const c = this.ctx;
    c.actions.update(dt);
    this.fishSystem.update(dt);
    this.shooting.update(dt);
    this.lock.update(dt);
    this.reward.update(dt);
    this.skillPanel.update(dt);
    this.features.update(dt);
    c.efk.update(dt);
    c.stage.render(dt);
  };

  get context(): GameContext {
    return this.ctx;
  }
}
