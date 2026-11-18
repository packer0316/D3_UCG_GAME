/** 家園探索：熱門／新星分頁，搜尋、收藏與家園預覽。排行由 server 計算。 */
import type { GameContext } from '@game/GameContext';
import { commissionRate, fishMultiplier, hasFixedOdds } from '@game/ugc/CultivateRule';
import { homeAgeDays } from '@game/ugc/HomeRule';
import { MAX_LEVEL, NEW_HOME_DAYS } from '@game/ugc/UgcDefine';
import type { HomeRanking, RoomDetail, RoomHostProfile } from '@game/ugc/UgcTypes';
import type { UgcClient } from '../UgcClient';
import { Panel } from './Panel';
import { clear, el, fishIcon, fmtMult, fmtPct, sceneChip, sceneName } from './dom';
import { uiIcon } from './icons';
import { playerAvatar } from './PlayerAvatar';
import { roomMetrics, type RoomMetric } from './RoomMetrics';
import { MetricTooltip } from './MetricTooltip';
import './room-directory.css';

type DirectoryTab = 'hot' | 'rising' | 'saved';
const ageText = (createdAt: number, now: number): string => {
  const days = homeAgeDays(createdAt, now);
  return days === 0 ? '今天開張' : `${days} 天前開張`;
};
const maxLevel = (room: RoomDetail): number => Math.max(1, ...room.slots.flatMap(s => s.fishTypes.map(t => room.levels[t] ?? 1)));
const roomTitle = (room: RoomDetail): string => room.kind === 'public' ? '公有地' : room.isMine ? '我的家園' : `${room.ownerName}的家園`;
const identity = (room: RoomDetail): RoomHostProfile => room.host ?? {
  portrait: room.slots[0]?.fishTypes[0] ?? 1,
  title: room.isMine ? '家園主人' : '自由探索',
  bio: room.isMine ? '從一隻小龍開始，打造屬於自己的風景。' : '每一片風景，都是冒險的起點。所有場景與龍種，在這裡相遇。',
};

export class RoomListPanel {
  readonly panel: Panel;
  private readonly metricTooltip: MetricTooltip;
  private readonly search = el('input', 'directory-search-input');
  private readonly tabs = el('div', 'directory-tabs');
  private readonly shortcuts = el('div', 'directory-shortcuts');
  private readonly list = el('div', 'directory-list');
  private readonly listHeading = el('div', 'directory-list-heading');
  private readonly detail = el('div', 'directory-detail');
  private readonly summary = el('span', 'directory-summary');
  private readonly layout = el('div', 'directory-layout');
  private rooms: RoomDetail[] = [];
  private ranking: HomeRanking = { hot: [], rising: [] };
  private now = 0;
  private currentRoomId = 0;
  private selected = 0;
  private tab: DirectoryTab = 'hot';
  private favorites = new Set<number>();
  private requestVersion = 0;

  constructor(private readonly ctx: GameContext, private readonly ugc: UgcClient) {
    this.panel = new Panel(ctx.ui, { title: '房間列表', width: 1060, height: 604, className: 'room-directory-panel' });
    this.metricTooltip = new MetricTooltip(this.panel.win);
    this.panel.win.querySelector('.ugc-panel-title')!.replaceChildren(
      el('span', 'directory-heading-icon', uiIcon('rooms')), el('div', '',
        el('div', 'directory-heading-title', '房間列表', el('span', 'directory-heading-en', 'EXPLORE')),
        el('div', 'directory-heading-sub', '發現下一個喜歡的家園')), this.summary);
    this.search.type = 'search';
    this.search.placeholder = '搜尋玩家、房號、場景…';
    this.search.setAttribute('aria-label', '搜尋玩家、房號或場景');
    this.search.addEventListener('input', () => this.renderList(true));
    this.tabs.setAttribute('role', 'group');
    this.tabs.setAttribute('aria-label', '家園分類');
    this.layout.append(el('aside', 'directory-sidebar',
      el('label', 'directory-search', uiIcon('search'), this.search), this.shortcuts, this.tabs, this.listHeading, this.list,
      el('div', 'directory-sidebar-foot', el('span', 'directory-status-dot'), '逛逛家園，遇見不同的風景')), this.detail);
    this.panel.body.append(this.layout);
    this.panel.onOpen = () => {
      this.loadFavorites();
      this.layout.classList.remove('show-detail');
      void this.refresh();
    };
    this.panel.onEscape = () => {
      if (this.metricTooltip.visible) {
        this.metricTooltip.hide();
        return true;
      }
      if (this.panel.win.classList.contains('directory-compact') && this.layout.classList.contains('show-detail')) {
        this.layout.classList.remove('show-detail');
        this.search.focus();
        return true;
      }
      return false;
    };
    this.panel.onClose = () => this.metricTooltip.hide();
    const resize = () => {
      this.metricTooltip.hide();
      this.panel.win.classList.toggle('directory-compact', ctx.ui.width < 760);
    };
    ctx.ui.onResize(resize);
    resize();
  }

  private get storageKey(): string { return `d3-ugc-room-favorites:v1:${this.ugc.profile?.accountId ?? 0}`; }

  private loadFavorites(): void {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      this.favorites = new Set(Array.isArray(saved) ? saved.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : []);
    } catch { this.favorites = new Set(); }
  }

  private async refresh(): Promise<void> {
    const version = ++this.requestVersion;
    this.list.replaceChildren(el('div', 'directory-empty', '正在尋找家園…'));
    this.list.setAttribute('aria-busy', 'true');
    const result = await this.ugc.listRooms();
    if (version !== this.requestVersion) return;
    this.list.setAttribute('aria-busy', 'false');
    this.rooms = result.rooms;
    this.ranking = { hot: result.hot, rising: result.rising };
    this.now = result.now;
    this.currentRoomId = result.currentRoomId;
    if (!this.rooms.some(r => r.roomId === this.selected)) this.selected = this.currentRoomId;
    this.summary.textContent = `${this.rooms.filter(r => r.kind === 'home').length} 座家園 · 等你探索`;
    this.renderShortcuts();
    this.renderTabs();
    this.renderList();
    this.renderDetail();
  }

  private renderShortcuts(): void {
    clear(this.shortcuts);
    for (const room of this.rooms.filter(r => r.kind === 'public' || r.isMine)) {
      const button = el('button', `directory-shortcut${room.roomId === this.selected ? ' selected' : ''}`,
        uiIcon(room.isMine ? 'home' : 'rooms'), el('span', '', roomTitle(room),
          el('small', '', room.roomId === this.currentRoomId ? '目前所在' : room.isMine ? '回到自己的天地' : '所有龍種・自由探索')));
      button.setAttribute('aria-pressed', String(room.roomId === this.selected));
      button.addEventListener('click', () => this.select(room.roomId));
      this.shortcuts.append(button);
    }
  }

  private renderTabs(): void {
    clear(this.tabs);
    const options = [['hot', '熱門', 'flame'], ['rising', '新星', 'gacha'], ['saved', '收藏', 'heart']] as const;
    for (const [key, label, icon] of options) {
      const button = el('button', `directory-tab${key === this.tab ? ' active' : ''}`, uiIcon(icon), label);
      button.setAttribute('aria-pressed', String(key === this.tab));
      button.addEventListener('click', () => {
        this.tab = key;
        for (const tab of this.tabs.querySelectorAll('button')) {
          tab.classList.toggle('active', tab === button);
          tab.setAttribute('aria-pressed', String(tab === button));
        }
        this.renderList(true);
      });
      this.tabs.append(button);
    }
  }

  private renderList(resetScroll = false): void {
    const scrollTop = resetScroll ? 0 : this.list.scrollTop;
    const query = this.search.value.trim().normalize('NFKC').toLocaleLowerCase();
    const ids = this.tab === 'rising' ? this.ranking.rising : this.ranking.hot;
    const byId = new Map(this.rooms.map(room => [room.roomId, room]));
    const matches = ids.flatMap((id, index) => {
      const room = byId.get(id);
      if (!room || room.isMine || (this.tab === 'saved' && !this.favorites.has(id))) return [];
      const keywords = `${room.ownerName} ${room.roomId} ${identity(room).title} ${room.slots.map(s => sceneName(s.sceneType)).join(' ')}`.normalize('NFKC').toLocaleLowerCase();
      return !query || keywords.includes(query) ? [{ room, rank: index + 1 }] : [];
    });
    const subtitle = this.tab === 'rising' ? `${NEW_HOME_DAYS} 天內開張` : this.tab === 'saved' ? '喜歡的家園' : '依家園人氣排行';
    this.listHeading.replaceChildren(el('span', '', subtitle), el('span', '', `${matches.length} 位屋主`));
    clear(this.list);
    if (!matches.length) {
      const empty = el('div', 'directory-empty', uiIcon(this.tab === 'saved' ? 'heart' : 'search'),
        el('strong', '', !this.rooms.length ? '暫時無法取得房間' : query ? '沒有找到符合的家園' : this.tab === 'saved' ? '收藏下一個喜歡的家園' : '還沒有新開的家園'),
        el('span', '', query ? '試試玩家名稱、房號或「森林」' : this.tab === 'saved' ? '在家園預覽點選愛心，下次更快找到屋主。' : '稍後再回來看看。'));
      if (!this.rooms.length) {
        const retry = el('button', 'ugc-btn', '重新整理');
        retry.addEventListener('click', () => void this.refresh());
        empty.append(retry);
      } else if (query) {
        const reset = el('button', 'directory-text-button', '清除搜尋');
        reset.addEventListener('click', () => { this.search.value = ''; this.renderList(true); this.search.focus(); });
        empty.append(reset);
      }
      this.list.append(empty);
    }
    for (const { room, rank } of matches) this.list.append(this.row(room, rank));
    this.list.scrollTop = scrollTop;
  }

  private row(room: RoomDetail, rank: number): HTMLButtonElement {
    const host = identity(room);
    const avatar = playerAvatar(this.ctx.ui, host, 36);
    const row = el('button', `directory-row${room.roomId === this.selected ? ' selected' : ''}`,
      el('span', `directory-rank rank-${rank}`, String(rank).padStart(2, '0')), avatar,
      el('span', 'directory-row-copy', el('span', 'directory-player-name', room.ownerName,
        this.favorites.has(room.roomId) && el('span', 'directory-saved-mark', uiIcon('heart'))),
        el('span', 'directory-player-meta', `#${String(room.roomId).padStart(2, '0')} · ${sceneName(room.slots[0]?.sceneType ?? 0)} · 最高 Lv.${maxLevel(room)}`)),
      el('span', 'directory-row-score', el('strong', '', String(Math.round(room.popularity))),
        el('small', '', room.roomId === this.currentRoomId ? '目前所在' : this.tab === 'rising' ? ageText(room.createdAt, this.now).replace('開張', '') : '人氣')));
    row.dataset.roomId = String(room.roomId);
    row.setAttribute('aria-pressed', String(room.roomId === this.selected));
    row.setAttribute('aria-label', `${room.ownerName}，${host.title}，人氣 ${Math.round(room.popularity)}`);
    row.title = `${room.ownerName}｜${host.title}｜${ageText(room.createdAt, this.now)}`;
    row.addEventListener('click', () => this.select(room.roomId));
    return row;
  }

  private select(id: number): void {
    this.selected = id;
    this.renderShortcuts();
    // 保留被點選的按鈕與鍵盤焦點。
    for (const button of this.list.querySelectorAll<HTMLButtonElement>('.directory-row')) {
      const selected = Number(button.dataset.roomId) === id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this.renderDetail();
    this.layout.classList.add('show-detail');
    if (this.panel.win.classList.contains('directory-compact')) this.detail.querySelector<HTMLButtonElement>('.directory-back')?.focus();
  }

  private renderDetail(): void {
    this.metricTooltip.hide();
    clear(this.detail);
    const room = this.rooms.find(r => r.roomId === this.selected);
    if (!room) {
      this.detail.append(el('div', 'directory-empty', uiIcon('rooms'), el('strong', '', '選一座家園，開始探索'), el('span', '', '查看屋主、龍種與場景輪替')));
      return;
    }
    const host = identity(room), home = room.kind === 'home', here = room.roomId === this.currentRoomId;
    const back = el('button', 'directory-back directory-text-button', uiIcon('back'), '返回列表');
    back.addEventListener('click', () => { this.layout.classList.remove('show-detail'); this.search.focus(); });
    const rank = this.ranking.hot.indexOf(room.roomId) + 1;
    const hero = el('div', 'directory-hero', sceneChip(room.slots[0]?.sceneType ?? 0, 'directory-hero-art'), el('div', 'directory-hero-shade'),
      el('div', 'directory-hero-top', el('span', 'directory-hero-label', 'HOME DISCOVERY'),
        el('span', 'directory-pill', here ? '● 目前所在' : home ? `人氣排名 #${rank}` : '公共探索區')),
      el('div', 'directory-hero-copy', el('div', 'directory-eyebrow', `ROOM ${String(room.roomId).padStart(2, '0')} / ${home ? host.title : '冒險從這裡開始'}`),
        el('h2', '', roomTitle(room)),
        el('div', 'directory-hero-tags', ...[...new Set(room.slots.map(s => s.sceneType))].map(s => el('span', '', sceneName(s))))));
    const avatar = playerAvatar(this.ctx.ui, host, 38);
    const profile = el('div', 'directory-host', avatar, el('div', 'directory-host-copy',
      el('div', 'directory-host-name', home ? room.ownerName : '探索者大廳', el('span', '', host.title)), el('p', '', host.bio)));
    if (home && !room.isMine) profile.append(this.favoriteButton(room));
    const stats = el('div', 'directory-stats', ...roomMetrics(room).map(item => metric(item, this.metricTooltip)));
    const slots = el('div', 'directory-slots');
    room.slots.forEach((slot, index) => {
      const fish = el('div', 'directory-fish');
      for (const type of slot.fishTypes) {
        const level = room.levels[type] ?? 1, icon = fishIcon(this.ctx.ui, type, 37);
        if (home) {
          icon.append(el('span', 'ugc-icon-lv', `Lv.${level}`));
          icon.title += `　Lv.${level}　倍率 ${hasFixedOdds(type) ? '×1（固定）' : fmtMult(fishMultiplier(type, level), 3)}　抽成 ${fmtPct(commissionRate(level), 2)}`;
        }
        fish.append(icon);
      }
      slots.append(el('div', 'directory-slot', sceneChip(slot.sceneType, 'directory-slot-art'),
        el('div', 'directory-slot-content', el('div', 'directory-slot-heading',
          el('strong', '', el('span', '', String(index + 1).padStart(2, '0')), sceneName(slot.sceneType)),
          el('small', '', `${slot.fishTypes.length} 種龍`)), fish)));
    });
    const content = el('div', 'directory-detail-scroll', back, hero, profile, stats,
      el('div', 'directory-section-heading', el('h3', '', '家園場景', el('span', '', `${room.slots.length} 段輪替`)),
        el('span', '', uiIcon('clock'), `每 ${room.slotSeconds} 秒切換`)), slots,
      home && el('div', 'directory-home-facts', `${ageText(room.createdAt, this.now)} · ${room.deco.length} 件裝飾`, el('span', '', '平均訪客為模擬值')));
    const enter = el('button', 'ugc-btn primary directory-enter', here ? '目前所在' : room.isMine ? '回到家園' : '進入家園', !here && uiIcon('arrow'));
    enter.disabled = here;
    enter.addEventListener('click', async () => {
      enter.disabled = true;
      enter.textContent = '正在進入…';
      try {
        const result = await this.ugc.enterRoom(room.roomId);
        if (result.ok) this.panel.close();
        else this.ctx.ui.toast(result.reason ?? '進房失敗');
      } catch { this.ctx.ui.toast('連線失敗，請稍後重試'); }
      finally {
        enter.disabled = false;
        enter.replaceChildren(room.isMine ? '回到家園' : '進入家園', uiIcon('arrow'));
      }
    });
    const rule = !home ? '所有龍種與場景 · 打龍可獲得抽卡券' : room.isMine ? '觀看模式 · 訪客打龍可獲得抽成' : `打龍可掉抽卡券 · 屋主抽成 ${fmtPct(commissionRate(1), 0)}–${fmtPct(commissionRate(MAX_LEVEL), 0)}`;
    this.detail.append(content, el('div', 'directory-entry', el('div', '', el('strong', '', room.isMine ? '回家看看你的龍' : here ? '你正在這裡探索' : '準備好探索了嗎？'), el('small', '', rule)), enter));
  }

  private favoriteButton(room: RoomDetail): HTMLButtonElement {
    const button = el('button', 'directory-favorite', uiIcon('heart'));
    const update = () => {
      const saved = this.favorites.has(room.roomId);
      button.classList.toggle('saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', saved ? '取消收藏家園' : '收藏家園');
      button.title = saved ? '取消收藏' : '收藏家園';
    };
    update();
    button.addEventListener('click', () => {
      if (this.favorites.has(room.roomId)) this.favorites.delete(room.roomId);
      else this.favorites.add(room.roomId);
      try { localStorage.setItem(this.storageKey, JSON.stringify([...this.favorites])); }
      catch { this.ctx.ui.toast('收藏已更新，但瀏覽器無法儲存，關閉後可能不會保留。'); }
      update();
      this.renderList();
    });
    return button;
  }
}

function metric(item: RoomMetric, tooltip: MetricTooltip): HTMLButtonElement {
  const button = el('button', 'directory-stat',
    el('span', '', uiIcon(item.icon), item.label, el('span', 'directory-stat-help', '?')), el('strong', '', item.value));
  button.type = 'button';
  button.setAttribute('aria-label', `${item.label} ${item.value}，查看計算方式`);
  tooltip.bind(button, item.explanation);
  return button;
}
