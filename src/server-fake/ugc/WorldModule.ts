/**
 * 房間目錄（SPEC-UGC §2）：1 號房公有地、2 號房我的家園、3 號起 NPC 家園；房間列表與進房請求。
 * 一次只模擬玩家所在的那一間房（RoomModule.current），其他房間只有內容、沒有在跑。
 */
import '@game/ugc/UgcProtocol';
import { SCENE_LIST, isFishAllowedInScene } from '@game/define/SceneDefine';
import { CARD_FISH_TYPES } from '@game/ugc/CardDefine';
import { homePopularity, visitorCount } from '@game/ugc/HomeRule';
import { MY_HOME_ROOM_ID, PUBLIC_ROOM_ID, SLOT_SECONDS, SYSTEM_ACCOUNT_ID } from '@game/ugc/UgcDefine';
import type { DecoPlacement, HomeSlot, RoomDetail } from '@game/ugc/UgcTypes';
import type { FakeServer, FakeServerModule } from '../FakeServer';
import { NPC_HOMES } from './npcHomes';

const cloneSlots = (slots: readonly HomeSlot[]): HomeSlot[] => slots.map((s) => ({ sceneType: s.sceneType, fishTypes: [...s.fishTypes] }));
const cloneDeco = (deco: readonly DecoPlacement[]): DecoPlacement[] => deco.map((d) => ({ ...d }));

export class WorldModule implements FakeServerModule {
  readonly id = 'world';
  private server!: FakeServer;

  install(server: FakeServer): void {
    this.server = server;
    server.on('U2G_ROOM_LIST_REQ', () => {
      server.send('G2U_ROOM_LIST_ACK', { rooms: this.listRooms(), currentRoomId: server.room.current.roomId });
    });
    server.on('U2G_ENTER_ROOM_REQ', ({ roomId }) => {
      const room = this.getRoom(roomId);
      if (!room) {
        server.send('G2U_ENTER_ROOM_ACK', { ok: false, reason: '房間不存在', roomId });
        return;
      }
      // ACK 先送，房間資料（G2U_ROOM_INFO_NOTIFY + G2U_ROOM_DATA_NOTIFY）接在後面
      server.send('G2U_ENTER_ROOM_ACK', { ok: true, roomId });
      server.room.enter(roomId);
    });
  }

  roomIds(): number[] {
    return [PUBLIC_ROOM_ID, MY_HOME_ROOM_ID, ...NPC_HOMES.map((h) => h.roomId)];
  }

  listRooms(): RoomDetail[] {
    return this.roomIds().map((id) => this.getRoom(id)!);
  }

  /** 房間內容（每次呼叫都依目前資料重新組，改了家園設定 / 等級後直接反映） */
  getRoom(roomId: number): RoomDetail | null {
    if (roomId === PUBLIC_ROOM_ID) return this.publicRoom();
    if (roomId === MY_HOME_ROOM_ID) return this.myHome();
    const npc = NPC_HOMES.find((h) => h.roomId === roomId);
    if (!npc) return null;
    return this.homeDetail(npc.roomId, npc.accountId, npc.name, false, npc.slots, npc.levels, npc.deco);
  }

  /** 公有地：所有場景輪流，每個場景放所有（該場景允許的）魚種 */
  private publicRoom(): RoomDetail {
    return {
      roomId: PUBLIC_ROOM_ID,
      kind: 'public',
      name: `${PUBLIC_ROOM_ID}號房 公有地`,
      ownerId: SYSTEM_ACCOUNT_ID,
      ownerName: '公有地',
      isMine: false,
      slots: SCENE_LIST.map((s) => ({ sceneType: s, fishTypes: CARD_FISH_TYPES.filter((t) => isFishAllowedInScene(t, s)) })),
      levels: {},
      deco: [],
      popularity: 0,
      visitors: 0,
      slotSeconds: SLOT_SECONDS,
    };
  }

  private myHome(): RoomDetail {
    const p = this.server.profile.profile;
    const levels: Record<number, number> = {};
    for (const [t, card] of Object.entries(p.fish)) levels[Number(t)] = card.level;
    return this.homeDetail(MY_HOME_ROOM_ID, p.accountId, p.name, true, p.home.slots, levels, p.home.deco);
  }

  private homeDetail(
    roomId: number,
    ownerId: number,
    ownerName: string,
    isMine: boolean,
    slots: readonly HomeSlot[],
    levels: Readonly<Record<number, number>>,
    deco: readonly DecoPlacement[],
  ): RoomDetail {
    const popularity = homePopularity(slots, deco.length, (t) => levels[t] ?? 1);
    return {
      roomId,
      kind: 'home',
      name: `${roomId}號房 ${isMine ? '我的家園' : `${ownerName}的家園`}`,
      ownerId,
      ownerName,
      isMine,
      slots: cloneSlots(slots),
      levels: { ...levels },
      deco: cloneDeco(deco),
      popularity,
      visitors: Math.round(visitorCount(popularity) * 10) / 10,
      slotSeconds: SLOT_SECONDS,
    };
  }
}
