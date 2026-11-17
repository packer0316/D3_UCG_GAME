/**
 * 測試工具 — 對照原版 Player.cpp OnDebugToolUse（DEBUG_U2G_CLIENT_TOOL_USE_REQ）
 *   toolType 1 CHEAT_MODE：出獎模式（每次命中必中獎），target 1 = 開、0 = 關
 *   toolType 2 SUMMON    ：召喚群組（target = groupId），立即加入並送 107；群組含目前場景不允許的魚種 → 失敗（SPEC §15.4）
 *   toolType 100 CHANGE_SCENE（本版自訂）：換場景（target = sceneType），送 G2U_CHANGE_SCENE_NOTIFY 並重新排程（SPEC §15.3）
 */
import { DebugErrorCode, DebugToolType } from '@net/protocol';
import type { FakeServer, FakeServerModule } from '../FakeServer';

export class DebugModule implements FakeServerModule {
  readonly id = 'debug';

  install(server: FakeServer): void {
    server.on('U2G_DEBUG_CLIENT_TOOL_USE_REQ', ({ toolType, target }) => {
      let errorCode: number = DebugErrorCode.UseFail;
      if (toolType === DebugToolType.CheatMode) {
        server.rtp.cheatMode = target === 1;
        errorCode = DebugErrorCode.Success;
      } else if (toolType === DebugToolType.Summon) {
        errorCode = server.script.spawnGroup(target) ? DebugErrorCode.Success : DebugErrorCode.UseFail;
      } else if (toolType === DebugToolType.ChangeScene) {
        errorCode = server.room.changeScene(target) ? DebugErrorCode.Success : DebugErrorCode.UseFail;
      }
      server.send('G2U_DEBUG_CLIENT_TOOL_USE_ACK', { toolType, errorCode, target });
    });
  }
}
