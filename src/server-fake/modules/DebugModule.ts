/**
 * 測試工具 — 對照原版 Player.cpp OnDebugToolUse（DEBUG_U2G_CLIENT_TOOL_USE_REQ）
 *   toolType 1 CHEAT_MODE：出獎模式（每次命中必中獎），target 1 = 開、0 = 關
 *   toolType 2 SUMMON    ：召喚群組（target = groupId），立即加入並送 107；群組含目前場景不允許的魚種 → 失敗（SPEC §15.4）
 *   toolType 100 CHANGE_SCENE（本版自訂）：換場景（target = sceneType），送 G2U_CHANGE_SCENE_NOTIFY 並重新排程（SPEC §15.3）
 *   UGC（SPEC-UGC §10）：200 加抽卡券（quantity 張）、201 解鎖全部魚卡 / 場景 / 裝飾物、202 重置存檔
 */
import { DebugErrorCode, DebugToolType } from '@net/protocol';
import { CARD_FISH_TYPES, SCENE_RARITY } from '@game/ugc/CardDefine';
import { DECO_DEFINES } from '@game/ugc/DecoDefine';
import { UgcDebugTool } from '@game/ugc/UgcProtocol';
import type { FakeServer, FakeServerModule } from '../FakeServer';

export class DebugModule implements FakeServerModule {
  readonly id = 'debug';

  install(server: FakeServer): void {
    server.on('U2G_DEBUG_CLIENT_TOOL_USE_REQ', ({ toolType, target, quantity }) => {
      let errorCode: number = DebugErrorCode.UseFail;
      if (toolType === DebugToolType.CheatMode) {
        server.rtp.cheatMode = target === 1;
        errorCode = DebugErrorCode.Success;
      } else if (toolType === DebugToolType.Summon) {
        errorCode = server.script.spawnGroup(target) ? DebugErrorCode.Success : DebugErrorCode.UseFail;
      } else if (toolType === DebugToolType.ChangeScene) {
        errorCode = server.room.changeScene(target) ? DebugErrorCode.Success : DebugErrorCode.UseFail;
      } else if (toolType === UgcDebugTool.AddTickets) {
        server.profile.profile.tickets += Math.max(1, Math.floor(quantity) || 10);
        this.profileChanged(server);
        errorCode = DebugErrorCode.Success;
      } else if (toolType === UgcDebugTool.UnlockAll) {
        const p = server.profile.profile;
        for (const t of CARD_FISH_TYPES) p.fish[t] ??= { level: 1, copies: 0 };
        for (const t of CARD_FISH_TYPES) p.fish[t].copies += 5;
        for (const s of Object.keys(SCENE_RARITY).map(Number)) if (!p.scenes.includes(s)) p.scenes.push(s);
        for (const d of DECO_DEFINES) p.decos[d.id] = Math.max(p.decos[d.id] ?? 0, 5);
        this.profileChanged(server);
        errorCode = DebugErrorCode.Success;
      } else if (toolType === UgcDebugTool.ResetProfile) {
        server.profile.reset();
        server.room.syncMoney();
        server.sendProfile();
        // 人在自己的家園：家園內容也重置了，重新進房
        if (server.room.current.isMine) server.room.restartCurrent();
        errorCode = DebugErrorCode.Success;
      }
      server.send('G2U_DEBUG_CLIENT_TOOL_USE_ACK', { toolType, errorCode, target });
    });
  }

  private profileChanged(server: FakeServer): void {
    server.profile.markDirty();
    server.sendProfile();
  }
}
