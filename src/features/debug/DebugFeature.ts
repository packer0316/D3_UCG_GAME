/**
 * Debug 面板（按 ` 鍵開關）— 對照原版 TMDCommon 共用測試模組：
 *   A「出獎模式開關」（TestCheatModeContent）：按鈕顯示目前狀態，送 DEBUG_U2G_CLIENT_TOOL_USE_REQ toolType 1
 *   B「召喚腳本魚」（TestSummonContent / TestSummonUI）：篩選框 + 「<groupId>-<名稱>」列表，送 toolType 2
 *   C「切換場景」（CommonTestContent:TestChangeSceneType）：下拉選單選場景，送 toolType 100 由 server 換場景（SPEC §15.5）
 *     召喚列表中限定其他場景的魚（風神翼龍 / 蒼龍只在空中(黃昏)）反灰
 *   D「相機」：切換相機預設（CameraDefine，經 CameraControl）、即時調整 FOV / 位置 / 角度、複製設定；
 *     換場景時相機會依場景自動切換（SPEC §16.4），面板跟著 camera:change 同步
 *   E「UGC」：加抽卡券（張數可手動輸入，預設 50）、解鎖全部魚卡 / 場景 / 裝飾物、重置存檔（SPEC-UGC §10，toolType 200–202）
 * 面板是可拖曳的小視窗：拖標題列移動、右上鈕（或雙擊標題列）縮小 / 還原，位置與狀態記在 localStorage。
 * 只透過 GameContext / NetClient 存取遊戲（Feature 擴充機制的範例）。
 */
import type { GameFeature } from '@core/feature/Feature';
import { RAD2DEG } from '@core/math/cocos';
import type { CameraSetting } from '@engine/stage/Stage';
import type { GameContext } from '@game/GameContext';
import { Tokens } from '@game/Tokens';
import { isFishSupported } from '@game/define/FishDefine';
import { WALL_POLYGON } from '@game/define/DisplayDefine';
import { SCENE_DEFINES, SCENE_LIST, SceneType, sceneLimitLabel } from '@game/define/SceneDefine';
import { CAMERA_PRESETS } from '@game/define/CameraDefine';
import type { Fish } from '@game/world/Fish';
import { DebugErrorCode, DebugToolType } from '@net/protocol';
import { UgcDebugTool } from '@game/ugc/UgcProtocol';
import type { FakeServer } from '@server-fake/FakeServer';
import { buildSummonList, type SummonEntry } from './SummonList';
import './debug.css';

/** 相機欄位 → CameraSetting 對應 */
const CAM_FIELDS: Record<string, (c: CameraSetting, v?: number) => number> = {
  fov: (c, v) => (v === undefined ? c.fov : (c.fov = v)),
  px: (c, v) => (v === undefined ? c.position.x : (c.position.x = v)),
  py: (c, v) => (v === undefined ? c.position.y : (c.position.y = v)),
  pz: (c, v) => (v === undefined ? c.position.z : (c.position.z = v)),
  rx: (c, v) => (v === undefined ? c.rotation.x : (c.rotation.x = v)),
  ry: (c, v) => (v === undefined ? c.rotation.y : (c.rotation.y = v)),
  rz: (c, v) => (v === undefined ? c.rotation.z : (c.rotation.z = v)),
};

const cloneCam = (c: CameraSetting): CameraSetting => ({ ...c, position: { ...c.position }, rotation: { ...c.rotation } });
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 視窗位置 / 縮小狀態（每台瀏覽器各自記） */
const DEBUG_WINDOW_KEY = 'd3.debug.window';
/** 加抽卡券：預設張數 / 上限 */
const TICKET_DEFAULT = 50;
const TICKET_MAX = 99999;

export class DebugFeature implements GameFeature<GameContext> {
  readonly id = 'debug';
  private ctx!: GameContext;
  private cheatBtn!: HTMLButtonElement;
  private sceneSelect!: HTMLSelectElement;
  private scenePending = false;
  private menu!: HTMLDivElement;
  private list!: HTMLDivElement;
  private filter!: HTMLInputElement;
  private cheatOn = false;
  private cheatPending = false;
  private entries: SummonEntry[] = [];
  private camPresets!: HTMLDivElement;
  private camInputs: HTMLInputElement[] = [];
  private cam!: CameraSetting;
  private panel!: HTMLDivElement;
  private minimized = false;
  private ticketInput!: HTMLInputElement;
  /** 最後一次送出的加券張數（ACK 不帶張數，toast 用） */
  private ticketAdded = 0;

  install(ctx: GameContext): void {
    this.ctx = ctx;
    this.entries = buildSummonList(ctx.data.groups, ctx.data.fishData, isFishSupported);

    const p = document.createElement('div');
    p.className = 'debug-panel ui-interactive';
    p.innerHTML = `
      <div class="debug-titlebar">
        <div class="debug-title">DEBUG <small>(\` 鍵開關)</small></div>
        <button class="debug-win-btn" data-act="win-min"></button>
      </div>
      <div class="debug-body">
      <button class="dbg-btn dbg-cheat" data-act="cheat"></button>
      <label class="dbg-scene">場景<select></select></label>
      <button class="dbg-btn dbg-summon" data-act="summon">召喚魚 ▾</button>
      <div class="dbg-menu hidden">
        <div class="dbg-filter">
          <input type="text" placeholder="篩選關鍵字" />
          <button data-act="clear" title="清除">X</button>
        </div>
        <div class="dbg-list"></div>
      </div>
      <div class="dbg-section">相機</div>
      <div class="dbg-cam-presets"></div>
      <div class="dbg-cam-grid">
        <span>FOV</span><input type="number" step="1" data-cam="fov" />
        <span></span><span></span>
        <span>位置</span><input type="number" step="1" data-cam="px" /><input type="number" step="1" data-cam="py" /><input type="number" step="1" data-cam="pz" />
        <span>角度</span><input type="number" step="1" data-cam="rx" /><input type="number" step="1" data-cam="ry" /><input type="number" step="1" data-cam="rz" />
      </div>
      <button class="dbg-btn" data-act="cam-copy">複製設定</button>
      <div class="dbg-section">UGC</div>
      <div class="dbg-ticket">
        <span>抽卡券</span>
        <input type="number" min="1" max="${TICKET_MAX}" step="1" value="${TICKET_DEFAULT}" />
        <button class="dbg-cam-preset" data-act="ugc-tickets">增加</button>
      </div>
      <div class="dbg-cam-presets">
        <button class="dbg-cam-preset" data-act="ugc-unlock">解鎖全部</button>
        <button class="dbg-cam-preset" data-act="ugc-reset">重置存檔</button>
      </div>
      </div>`;
    ctx.ui.layers.popup.appendChild(p);
    this.panel = p;
    this.cheatBtn = p.querySelector('.dbg-cheat')!;
    this.sceneSelect = p.querySelector('.dbg-scene select')!;
    this.sceneSelect.innerHTML =
      '<option value="-1" disabled hidden>—</option>' +
      SCENE_LIST.map((t) => `<option value="${t}">${SCENE_DEFINES[t].name} (${t})</option>`).join('');
    this.sceneSelect.addEventListener('change', () => this.requestScene(Number(this.sceneSelect.value)));
    this.menu = p.querySelector('.dbg-menu')!;
    this.list = p.querySelector('.dbg-list')!;
    this.filter = p.querySelector('.dbg-filter input')!;
    this.camPresets = p.querySelector('.dbg-cam-presets')!;
    this.camInputs = [...p.querySelectorAll<HTMLInputElement>('[data-cam]')];
    this.ticketInput = p.querySelector('.dbg-ticket input')!;
    this.ticketInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addTickets();
    });
    this.ticketInput.addEventListener('change', () => this.readTicketCount());
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.addEventListener('click', (e) => this.onClick(e));
    this.filter.addEventListener('input', () => this.renderList());
    for (const input of this.camInputs) input.addEventListener('input', () => this.onCamInput(input));
    window.addEventListener('keydown', (e) => {
      if (e.key !== '`' || document.activeElement instanceof HTMLInputElement) return;
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden')) this.clampWindow();
    });
    this.setupWindow();

    ctx.net.on('G2U_DEBUG_CLIENT_TOOL_USE_ACK', (ack) => this.onAck(ack));
    // 進房 / 換場景：同步選單、召喚列表的場景限制
    ctx.events.on('scene:change', () => {
      this.renderScene();
      this.renderList();
    });
    // 相機預設改變（場景自動切換 / 預設按鈕）：欄位與按鈕高亮跟著換
    ctx.events.on('camera:change', ({ preset }) => {
      const p = CAMERA_PRESETS[preset];
      if (!p) return;
      this.cam = cloneCam(p.setting);
      this.renderCamera();
    });
    this.renderCheat();
    this.renderScene();
    this.renderList();
    this.cam = this.readStageCamera();
    this.renderCamera();
    this.exposeConsoleHelpers();
  }

  // ------------------------------------------------------------------

  private send(toolType: number, target: number): void {
    this.ctx.net.send('U2G_DEBUG_CLIENT_TOOL_USE_REQ', { toolType, target, quantity: 0 });
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = el?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'cheat':
        if (this.cheatPending) return;
        this.cheatPending = true;
        this.renderCheat();
        this.send(DebugToolType.CheatMode, this.cheatOn ? 0 : 1);
        break;
      case 'summon':
        this.menu.classList.toggle('hidden');
        if (!this.menu.classList.contains('hidden')) this.filter.focus();
        break;
      case 'clear':
        this.filter.value = '';
        this.renderList();
        break;
      case 'row': {
        const id = Number(el!.dataset.gid);
        if (el!.classList.contains('disabled')) {
          const entry = this.entries.find((x) => x.groupId === id);
          const limit = el!.dataset.limit;
          this.ctx.ui.toast(`${entry?.label ?? id}：${limit ? `只能在「${limit}」場景召喚` : '本版尚未支援此魚種'}`);
          return;
        }
        this.send(DebugToolType.Summon, id);
        break;
      }
      case 'cam-preset':
        this.applyCameraPreset(Number(el!.dataset.idx));
        break;
      case 'cam-copy':
        this.copyCamera();
        break;
      case 'win-min':
        this.setMinimized(!this.minimized);
        break;
      case 'ugc-tickets':
        this.addTickets();
        break;
      case 'ugc-unlock':
        this.sendUgc(UgcDebugTool.UnlockAll);
        break;
      case 'ugc-reset':
        if (window.confirm('確定要重置存檔？魚卡、場景、裝潢、金幣都會回到初始狀態。')) this.sendUgc(UgcDebugTool.ResetProfile);
        break;
    }
  }

  /** UGC 測試工具（假 server DebugModule） */
  private sendUgc(toolType: number, quantity = 0): void {
    this.ctx.net.send('U2G_DEBUG_CLIENT_TOOL_USE_REQ', { toolType, target: 0, quantity });
  }

  /** 欄位張數：取整數並夾在 1–TICKET_MAX，空白 / 非數字回到預設；把修正後的值寫回欄位 */
  private readTicketCount(): number {
    const v = Math.floor(this.ticketInput.valueAsNumber);
    const n = Number.isFinite(v) ? Math.min(Math.max(v, 1), TICKET_MAX) : TICKET_DEFAULT;
    this.ticketInput.value = String(n);
    return n;
  }

  private addTickets(n = this.readTicketCount()): void {
    this.ticketAdded = n;
    this.sendUgc(UgcDebugTool.AddTickets, n);
  }

  // ------------------------------------------------------------------
  // 視窗：標題列拖曳、縮小 / 還原（位置與縮小狀態記在 localStorage）
  // ------------------------------------------------------------------

  private setupWindow(): void {
    const p = this.panel;
    const bar = p.querySelector<HTMLElement>('.debug-titlebar')!;
    const onButton = (e: Event) => (e.target as HTMLElement).closest('button') !== null;
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;

    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || onButton(e)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: p.offsetLeft, top: p.offsetTop };
      bar.setPointerCapture(e.pointerId);
      p.classList.add('dragging');
    });
    bar.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // 面板在 UI 設計座標層（依 designScale 縮放）裡：螢幕位移要換回設計座標
      const s = this.ctx.stage.designScale || 1;
      this.moveWindow(drag.left + (e.clientX - drag.x) / s, drag.top + (e.clientY - drag.y) / s);
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      p.classList.remove('dragging');
      this.saveWindow();
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    // 雙擊標題列 = 縮小 / 還原
    bar.addEventListener('dblclick', (e) => {
      if (!onButton(e)) this.setMinimized(!this.minimized);
    });
    this.ctx.ui.onResize(() => this.clampWindow());

    const saved = this.loadWindow();
    if (saved) this.moveWindow(saved.x, saved.y);
    this.setMinimized(saved?.min ?? false, false);
  }

  private setMinimized(min: boolean, save = true): void {
    this.minimized = min;
    this.panel.classList.toggle('min', min);
    const btn = this.panel.querySelector<HTMLButtonElement>('.debug-win-btn')!;
    btn.textContent = min ? '□' : '—';
    btn.title = min ? '還原' : '縮小';
    this.clampWindow();
    if (save) this.saveWindow();
  }

  /** 移動並把整個視窗夾在畫面內（比畫面高時貼齊上緣，標題列永遠看得到）；還原時也會往回推 */
  private moveWindow(x: number, y: number): void {
    const p = this.panel;
    const maxX = Math.max(0, this.ctx.ui.width - p.offsetWidth);
    const maxY = Math.max(0, this.ctx.ui.height - p.offsetHeight);
    p.style.left = `${Math.round(Math.min(Math.max(x, 0), maxX))}px`;
    p.style.top = `${Math.round(Math.min(Math.max(y, 0), maxY))}px`;
  }

  private clampWindow(): void {
    if (!this.panel.classList.contains('hidden')) this.moveWindow(this.panel.offsetLeft, this.panel.offsetTop);
  }

  private loadWindow(): { x: number; y: number; min: boolean } | null {
    try {
      const v = JSON.parse(localStorage.getItem(DEBUG_WINDOW_KEY) ?? 'null');
      return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y, min: !!v.min } : null;
    } catch {
      return null;
    }
  }

  private saveWindow(): void {
    try {
      const p = this.panel;
      localStorage.setItem(DEBUG_WINDOW_KEY, JSON.stringify({ x: p.offsetLeft, y: p.offsetTop, min: this.minimized }));
    } catch {
      // 無痕 / 封鎖儲存：不記也能用
    }
  }

  private onAck(ack: { toolType: number; errorCode: number; target: number }): void {
    const ok = ack.errorCode === DebugErrorCode.Success;
    if (ack.toolType === DebugToolType.CheatMode) {
      this.cheatPending = false;
      if (ok) this.cheatOn = ack.target === 1;
      this.renderCheat();
      this.ctx.ui.toast(ok ? `出獎模式：${this.cheatOn ? '開啟' : '關閉'}` : '出獎模式切換失敗');
    } else if (ack.toolType === DebugToolType.Summon) {
      const entry = this.entries.find((e) => e.groupId === ack.target);
      this.ctx.ui.toast(`${ok ? '已召喚' : '召喚失敗'}：${entry?.label ?? ack.target}`);
    } else if (ack.toolType === UgcDebugTool.AddTickets) {
      this.ctx.ui.toast(ok ? `抽卡券 +${this.ticketAdded}` : '加券失敗');
    } else if (ack.toolType === UgcDebugTool.UnlockAll) {
      this.ctx.ui.toast(ok ? '已解鎖全部魚卡 / 場景 / 裝飾物（每張卡碎片 +5）' : '解鎖失敗');
    } else if (ack.toolType === UgcDebugTool.ResetProfile) {
      this.ctx.ui.toast(ok ? '存檔已重置' : '重置失敗');
    } else if (ack.toolType === DebugToolType.ChangeScene) {
      this.scenePending = false;
      this.renderScene();
      const name = SCENE_DEFINES[ack.target]?.name ?? ack.target;
      this.ctx.ui.toast(ok ? `切換場景：${name}` : `切換場景失敗：${name}`);
    }
  }

  private renderCheat(): void {
    const b = this.cheatBtn;
    b.textContent = this.cheatPending ? '出獎模式：切換中…' : `出獎模式：${this.cheatOn ? '開啟' : '關閉'}`;
    b.classList.toggle('on', this.cheatOn);
  }

  private get sceneType(): number {
    return this.ctx.services.tryGet(Tokens.SceneSystem)?.sceneType ?? SceneType.NONE;
  }

  /** 原版 TestChangeSceneType → 本版改送 server（toolType 100），server 送 G2U_CHANGE_SCENE_NOTIFY 後才真的換 */
  private requestScene(sceneType: number): boolean {
    if (this.scenePending || !SCENE_DEFINES[sceneType] || sceneType === this.sceneType) {
      this.renderScene();
      return false;
    }
    this.scenePending = true;
    this.renderScene();
    this.send(DebugToolType.ChangeScene, sceneType);
    return true;
  }

  private renderScene(): void {
    const sel = this.sceneSelect;
    sel.value = String(SCENE_DEFINES[this.sceneType] ? this.sceneType : SceneType.NONE);
    sel.disabled = this.scenePending;
  }

  /** 原版 TestSummonUI：不分大小寫子字串篩選整列文字 */
  private renderList(): void {
    const key = this.filter.value.trim().toLowerCase();
    const scene = this.sceneType;
    const rows = this.entries.filter((e) => !key || e.label.toLowerCase().includes(key));
    this.list.innerHTML = rows
      .map((e) => {
        // 場景限定（SPEC §15.4）：不在允許場景 → 反灰「限 xxx」
        const limit = e.supported ? sceneLimitLabel(e.fishTypes, scene) : null;
        const disabled = !e.supported || limit !== null;
        const tag = !e.supported ? '未支援' : limit ? `限 ${limit}` : '';
        return `<div class="dbg-row${disabled ? ' disabled' : ''}${e.original ? '' : ' extra'}" data-act="row" data-gid="${e.groupId}"${
          limit ? ` data-limit="${limit}"` : ''
        }>${e.label}${tag ? `<span class="dbg-tag">${tag}</span>` : ''}</div>`;
      })
      .join('');
  }

  // ------------------------------------------------------------------
  // 相機
  // ------------------------------------------------------------------

  /** 目前舞台相機 → CameraSetting（Cocos 角度：three Euler ZYX，z 取負） */
  private readStageCamera(): CameraSetting {
    const cam = this.ctx.stage.camera;
    const p = this.ctx.stage.cameraHome;
    const r = cam.rotation;
    return {
      fov: round3(cam.fov),
      near: cam.near,
      far: cam.far,
      position: { x: round3(p.x), y: round3(p.y), z: round3(p.z) },
      rotation: { x: round3(r.x * RAD2DEG), y: round3(r.y * RAD2DEG), z: round3(-r.z * RAD2DEG) || 0 },
    };
  }

  /** 相機 + 子彈牆一起換（CameraControl）；面板由 camera:change 同步 */
  private applyCameraPreset(idx: number): boolean {
    if (!this.ctx.services.get(Tokens.CameraControl).applyPreset(idx)) return false;
    this.ctx.ui.toast(`相機：${CAMERA_PRESETS[idx].name}`);
    return true;
  }

  /** 手動微調：只換相機，牆沿用目前預設的 */
  private onCamInput(input: HTMLInputElement): void {
    const v = input.valueAsNumber;
    if (!Number.isFinite(v)) return;
    CAM_FIELDS[input.dataset.cam!](this.cam, v);
    this.ctx.services.get(Tokens.CameraControl).applyCustom(cloneCam(this.cam));
    this.renderCameraPresets();
  }

  private currentPresetIndex(): number {
    const keys = Object.keys(CAM_FIELDS);
    return CAMERA_PRESETS.findIndex((p) => keys.every((k) => CAM_FIELDS[k](p.setting) === CAM_FIELDS[k](this.cam)));
  }

  private renderCamera(): void {
    for (const input of this.camInputs) input.value = String(CAM_FIELDS[input.dataset.cam!](this.cam));
    this.renderCameraPresets();
  }

  private renderCameraPresets(): void {
    const cur = this.currentPresetIndex();
    this.camPresets.innerHTML =
      CAMERA_PRESETS.map(
        (p, i) => `<button class="dbg-cam-preset${i === cur ? ' on' : ''}" data-act="cam-preset" data-idx="${i}">${p.name}</button>`,
      ).join('') + (cur < 0 ? '<span class="dbg-tag">自訂</span>' : '');
  }

  /** 複製成 CAMERA_PRESETS 的一筆（貼到 game/define/CameraDefine.ts 即可新增預設） */
  private copyCamera(): void {
    const c = this.cam;
    const wall = this.ctx.services.get(Tokens.PlayField).wall;
    const n = CAMERA_PRESETS.length + 1;
    const v3 = (v: { x: number; y: number; z: number }) => `{ x: ${v.x}, y: ${v.y}, z: ${v.z} }`;
    const text = [
      '  {',
      `    name: '第${CN_NUM[n - 1] ?? n}種',`,
      '    setting: {',
      `      fov: ${c.fov},`,
      `      near: ${c.near},`,
      `      far: ${c.far},`,
      `      position: ${v3(c.position)},`,
      `      rotation: ${v3(c.rotation)},`,
      '    },',
      ...(wall === WALL_POLYGON ? [] : ['    wall: [', ...wall.map((p) => `      { x: ${p.x}, y: ${p.y} },`), '    ],']),
      '  },',
    ].join('\n');
    console.log(text);
    navigator.clipboard?.writeText(text).then(
      () => this.ctx.ui.toast('相機設定已複製'),
      () => this.ctx.ui.toast('複製失敗，已輸出到 console'),
    ) ?? this.ctx.ui.toast('已輸出到 console');
  }

  // ------------------------------------------------------------------

  /** console / 自動化測試用 */
  private exposeConsoleHelpers(): void {
    const ctx = this.ctx;
    (window as unknown as { __debug: unknown }).__debug = {
      ctx,
      tokens: Tokens,
      get server() {
        return ctx.services.tryGet(Tokens.FakeServer);
      },
      get fish() {
        return ctx.services.get(Tokens.FishSystem);
      },
      cheat: (on: boolean) => this.send(DebugToolType.CheatMode, on ? 1 : 0),
      summon: (groupId: number) => this.send(DebugToolType.Summon, groupId),
      /** 換場景（同下拉選單；0 森林、1 沙漠、2 雪地、15 空中(黃昏)、6 監獄、4 墓地） */
      scene: (sceneType: number) => this.requestScene(sceneType),
      /** UGC：加抽卡券 / 解鎖全部 / 重置存檔 */
      tickets: (n = TICKET_DEFAULT) => this.addTickets(n),
      unlockAll: () => this.sendUgc(UgcDebugTool.UnlockAll),
      resetProfile: () => this.sendUgc(UgcDebugTool.ResetProfile),
      /** 切換相機預設（0 = 第一種、1 = 第二種；換場景時會再依場景自動切換） */
      camera: (idx: number) => this.applyCameraPreset(idx),
      /** 對場上第一隻符合條件的魚模擬一則 server 擊殺通知 */
      kill: (fishType: number, showType: number, unDead = false, odds = 100) => {
        const fs = ctx.services.get(Tokens.FishSystem) as unknown as { alive: Map<number, Fish> };
        const target = [...fs.alive.values()].find((f) => f.type === fishType && f.hittable);
        const s = ctx.services.tryGet(Tokens.FakeServer) as FakeServer | undefined;
        if (!target || !s) return false;
        const bet = 500;
        const money = bet * odds;
        s.room.addMoney(money);
        s.send('G2U_KILL_FLOATODDS_FISH_NOTIFY', {
          accountId: 1,
          scriptIdData: { groupIndex: target.groupIndex, fishIndex: target.fishIndex },
          fishType,
          showType,
          money,
          seatIndex: s.room.yourSeat,
          seatMoney: s.room.self.money,
          bet,
          floatedOdds: odds,
          floatedRate: 1,
          unDead,
          killIndex: 0,
        });
        return true;
      },
    };
  }
}
