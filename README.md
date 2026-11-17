# D3 UCG GAME

恐龍捕魚（DragonTycoon3）核心戰鬥的 three.js 網頁版。規格見 [docs/SPEC.md](docs/SPEC.md)。

## 開始

```bash
npm install
npm run assets   # 從原版複製資源到 public/res（D3_SRC = 原版資源、D3_CSD_SRC = Cocos Studio 專案，皆有預設路徑）
npm run dev      # http://localhost:5173
```

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 型別檢查 + 打包到 `dist/` |
| `npm test` | Vitest（路徑翻譯、群組時間軸、RTP 收斂） |
| `npm run assets` | 依 `tools/asset-manifest.mjs` 複製原版資源（自動追 c3b / efk / fnt / plist 相依） |
| `npm run inspect:c3b -- <file.c3b> [--bones] [--anim]` | 檢視 c3b 結構 |
| `node tools/inspect-csd.mjs <file.csd> [--timelines]` | 檢視 Cocos Studio csd 節點樹 / timeline |

## 操作

- 按住畫面：瞄準並連射（點一下單發）
- 左下 − / +：押注
- 右側技能按鈕（原版 Card.csd，由上到下）：

  | 按鈕 | 功能 | 成本 |
  |---|---|---|
  | 橘·準心 | 自動瞄準（鎖定最高賠率，必中追蹤彈） | ×1 |
  | 紅·火箭 | 榴彈砲（砲台 B） | ×5 |
  | 紫·漩渦 | 紫雷擊＝擴散彈，一次打 3–6 條（砲台 C+D） | ×20 |
  | 金·無人機 | 巡光炮雷射（砲台 E + 無人機） | ×30 |
  | 綠·自動 | 開「請選擇鎖定物種」設定面板（原版 TMDCommon 介面）；執行中再按 = 停止（空白鍵同） | — |

  技能互斥、準心與自動互斥、準心可和技能同時開。技能開但沒開自動時：點魚鎖定、按住才射。
- 點場上的魚：鎖定並射擊該魚（一般模式按住期間用鎖定彈，放開解除）
- 自動設定面板：依點選順序決定優先順序（1、2、3…）、全選 / 重新選擇；
  子彈數量 / 大於指定倍率停止 / 小於、大於目標籌碼停止（勾選 + −/+ 長按加速 + 點數字直接輸入）；確定後存檔並開始
- ` 鍵：開關 Debug 面板
  - **出獎模式**：顯示目前狀態，開啟後每次命中必中獎
  - **召喚魚**：篩選 + 列表（原版 GroupIdMap + 本版支援的群組），點一下立即出現

## 加新魚

1. `src/game/define/FishDefine.ts` 加一筆（照原版 `FishDefine.lua` 翻譯）
2. `tools/asset-manifest.mjs` 加模型，執行 `npm run assets`
3. `src/server-fake/config/payoutConfig.ts` 加賠付、`scheduleConfig.ts` 的 `SUPPORTED_FISH_TYPES` 加魚種
4. 有特殊行為（WaitAction 等）就寫 Fish 子類別並在 `GameApp` 用 `registries.fishClass.register()` 註冊

## 加新功能（例如抽卡）

實作 `GameFeature`（`src/core/feature/Feature.ts`），放在 `src/features/<name>/`，加進 `src/app/features.ts`。
假 server 端寫 `FakeServerModule` 並 `server.use()`；協定用 declaration merging 擴充 `@net/protocol`。詳見 SPEC §9、§10。
