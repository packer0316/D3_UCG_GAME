/**
 * 玩家資產存檔（SPEC-UGC §3）：瀏覽器用 localStorage，測試用記憶體。
 * 資產有變動就 markDirty()，由 FakeServer 的 tick 節流寫入（最多每 2 秒一次），離開頁面時再寫一次。
 */
import { isFishAllowedInScene } from '@game/define/SceneDefine';
import { FISH_RARITY, SCENE_RARITY } from '@game/ugc/CardDefine';
import { getDecoDefine, validateDecoLayout } from '@game/ugc/DecoDefine';
import { createDefaultHome, validateSlots } from '@game/ugc/HomeRule';
import {
  INITIAL_MONEY,
  INITIAL_TICKETS,
  MAX_LEVEL,
  MY_ACCOUNT_ID,
  PROFILE_SAVE_INTERVAL_MS,
  PROFILE_STORAGE_KEY,
  STARTER_DECOS,
  STARTER_FISH,
  STARTER_SCENES,
} from '@game/ugc/UgcDefine';
import type { PlayerProfile } from '@game/ugc/UgcTypes';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 記憶體儲存（測試 / 瀏覽器不給用 localStorage 時） */
export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** 瀏覽器的 localStorage；拿不到（無痕 / 被封鎖 / 非瀏覽器）就用記憶體 */
export function defaultStorage(): KeyValueStorage {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (ls) {
      ls.getItem(PROFILE_STORAGE_KEY);
      return ls;
    }
  } catch {
    // 落到記憶體
  }
  return new MemoryStorage();
}

export function createInitialProfile(now: number): PlayerProfile {
  return {
    version: 1,
    accountId: MY_ACCOUNT_ID,
    name: 'Player',
    money: INITIAL_MONEY,
    tickets: INITIAL_TICKETS,
    fish: Object.fromEntries(STARTER_FISH.map((t) => [t, { level: 1, copies: 0 }])),
    scenes: [...STARTER_SCENES],
    decos: { ...STARTER_DECOS },
    home: createDefaultHome(now),
    stats: { draws: 0, ticketsEarned: 0 },
    createdAt: now,
  };
}

const num = (v: unknown, fallback: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback);

/**
 * 存檔內容整理成合法的 PlayerProfile：壞掉的欄位用初始值補；整份不能用回傳 null。
 * 規則改版後舊存檔可能不合法（例如 Boss 上限變小）→ 家園設定 / 裝潢不合法就重設那一部分。
 */
export function sanitizeProfile(raw: unknown, now: number): PlayerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PlayerProfile>;
  if (r.version !== 1) return null;
  const init = createInitialProfile(now);
  const p: PlayerProfile = {
    ...init,
    name: typeof r.name === 'string' && r.name ? r.name.slice(0, 16) : init.name,
    money: Math.floor(num(r.money, init.money)),
    tickets: Math.floor(num(r.tickets, init.tickets)),
    // 舊存檔沒有開張時間 → 當作現在建立（新玩家，SPEC-UGC §2.4）；未來時間夾回現在
    createdAt: Math.min(now, num(r.createdAt, now)),
  };
  // 魚卡：初始 11 種一定有
  if (r.fish && typeof r.fish === 'object') {
    for (const [k, v] of Object.entries(r.fish)) {
      const t = Number(k);
      if (!FISH_RARITY[t] || !v) continue;
      p.fish[t] = { level: Math.min(MAX_LEVEL, Math.floor(num(v.level, 1, 1))), copies: Math.floor(num(v.copies, 0)) };
    }
  }
  if (Array.isArray(r.scenes)) for (const s of r.scenes) if (SCENE_RARITY[s] && !p.scenes.includes(s)) p.scenes.push(s);
  if (r.decos && typeof r.decos === 'object') {
    p.decos = {};
    for (const [id, n] of Object.entries(r.decos)) if (getDecoDefine(id)) p.decos[id] = Math.floor(num(n, 0));
  }
  if (r.stats) p.stats = { draws: Math.floor(num(r.stats.draws, 0)), ticketsEarned: Math.floor(num(r.stats.ticketsEarned, 0)) };
  const h = r.home;
  if (h && typeof h === 'object') {
    p.home.pending = num(h.pending, 0);
    p.home.totalEarned = num(h.totalEarned, 0);
    p.home.lastAccrueAt = Math.min(now, num(h.lastAccrueAt, now));
    const ownedFish = (t: number) => !!p.fish[t];
    const ownedScene = (s: number) => p.scenes.includes(s);
    // 場景限定魚種改版（天空場景只能放 5 種龍）：舊存檔先拿掉該場景不能放的龍、空掉的格子移除，其餘設定保留
    const slots = Array.isArray(h.slots)
      ? h.slots
          .map((s) => (s && Array.isArray(s.fishTypes) ? { ...s, fishTypes: s.fishTypes.filter((t) => isFishAllowedInScene(t, s.sceneType)) } : s))
          .filter((s) => !s || !Array.isArray(s.fishTypes) || s.fishTypes.length > 0)
      : h.slots;
    if (validateSlots(slots, ownedFish, ownedScene).ok) p.home.slots = slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] }));
    if (validateDecoLayout(h.deco, p.decos).ok) p.home.deco = h.deco.map((d) => ({ id: d.id, x: d.x, y: d.y, rot: d.rot }));
  }
  return p;
}

export class ProfileStore {
  profile: PlayerProfile;
  private dirty = false;
  private lastSave = 0;

  constructor(
    private readonly storage: KeyValueStorage,
    /** Date.now（毫秒）；測試可換 */
    private readonly wallClock: () => number,
  ) {
    this.profile = this.load();
  }

  private load(): PlayerProfile {
    const now = this.wallClock();
    try {
      const text = this.storage.getItem(PROFILE_STORAGE_KEY);
      const p = text ? sanitizeProfile(JSON.parse(text), now) : null;
      if (p) return p;
    } catch (err) {
      console.warn('[ProfileStore] 存檔讀取失敗，使用初始資產', err);
    }
    this.dirty = true;
    return createInitialProfile(now);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** 節流寫入（FakeServer tick 呼叫；nowMs = server 時間） */
  tick(nowMs: number): void {
    if (this.dirty && nowMs - this.lastSave >= PROFILE_SAVE_INTERVAL_MS) {
      this.lastSave = nowMs;
      this.flush();
    }
  }

  /** 立刻寫入 */
  flush(): void {
    this.dirty = false;
    try {
      this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profile));
    } catch (err) {
      console.warn('[ProfileStore] 存檔寫入失敗', err);
    }
  }

  /** 重置成初始資產（debug） */
  reset(): PlayerProfile {
    this.profile = createInitialProfile(this.wallClock());
    this.flush();
    return this.profile;
  }
}
