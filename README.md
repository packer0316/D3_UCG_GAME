# D3 UCG GAME

恐龍捕魚（DragonTycoon3）核心戰鬥的 three.js 網頁版，加上 UGC 家園玩法（每個玩家有自己的家園）。
規格：戰鬥本體 [docs/SPEC.md](docs/SPEC.md)、UGC 家園 [docs/SPEC-UGC.md](docs/SPEC-UGC.md)。

## 開始

```bash
npm install
npm run assets   # 從原版複製資源到 public/res（D3_SRC = 原版資源、D3_CSD_SRC = Cocos Studio 專案、D3_LUA_SRC = 原版 Lua，皆有預設路徑）
npm run dev      # http://localhost:5173
```

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 型別檢查 + 打包到 `dist/` |
| `npm test` | Vitest（路徑翻譯、群組時間軸、RTP 收斂、UGC 規則與假 server） |
| `npm run assets` | 依 `tools/asset-manifest.mjs` 複製原版資源（自動追 c3b / efk / fnt / plist 相依；`lua-efk:` 項目把原版魚身 EFK 設定 Lua 轉成 `Data/FishEfk/*.json`） |
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

## UGC 家園（docs/SPEC-UGC.md）

畫面上方的功能列：

| 按鈕 | 功能 |
|---|---|
| 房間（顯示目前房間與場景） | 房間列表：1 號房公有地、2 號房我的家園、3–10 號房 NPC 家園；看內容、進入 |
| 魚卡 | 擁有的龍 / 場景 / 裝飾物；龍可以用碎片 + 金幣升級（倍率變高、更難被打死） |
| 抽卡（數字 = 抽卡券） | 單抽 / 十連；券要到公有地或別人的家園打龍才會掉 |
| 家園（數字 = 未領取的抽成） | 領取抽成、設定場景輪替與每個場景放出的龍、回家、裝潢 |

- 新玩家只有初始 11 種龍和森林場景；其他都靠抽卡。
- 抽卡採用「龍魂召喚」介面：36 張全幅卡圖、五色卡面、WebGL 光焰、單抽與十連揭卡、傳說特寫；收藏頁共用卡面。卡池機率與保底不變，詳見 [抽卡介面與素材說明](docs/GACHA-UI.md)。
- 裝潢模式：俯視 + 棋盤格。點下方物品拿起 → 點格子放下；點已擺好的物品可以移動；R 旋轉、右鍵 / Esc 收回。
- 存檔在瀏覽器 localStorage。Debug 面板的「UGC」區可以加抽卡券、解鎖全部、重置存檔。
- 目前沒有真的多人連線：其他玩家的家園是固定的 NPC，來我家的訪客是模擬的。

## 魚種

目前支援 1–17、22–28（SPEC §5.2、§14）：一般魚 1–14、特色魚 15–17、獵龍騎士 22、
Boss 樹精哥布林 23 / 帝王暴龍 24 / 遠古巨蠍 25 / 風神翼龍 26 / 翔空蒼龍 27（+ 翅膀 28）。
Boss 大獎演出（BossShow / Overlay）與特色魚大招尚未實作，一律降級為「獎圈 + 死亡」。

## 加新魚

1. `src/game/define/FishDefine.ts` 加一筆（照原版 `FishDefine.lua` 翻譯）
2. `tools/asset-manifest.mjs` 加模型；有魚身 EFK 就在 `fishEfk` 加 `lua-efk:<原版 EfkSetting.lua>|<會播到的動畫>`，
   並在 define 設 `efk: 'Data/FishEfk/<檔名>.json'`；執行 `npm run assets`
3. `src/server-fake/config/payoutConfig.ts` 加賠付、`scheduleConfig.ts` 的 `SUPPORTED_FISH_TYPES` 加魚種
4. 有特殊行為（WaitAction 等）就在 `src/game/world/fishes/` 寫 Fish 子類別（覆寫 `onInit` / `playAnims`，對照原版 Init / PlayAnims），
   並在 `fishes/index.ts` 的 `registerFishClasses` 註冊

## 加新功能

實作 `GameFeature`（`src/core/feature/Feature.ts`），放在 `src/features/<name>/`，加進 `src/app/features.ts`。
假 server 端寫 `FakeServerModule` 並 `server.use()`；協定用 declaration merging 擴充 `@net/protocol`。詳見 SPEC §9。
UGC 家園（`src/features/ugc/` + `src/server-fake/ugc/` + `src/game/ugc/`）就是這樣加的。

## 加新裝飾物

目前有 7 件卡扣積木（`model: 'brick'`，`BrickDeco.ts`，SPEC-UGC §9.6.1）和 12 件花園珍藏（`model: 'artisan'`，`ArtisanDeco.ts`，§9.7）。要加新的：

1. `src/game/ugc/DecoDefine.ts` 的 `DECO_DEFINES` 加一筆：`id`、名稱、佔地 `w × d`（格）、高 `h`、稀有度、`color`（積木的塑膠顏色 / 沒有外觀時的方塊顏色）。
   抽卡池、魚卡面板、裝潢物品列、擺放驗證都會自動包含它。想要積木造型就填 `model: 'brick'`（凸點、層數依佔地與高度自動產生）。
2. 其他造型用 `registerDecoBuilder(id, (def, rot, opts) => THREE.Object3D)`（`src/features/ugc/decor/DecoFactory.ts`）註冊 3D 外觀：
   物件原點 = 佔地中心、貼地、+Z 朝上，一格 = 10 世界單位；`opts.ghost` = 半透明預覽，`opts.editing` = 裝潢模式中。
   沒有 model 也沒註冊的物品會畫成單色方塊。
