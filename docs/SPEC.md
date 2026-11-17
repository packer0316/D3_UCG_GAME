# D3 UCG GAME — 規格書（Three.js 網頁版 · 第一階段）

> 參考來源：`D:\GIT_TMD\Git_1\DragonTycoon3`（Cocos2d-x 3.x + Lua，以下稱「原版」）
> 文件版本：v0.1 · 2026-11-17

---

## 0. 目標與範圍

把原版「恐龍捕魚」的**核心戰鬥畫面**移植到瀏覽器（Vite + TypeScript + three.js），畫面接近原版雪地場景截圖。

### 0.1 本階段要做（In Scope）

| 項目 | 內容 |
|---|---|
| 場景 | 雪地場景 `Scene03`（SceneType Snow = 2），原版相機參數 1:1 |
| 龍（魚） | 第一批 14 種一般龍 + 帝王暴龍（BOSSSHOW 示範），c3b 模型、骨骼動畫、平面陰影 |
| 路徑 | **翻譯原版路徑腳本**（`PathData.json` / `GroupData.json` + `PathMove.lua` + `FishTimeline`），龍走在原版該走的位置 |
| 砲台 | `dt3_cannon_A` 3D 砲台、觸控瞄準、開火動畫、砲口 EFK、過熱發光 |
| 射擊 | 子彈（Fireball EFK）、牆面反彈、2D OBB 碰撞、自動射擊 |
| Shader | 魚身 unlit + 受擊 rim 白閃（bleach）、平面陰影（stencil）、場景 alpha-test |
| EFK | EffekseerForWebGL 1.70e，與 three.js 共用 GL context 與相機 |
| 表演 | 受擊白閃+抖動、一般死亡、得分跳字、**獎圈（WinCircle）**、**噴錢（Coin Spray）** |
| 假 Server | 瀏覽器內模擬：開房、群組排程、扣款、命中判定，**RTP 110%** |
| HUD | 座位面板（押注 / 餘額 / ± 按鈕）、等待加入、自動按鈕 |

### 0.2 本階段不做（Out of Scope，但架構需預留）

- BossShow 全部（`BossShowLayer` 系列）→ 依 §7.2 **降級為小獎**
- 特殊子彈（Grenade / Plasma / Laser）、鎖定射擊、道具掉落（`Reward_Item`）、HitMore、Overlay 大獎
- 換場景 / 轉場（Iris / Cloud）、天空場景
- 真實 Server、帳號、多人同步（其他座位顯示「等待加入」）
- **抽卡（Gacha）** → 下一階段，以 Feature 外掛方式加入（§10）

---

## 1. 技術選型

| 類別 | 選擇 | 備註 |
|---|---|---|
| 建置 | Vite 8 + TypeScript 7（strict） | `npm run dev` / `build` / `test` |
| 3D | three.js 0.187 | WebGL2，`stencil: true`，不做色彩管理（與 Cocos 相同） |
| 特效 | EffekseerForWebGL **1.70e**（wasm） | 原版 efk 為 v1500（1.5），向下相容；放 `public/lib/effekseer/` |
| 模型 | 自寫 `C3bParser` + `C3bLoader`（c3b v0.7） | 原版沒有 FBX/glTF 原始檔，只能直接讀 c3b |
| 2D 圖集 | TexturePacker plist（format 2）→ 複製時轉 JSON | `Sprite2D`（支援 rotated / trim） |
| 數字字型 | BMFont `.fnt`（文字格式） | `BitmapText` |
| 測試 | Vitest | 路徑內插、群組時間軸、RTP 收斂 |
| 音效 | Web Audio（`AudioManager`） | mp3 |

---

## 2. 座標系與相機（與原版 1:1）

- **世界座標 Z 朝上**，地面 = `z = 0` 平面；路徑 `(x, y)` 直接是世界 XY。程式啟動時設定 `Object3D.DEFAULT_UP = (0,0,1)`。
- **不翻轉座位視角**（原版 `isReverse = false`，所有座位共用同一台相機）。
- Cocos 歐拉角換算：`q = Rz(-z)·Ry(y)·Rx(x)` → three.js `rotation.set(rad(x), rad(y), -rad(z), 'ZYX')`。共用工具 `cocosEuler()`。
- 設計解析度：**高固定 640**，寬 = 視窗寬 / 縮放（原版 FIXED_HEIGHT / SHOW_ALL）。

| 相機 | 值 | 來源 |
|---|---|---|
| 類型 | Perspective，**fov 33（垂直）** | `DisplayLayer.lua:8-17` |
| near / far | 10 / 5000 | 同上 |
| position | `(0, -104, 95)` | 同上 |
| rotation | `(60, 0, 0)`（不用 lookAt） | 同上，視線 `(0, 0.866, -0.5)` |
| 震動 | MoveBy `(d,0,d)`,`(-2d,0,-2d)`,`(0,0,2d)` 每步 0.05s | `DisplayLayer.lua:57-70` |

可見地面範圍（z=0）：近邊 y=-14（±82），遠邊 y=292（±253）。
**牆（子彈反彈）多邊形**：`(-65,-14) (-123,150) (123,150) (65,-14)`（`PhysicsDefine.lua:39`）。

### 2.1 繪製順序（Render Pipeline）

```
1. World3D pass   場景(不透明) → 魚陰影(blend+stencil) → 魚身/砲台(不透明)
2. EFK pass       effekseer.draw()（共用 depth，畫在模型之後）→ renderer.resetState()
3. Overlay2D pass 正交相機（設計座標，左下原點）：跳字、金幣、獎圈、命中特效
4. DOM HUD        座位面板、按鈕
```

`Stage` 以「可插拔的 RenderPass 陣列」實作，之後抽卡的 3D 卡牌展示可插入自己的 pass。

---

## 3. 專案結構

```
D3_UCG_GAME/
├─ docs/                    規格與說明
│  └─ SPEC.md
├─ tools/                   開發工具（Node 腳本，不進 bundle）
│  ├─ copy-assets.mjs       依 manifest 從原版複製資源；追 efk/efkmat/c3b 相依貼圖；plist→json
│  ├─ asset-manifest.mjs    要複製的資源清單
│  └─ inspect-c3b.mjs       c3b 結構 dump（除錯用）
├─ public/
│  ├─ lib/effekseer/        effekseer.min.js + effekseer.wasm
│  └─ res/                  複製來的原版資源，**保留原版相對路徑**（設定檔可直接抄原路徑）
├─ src/
│  ├─ main.ts               入口
│  ├─ app/                  組裝層：GameApp、啟動流程、Feature 清單
│  ├─ core/                 與渲染無關的框架
│  │  ├─ events/            EventBus（型別安全）
│  │  ├─ services/          ServiceRegistry（依 token 取服務）
│  │  ├─ feature/           GameFeature 介面、FeatureManager（擴充機制）
│  │  ├─ tween/             Action / ActionManager（對應 cc.Action：Sequence / Spawn / Delay / Repeat）
│  │  ├─ pool/              物件池
│  │  └─ math/              cocos.ts（歐拉角、角度）、geom2d.ts（OBB、牆）、random.ts
│  ├─ engine/               three.js 渲染層
│  │  ├─ stage/             Stage（renderer、相機、RenderPass、設計座標換算）
│  │  ├─ loaders/           C3bParser（純資料）、C3bLoader（→ three）、FntLoader
│  │  ├─ assets/            AssetManager（路徑、快取、atlas、字型、預載）
│  │  ├─ csd/               Cocos Studio 執行環境：CsdParser（XML→JSON，工具共用）、CsdPlayer（節點 + timeline）
│  │  ├─ input/             PointerRouter（UI 按鈕優先、其餘交給射擊）
│  │  ├─ effekseer/         EfkSystem（runtime 載入、播放、跟隨節點、併發上限）
│  │  ├─ materials/         FishMaterial、ShadowMaterial、CannonMaterial
│  │  ├─ sprite2d/          Sprite2D、BitmapText
│  │  └─ audio/             AudioManager
│  ├─ net/                  通訊抽象（真/假 server 共用）
│  │  ├─ protocol.ts        訊息型別（沿用原版訊息名稱）
│  │  ├─ Transport.ts       介面 + WebSocketTransport（預留）
│  │  └─ NetClient.ts       型別安全收發
│  ├─ server-fake/          假 Server（之後接真 server 時整包移除）
│  │  ├─ FakeServer.ts      模組化 server 核心（訊息分派、tick、use(module)）
│  │  ├─ LocalTransport.ts  頁內傳輸（模擬延遲、保序）
│  │  ├─ modules/           RoomModule、ScriptModule、ShootModule
│  │  ├─ rtp/               RtpEngine（目標 RTP 110%）、統計
│  │  └─ config/            scheduleConfig（群組排程）、payoutConfig（賠付表）
│  ├─ game/                 遊戲本體（對應原版 System / Model / View）
│  │  ├─ GameContext.ts     context、事件表、圖層
│  │  ├─ Tokens.ts          服務 token
│  │  ├─ define/            翻譯自原版 Define：Display / Fish / Cannon / Bullet / Scene / Reward / Sound
│  │  ├─ path/              PathMove 翻譯：PathTrack（cardinal / bezier / wait marker）、PathTypes
│  │  ├─ timeline/          FishTimeline / SubTimeline（群組時鐘、晚加入快轉）
│  │  ├─ systems/           SeatSystem、FishSystem、ShootingSystem、RewardSystem（+ SmallWinShow）、
│  │  │                     SkillSystem（按鈕狀態 / 互斥 / 子彈類型）、LockSystem（鎖定目標、準心）
│  │  ├─ bullet/            子彈行為（BulletBehaviorRegistry）：NormalBullet、TrackBullet、LightningBullet、LaserShot
│  │  ├─ world/             BGScene、Fish、TRexFish、FishClassRegistry、Cannon（多外觀）、CameraShake
│  │  └─ show/              KillShowRegistry、FishHitShow、FishKilledShow、JumpNumber、
│  │                        WinCircle、WinCircleManager、CoinSpray、BulletHitFx、Tweens
│  ├─ ui/                   DOM HUD：UIRoot（設計座標圖層）、Hud（座位面板、房間）；
│  │                        SkillPanel（右側技能按鈕，overlay 載入原版 Card.csd）
│  └─ features/             可插拔功能
│     ├─ debug/             出獎模式開關、召喚魚選單（§13.7）
│     └─ (gacha/、bossShow/ 下一階段)
└─ tests/                   Vitest
```

### 3.1 分層規則

- `core` 不 import three；`engine` 不 import `game`；`game` 不 import `server-fake`。
- `game` 只透過 `NetClient` 與 server 溝通 → 換真 server 只換 `Transport`。
- 跨系統溝通走 `EventBus`；擴充點走 **Registry**（§9）。

---

## 4. 資源管線

### 4.1 複製（`npm run assets`）

`tools/copy-assets.mjs` 讀 `asset-manifest.mjs`，從 `DragonTycoon3Resource/` 複製到 `public/res/`（相同相對路徑），並：

1. **c3b**：解析材質區塊取得貼圖檔名，連同同名 `.jpg` 一起複製。
2. **efk / efkmat**：掃描檔內 UTF-16 字串取得相依貼圖 / 模型 / 材質；同目錄找不到時以檔名在整個資源樹搜尋，複製到 efk 期望的位置。
3. **plist**：轉成 `*.plist.json`（frames + meta），runtime 不必解析 XML。
4. 輸出 `public/res/manifest.json`（檔案清單，給預載用）。

### 4.2 第一批資源清單

| 類別 | 檔案 |
|---|---|
| 資料 | `Data/PathData.json`、`GroupData.json`、`FishData.json` |
| 場景 | `Models/Scene/Scene03/*`（Scene3.c3b、scene3.jpg、scene3_object.jpg） |
| 龍 1-11 | `Models/Dinosaur/` Egg_01、Egg_02、Egg_Dragon_01、D_Dragon_01、A_Dragon_01、T_Dragon_01（+T_Dragon_02.jpg）、A_Tiger_01、A_Tiger_06、S_Dragon_02、Pterosaur/* |
| 龍 12-14 | 依 `FishDefine.lua` 對應模型 |
| Boss | `Models/Dinosaur_dt3/1_Boss/dt3_boss_005/*`（帝王暴龍） |
| 砲台 | `Models/Character/MountSkin/dt3_cannon_A.*` + shader 貼圖 |
| EFK | `Effekseer/Fireball.efk`；`Effekseer_dt3/Cannon/gunfire_A`、`gunfire_sparkSmoke`、`gunfire_smokeEnd`（+相依） |
| 圖集 | `DinosaurExport/plist/` Coin、Reward_common、Reward_common_D3_1、Effect、FX、MainUI |
| 字型 | `DinosaurExport/fonts/` number_20、number_20_w、d3_num_jp01 |
| 音效 | `Sound/mp3/sound/` C_1、C_2、C_3、se_05A、se_51、se_28E；開砲音、BGM（依 SoundDefine） |

### 4.3 C3bLoader（c3b v0.7）

依 Cocos `Bundle3D::loadBinary` 格式解析：

- Header `C3B\0` + version(2 bytes) + reference table（id / type / offset）。
- **Mesh**：attribute 清單（POSITION / NORMAL / TEX_COORD / BLEND_WEIGHT / BLEND_INDEX…）→ interleaved float；每個 mesh part 一組 `uint16` index + AABB。
- **Material**：id、14 floats、texture 清單（檔名、wrap）。
- **Node**：遞迴；`skeleton` 旗標；part（subMeshId、materialId、bones[]、invBindPose[]）。
- **Animation**：每骨骼 keyframe（`keytime` 為 0..1 正規化 × totalTime；flag bit0 旋轉、bit1 縮放、bit2 位移）。

轉換規則：
- 骨架 → `THREE.Bone` 樹，掛在模型根節點下；每個 part 一個 `SkinnedMesh`，自己的 `Skeleton`（bones 子集 + invBindPose）。
- 綁定用 **attached 模式 + `bind(skeleton, identity)`**，等同 Cocos `palette = boneWorld(相對模型根) × invBindPose`。
- 有骨骼 part 的節點 transform 套到模型根（Cocos `Sprite3D::createNode` 行為：之後設定會覆寫位置/旋轉，僅保留縮放）。
- UV 不翻轉（Cocos shader 做 `v = 1 - v`，等同 three 預設 `flipY = true`）。
- 動畫：整條 take 一個 `AnimationClip`，再依設定 **30fps 影格區間**切子 clip（`Animate3D::createWithFrames`）。
- Loader 回傳「原型」，實例用 `SkeletonUtils.clone`；`AssetManager` 以副檔名分派 loader，未來可加 glTF。

---

## 5. 遊戲物件規格

### 5.1 場景 BGScene

- 模型 `Scene3.c3b`，`rotation (90,0,0)`（Y-up 模型 → Z-up 世界），位置原點、不縮放。
- 材質：unlit 貼圖 × `u_color`，`alphaTest 0.3`，強制寫深度（原版 `sceneTest` technique）。
- 陰影色（Snow）：`(0.145, 0.145, 0.337)`，提供給魚陰影。
- `SceneDefine` 以表格保留其他場景（Forest/Desert…）欄位，本階段只載入 Snow。

### 5.2 龍（Fish）

#### 設定（翻譯自 `FishDefine.lua`）

`FishModelSetting`：`model`、`texture?`、`spriteScale`、`spriteRot`（預設 `(90,0,180)`）、`spriteOffset`、`colliderScale{x,y}`、`hitBox{scale,offset}`、`isFlying`、`runAnimation[]`、`animations{name:{start,end,speed}}`；
`FishCommonSetting`：`hitShakeType`（Small/Middle/Big）、`waitAction[]`；
`FishRewardSetting`：`image`（獎圈頭像）、`winCircle[showType]`；
`FishKillShowSetting`：`bossShowType`。

| # | 名稱 | 模型 | scale | Run 影格 | 賠率 |
|---|---|---|---|---|---|
| 1 | 幼幼龍 | Egg_01 | 1.76 | 0–30 | 2 |
| 2 | 蛋蛋龍 | Egg_02 | 1.76 | 0–18 | 3 |
| 3 | 蛋殼龍 | Egg_Dragon_01 | 1.496 | 0–20 | 4 |
| 4 | 迅猛龍 | D_Dragon_01 | 5.28 | 0–24 | 5 |
| 5 | 冠龍 | A_Dragon_01 | 0.792 | 0–48 | 6 |
| 6 | 三角龍♂ | T_Dragon_01 | 0.88 | 0–20 | 8 |
| 7 | 三角龍♀ | T_Dragon_01 + T_Dragon_02.jpg | 0.792 | 0–20 | 9 |
| 8 | 劍齒虎 | A_Tiger_01，rot(180,0,180) | 0.5544 | 0–20 | 10 |
| 9 | 黃金劍齒虎 | A_Tiger_06，rot(180,0,180) | 0.792 | 0–20 | 50 |
| 10 | 黃金劍龍 | S_Dragon_02 | 8.8 | 0–50 | 60 |
| 11 | 翼龍 | Pterosaur，rot(90,0,0)，offset(0,0,10)，飛行 | 0.88 | 0–30 | 100 |
| 12–14 | 刺甲龍 / 太古劍龍 / 棘龍 | 依 FishDefine | | | 800 / 900 / 1000 |
| 24 | 帝王暴龍（BOSSSHOW） | dt3_boss_005 | 0.2376 | Walk_1 2290–2362 等 | 30000 |

#### 節點結構

```
FishNode (Group)         位置 = 路徑 (x,y,0)；rotation.z = 朝向；scale = spriteScale × 3
└─ SpriteNode            rotation = spriteRot（cocosEuler）；position = spriteOffset
   ├─ SkinnedMesh(es)    FishMaterial
   └─ Shadow mesh(es)    ShadowMaterial（共用 geometry / skeleton）
```

#### 碰撞 / 選取

- 子彈碰撞：**地面 XY 平面的 OBB**；大小 = 模型 AABB(x,y) × `colliderScale` × 節點縮放，跟著 Z 旋轉。
- 3D hitBox（`hitBox.scale/offset`）保留給之後的點選鎖定。

### 5.3 路徑翻譯（`PathMove.lua` → `game/path/PathTrack.ts`）

把整條路徑先編譯成「分段時間軸」，以 `evaluate(t)` 直接求位置（可任意快轉，不必像 cc.Action 逐幀推進）。

**起點**：`wp[0].(x,y)`。
**每個 waypoint 依序產生**：

1. `MoveTo(wp.duration, wp.xy)`：從上一段終點線性移動；`duration = 0` 視為瞬移。
2. `wait > 0` → `Wait(wp.wait)`（若 `wait == waitAction.checkTime` 完全相等：開始時播 `ani`、結束時播 `nextAni`）。
3. `spline` 存在：
   - 一般：**Cardinal Spline**（`cc.CardinalSplineTo`），`tension = spline.tangent`（資料全為 0 → 均勻 Catmull-Rom），**每段時間均分**（忽略 `pt[].duration`），使用絕對座標（`pt[0]` 與當前位置不同會瞬移，原版即如此）。
   - 若 `pt[1..]` 任一點 `wait > 0`：改為**逐段三次 Bézier**，`f = (1 - tangent)/6`，`c1 = p1 + (p2 - p0)·f`、`c2 = p2 - (p3 - p1)·f`，每段時間 `pt.duration ?? spline.duration/(n-1)`，段後接 wait。

Cardinal 公式（`CCActionCatmullRom.cpp`）：

```
deltaT = 1/(n-1); p = floor(t/deltaT); lt = (t - deltaT·p)/deltaT   // t==1 → p=n-1, lt=1
P0..P3 = pts[clamp(p-1 .. p+2, 0, n-1)]
s = (1 - tension)/2
b1 = s(-t³+2t²-t); b2 = s(-t³+t²)+(2t³-3t²+1); b3 = s(t³-2t²+t)+(-2t³+3t²); b4 = s(t³-t²)
pos = P0·b1 + P1·b2 + P2·b3 + P3·b4
```

**不使用的欄位**（原版 client 也沒用）：`IsBezier`、`speed`、`z`、path-level `duration`、`FishData.SwimSpeed`。

**朝向**（`PathMove:UpdateTransform`）：每幀 `dir = pos - lastPos`；`|dir|² ≤ 0.001` 時不轉向也**不更新 lastPos**；否則 `angle = atan2(dir.x, dir.y)`（自 +Y 順時針），three.js `rotation.z = -angle`。飛行龍在天空場景另有傾斜公式（本階段不用）。

路徑走完但尚未到 `deltime` → 停在終點等待（原版行為）。

### 5.4 群組時間軸（`FishTimeline` → `game/timeline/`）

- `GroupData[groupId] = [{fish, path, delay, duration}]`，`fish` 為 **0-based**（type = fish + 1），群組內魚編號 = 陣列順序。
- 魚序號 `serial = groupIndex × 1000 + fishIndex`（與原版一致）。
- 每個 `SubTimeline` 有自己的時鐘；`addtime = delay`、`deltime = delay + duration`；群組在 `max(deltime) + 0.1s` 結束。
- **晚加入 / 同步**：收到 `{groupIndex, groupId, timeline(ms), deadFishes}` → 群組時鐘設為 `timeline/1000`；已過 `deltime` 的魚不生；存活魚 `pathTime = elapsed - delay` 直接 `evaluate`。`deadFishes` 不生。時間只快轉不倒退。
- `deltime` 到 → 直接移除（無動畫）。

### 5.5 砲台（Cannon）

| 項目 | 規格 |
|---|---|
| 模型 | `dt3_cannon_A.c3b`，`spriteRot (90,0,0)`，動畫 30fps：Idle 0–15（loop）、Atk 15–19 |
| 座位 | 3 席，螢幕錨點 `(W/2-320, 44.9)`、`(W/2, 44.9)`、`(W/2+320, 44.9)` → 射線投到 z=0 ≈ `(-39.1,-6.6)`、`(0,-6.6)`、`(39.1,-6.6)`；本人 = seat 0 |
| 瞄準 | 觸控點投到 z=0；`angle = atan2(dx, dy)`（自 +Y 順時針，deg），**clamp ±90°**；`rotation.z = -angle`；只在按住時轉 |
| 開火 | 每發播 Atk 一次後回 Idle；砲口骨骼 `GunFire` + offset (0,2,0) 播 `gunfire_A.efk`（scale 0.5，0.6s） |
| 過熱 | `fireFactor += 0.05`/發（上限 1.0）；每 5 發且 > 0.8 播 `gunfire_sparkSmoke`（0.75）；停火 0.32s 後若 > 0.4 播 `gunfire_smokeEnd`（1.5）；再 0.15s 後以 1/s 衰減；shader 依 fireFactor 加熱光 |
| 押注 | 押注表由 server 給；±1 格、兩端夾住；不影響砲台外觀；扣款 = bet × costRate（Normal = 1） |

### 5.6 子彈（Bullet）

| 項目 | 規格 |
|---|---|
| 視覺 | `Effekseer/Fireball.efk`，節點 scale 0.5，離地 2（`GroundDist`） |
| 起點 | 砲口骨骼世界座標沿相機射線投到 z=0 |
| 速度 | 170 單位/秒，方向 `(sin a, cos a)` |
| 射速 | `ShootCD` 0.12s；按住連射、點一下單發；自動模式同 CD |
| 反彈 | 撞牆多邊形 → 以法線翻轉速度軸（`|n.x|>0.5` 翻 x、`|n.y|>0.5` 翻 y）；**第 3 次碰牆消失**（存活 < 0.5s 例外） |
| 壽命 | 35s；每 1s 移除牆外子彈 → 送 DUD |
| 碰撞 | 子彈 OBB 10×10×0.5×0.5 vs 魚 OBB（XY 平面）；命中一隻即消失 → 送 HIT、播受擊表演、播命中特效 |
| 命中特效 | `Fire_Normal_Hit`（原 csb）→ 以 `Effect.plist` 影格重做的 billboard 序列幀，scale 0.1 |
| 上限 | 同時 30 發（原版沒生效，此版生效） |

### 5.7 Shader / 材質

| 材質 | 對應原版 | 內容 |
|---|---|---|
| `FishMaterial` | `shader_3d_skin_position_tex` + `shader_3d_color_tex` | unlit：`tex × u_multColor + (1 - u_color)`，alpha × `u_color.a`；**bleach**：`mix(c, vec3(scalar), rate × pow(1 - n·v, pow))`，預設 pow 3.5 / scalar 1.7 |
| `ShadowMaterial` | `shader_3d_skin_position_tex_z0` + `shader_3d_shadow` | 世界座標 `x -= z·0.3; y += z·0.8; z = min(0.1, z)`；色 = 場景陰影色、alpha 0.45；depthWrite off；**stencil 128 NOTEQUAL/REPLACE** 防重疊變深 |
| `SceneMaterial` | `ground.material: sceneTest` | 貼圖 × u_color，alphaTest 0.3（預留 Iris 轉場 uniform） |
| `CannonMaterial` | `normal_matCap_mask_changeTexture` | 貼圖 + 過熱貼圖（`u_fireFactor`）+ 法線貼圖擾動的 matcap（reflectivity 1.0、normalFactor 0.8） |

全部用 `ShaderMaterial` + three 內建 skinning chunks。場景無燈光（原版也沒有）。

### 5.8 EFK（`engine/effekseer/EfkSystem.ts`）

- 啟動時 `initRuntime(wasm)` → `createContext().init(renderer.getContext())`。
- 每幀：`update(dt × 60)` → three render 後 `setProjectionMatrix(camera.projectionMatrix)`、`setCameraMatrix(camera.matrixWorldInverse)`、`draw()` → `renderer.resetState()`。
- API：`play(setting, attachTo?: Object3D)` → `EfkHandle`。`setting = {file, position, rotation, scale, speed, duration(預設 3, -1=loop), delay, maxConcurrent(預設 6)}`（對應原版 `EFK_SETTING`）。
- 跟隨：有 `attachTo` 時每幀 `handle.setMatrix(attachTo.matrixWorld × local)`（原版 emitter = 節點世界矩陣）。
- 效果快取 + 每檔併發上限；`stop()` 後釋放。

---

## 6. 假 Server

### 6.1 通訊

- `Transport` 介面：`send(msg)`、`onMessage(cb)`；`LocalTransport` 以 `setTimeout` 模擬 20–60ms 延遲並 JSON 複製（確保不共享物件參考）。
- 訊息沿用原版名稱 / ID（精簡欄位）：

| 方向 | 訊息 | 主要欄位 |
|---|---|---|
| C→S | `U2G_LOGIN_REQ` | — |
| S→C | `G2U_ROOM_DATA_NOTIFY` | `yourseat, sceneType, seats[], betList, timeline` |
| C→S | `U2G_SYNC_SCRIPT_REQ`(106) | — |
| S→C | `G2U_SYNC_SCRIPT_ACK`(106) / `G2U_ADD_GROUP_SYNC_NOTIFY`(107) | `timeline, list:[{groupIndex, groupId, timeline, isPause, deadFishes}]` |
| C→S | `U2G_SHOOT_REQ`(104) | `bulletId, bulletType, bet, angle` |
| S→C | `G2U_SHOOT_NOTIFY`(104) | `seat, bulletId, bet, angle, seatMoney` |
| C→S | `U2G_HIT_REQ`(55) | `bulletId, scriptIdDataVec:[{groupIndex, fishIndex}]` |
| C→S | `U2G_DUD_REQ`(56) | `bulletId` |
| S→C | `G2U_KILL_FLOATODDS_FISH_NOTIFY`(118) | `seatIndex, scriptIdData, fishType, showType, money, seatMoney, bet, floatedOdds, floatedRate, unDead, killIndex` |

### 6.2 模組

- **RoomModule**：單人房、3 席（本人 seat 0，其餘空）、初始餘額 31,708,504、押注表 `[10, 50, 100, 500, 1000, 5000]`、場景 Snow。
- **ScriptModule**（原版排程程式碼不在 repo，以下為自訂設定，可調）：

| Kind | 間隔 | 候選群組（權重） |
|---|---|---|
| small | 4s | 只含魚 1–9 的群組 |
| medium | 15s | 含魚 10–11 的群組 |
| big | 45s | 含魚 12–14 的群組（20–25） |
| boss | 120s | 群組 35（帝王暴龍） |

  開場依 20–40s 偏移回填（模擬進入時場上已有魚）；`groupIndex` 用空槽重複利用；伺服器端追蹤每隻魚存活窗 `[delay, delay+duration)` 與死亡名單。
- **ShootModule**：開砲扣 `bet × costRate`（餘額不足拒絕）；HIT 查子彈與魚是否有效 → 交給 RtpEngine；DUD 退款（可設定）。

### 6.3 RTP 110%

每條魚有賠付結果表 `outcomes: [{showType, rate, weight, unDead, odds?}]`：

```
E = Σ(weight × odds × rate) / Σweight          // 期望賠率
P(中獎) = min(1, RTP / E)                       // RTP = 1.10
中獎 → 依 weight 抽一個 outcome → money = bet × odds × rate
```

每顆命中的子彈期望回收 = 1.10 × bet。`RtpEngine` 累計投注 / 派彩 / 實際 RTP 給 debug 面板；Vitest 以 100 萬次模擬驗證收斂在 110% ± 1%。

| 魚 | outcomes（第一版） |
|---|---|
| 1–8 | `{showType 1, rate 1}` |
| 9–11 | `{showType 1, rate 1}` → 獎圈 Middle |
| 12–14 | `{1, ×1, w70}`、`{2, ×5, w20}`、`{3, ×10, w9}`、`{4, ×100, w1}` → 獎圈 Big + 倍數字 |
| 24 帝王暴龍 | `{1, odds 30, unDead, w95}`（小獎不死）、`{3 = BOSSSHOW, odds 300, w5}`（死亡） |

---

## 7. 擊殺表演

### 7.1 分派（`KillShowRegistry`）

```
收到 118 KILL_FLOATODDS
  fish = alive[serial]；找不到 → 只更新餘額
  isBossShow = (fishKillShow.bossShowType != null && showType == bossShowType)
  handler = isBossShow ? registry.bossShow(fishType) : registry.get(fishType)
  handler 不存在 → SmallWinShow（預設）
SmallWinShow(content):
  if winCircle(fishType, showType) != None → 獎圈（座位）
  else                                      → 跳字「+N」（魚的位置）
  噴錢（money > 0）
  if !unDead → 魚死亡表演；else 魚繼續走
```

### 7.2 BOSSSHOW 降級規則

本階段**不註冊任何 BossShow handler**，所以 `showType == bossShowType` 一律走 `SmallWinShow`：
- `unDead = false` → **小獎 + 死亡**（Big 獎圈 + 噴錢 + 死亡表演）
- `unDead = true`  → **小獎不死**（獎圈 / 跳字 + 噴錢，魚繼續走路徑）

之後做 BossShow 時只要 `registry.registerBossShow(24, TRexBossShow)`，不用改分派流程。

### 7.3 受擊（`FishHitShow`，只對本人子彈）

- Bleach：每 0.05s 一步、共 5 步，`rate = 1 - (1 - p)²`（0.36→1.0），結束歸 0；進行中不重觸發。
- 抖動：沿本地 X `+off, -2off, +off` 再回原位；Small 0.2/0.1s/×2、Middle 0.1/×1、Big 0.02/×1；0.3s 冷卻。

### 7.4 死亡（`KilledShowNormal`）

停止路徑；Run 動畫 2 倍速 loop；
`0–0.2s` z +15 → `0.2–0.4s` scale ×1.1 → `0.4–0.6s` z -15，同時 `0.4–0.7s` 淡出 → `0.9s` 回收。無特效、無音效。

### 7.5 跳字（無獎圈時）

字型 `number_20.fnt`，文字 `+1,234`，位置 = 魚 hitBox 中心投影 −10y，scale 0.8：
`Delay 0.3 → MoveBy(0.5, (0,30)) → Delay 0.3 → FadeOut 0.3`（共 1.4s）。

### 7.6 獎圈（WinCircle）

| 類型 | 底圖（Reward_common） | 用途 |
|---|---|---|
| Min | `Reward_Small.png` | （保留） |
| Middle | `Reward_Middle.png` | 魚 9–11 |
| Big | `Reward_Big01.png` + `reward_big1.png` + 倍數字 `5/10/100TimesReward_word.png` | 魚 12–14、BOSSSHOW 降級 |

- 組成：光暈 `SunLight`/`Light_reward` + 外框 + 頭像 `D3_xx.png`（Reward_common_D3_1）+ 數字 `d3_num_jp01.fnt` + 星星 `star_B.png`。
- 位置：**本人座位錨點**（不在魚身上），整體 scale 0.8；同座位最多 6 個，槽位偏移 `(0,0) (-120,-30) (120,-30) (0,90) (-120,60) (120,60)`。
- 動畫（原 csb timeline，60fps）：`start` 0.75s（外框 0.36→1.1/1.23→1.09/0.75→1.29 彈跳；頭像 0.3→1.3 旋轉 -21→0；數字 0.47→0.9→0.75）→ 停留 → 該座位最後一個獎圈出現 **1.5s 後**全部 `end`（0.33s 縮小消失）。
- 數字**不滾動**，直接設值（原版即如此）。
- 音效：Small/Middle/Big → `C_1/C_2/C_3`；Big 時相機震動 3 次、0.8。

### 7.7 噴錢（CoinSpray）

金幣：`Coin.plist` `dt3_ef_coin_01..10`，0.07s/幀 loop，43×43，Overlay2D。目標 = 本人砲台座標。

| 條件（floatedOdds） | 模式 |
|---|---|
| < 10 | **Drop**：數量 `max(1, floor(min(money/bet, 30)/2))`；起點魚位置 + (±30, 0)；`Delay 0.1i → JumpBy(0.6, h50) → JumpBy(0.4, h25) → MoveTo(dist/1500)`；音效 `se_05A` |
| ≥ 10 / 90 / 10000 | **Explosion** 1 / 2 / 4 圈：每圈 `4/8/16/32` 枚，半徑 `30 + 45(ring-1)`；`EaseIn(MoveBy 0.105, 極座標, 0.3)` 同時 `JumpBy(0.42,h50) → JumpBy(0.21,h25)` → `Delay 0.056i` → `MoveTo(dist/2143)`；音效 `se_51` |

第一枚到達時在餘額欄位上方跳「+N」；餘額以 server `seatMoney` 為準。

---

## 8. HUD（DOM，設計座標 × 縮放）

- 底部 3 個座位面板：x = W/2 + (-320, 0, 320)。本人：押注框（數值）+ 餘額框（金幣圖示 + 千分位）+ `−` / `+` 按鈕；空位：「等待加入」。
- 右側：自動（toggle，同 ShootCD 連射當前角度）；其他按鈕先放外觀。
- 左上：房間名稱。
- 圖片優先使用 `MainUI.plist` 影格（`SpriteSheet → CSS background`），缺的用 CSS 樣式補。

---

## 9. 擴充機制

### 9.1 Feature（外掛）

```ts
interface GameFeature {
  readonly id: string;
  readonly deps?: string[];
  install(ctx: GameContext): void | Promise<void>;   // 註冊事件、UI、render pass、registry
  update?(dt: number): void;
  dispose?(): void;
}
// GameContext = { events, services, stage, assets, efk, audio, net, ui, registries }
```

`FeatureManager` 依 `deps` 排序安裝；`app/features.ts` 是唯一的開關清單。

### 9.2 Registry（擴充點）

| Registry | 狀態 | 用途 | 之後的擴充 |
|---|---|---|---|
| `FishClassRegistry` | ✅ | `fishClass` → Fish 類別（已有 `normal`、`trex`） | 其他 Boss 專用 Fish |
| `KillShowRegistry` | ✅ | fishType / bossShow → 表演 handler（預設 `SmallWinShow`） | `registerBossShow(24, TRexBossShow)` |
| `FakeServerModule` | ✅ | `server.use(module)`：訊息 → handler + tick | `GachaModule` |
| 協定 declaration merging | ✅ | `declare module '@net/protocol'` 加訊息 | 抽卡訊息 |
| `Stage.addPass` | ✅ | 插入自訂 render pass | 抽卡 3D 展示 |
| `BulletBehaviorRegistry` | ✅ | 子彈 kind → 行為（track / lightning / laser） | 新特殊子彈 |
| `CsdLibrary` | ✅ | 載入原版 csd 動畫（§13.6） | 抽卡卡牌、BossShow |
| `SceneRegistry` | 預留 | sceneType → 場景建構 | 其他場景、轉場 |

### 9.3 資源 Bundle（預留）

目前由各系統的 `preload()` 載入。之後加 `AssetManager.loadBundle(name, list)`；每個 Feature 宣告自己的 bundle，進入功能時才載入；`tools/asset-manifest.mjs` 也依功能分 group。

---

## 10. 下一階段：抽卡（Gacha）預留

- `features/gacha/`：`GachaFeature`（install 時註冊按鈕、面板、render pass）、`GachaSystem`（狀態）、`GachaView`（卡牌 3D 展示，可用原版 `Card.csb` / `ItemCard` 素材）。
- `server-fake/modules/GachaModule`：卡池、機率表、保底、扣款；訊息 `U2G_GACHA_DRAW_REQ` / `G2U_GACHA_DRAW_ACK`。
- UI 走 `UIRoot` 的 `panel` / `modal` 圖層，不碰戰鬥 HUD。

---

## 11. 里程碑

| # | 內容 | 驗收 | 狀態 |
|---|---|---|---|
| M0 | 規格、資料夾、Vite 骨架、資源複製工具 | `npm run dev` 開得起來；`npm run assets` 複製成功 | ✅ |
| M1 | Stage、相機、雪地場景、C3bLoader、龍 + 動畫 + 陰影 | 畫面角度與原版截圖一致 | ✅ |
| M2 | PathTrack、群組時間軸、假 server 排程 | 龍依原版路徑走；路徑 872 總長 149.28s 與群組一致 | ✅ |
| M3 | 砲台、瞄準、子彈、反彈、碰撞、EFK | 可射擊、子彈反彈、砲口 / 冷卻特效 | ✅ |
| M4 | RTP、受擊、死亡、跳字、獎圈、噴錢、BOSSSHOW 降級 | 完整擊殺流程；RTP 模擬 110% ± 1.5% | ✅ |
| M5 | HUD、自動、音效、debug 面板 | 畫面接近附圖 | ✅ |

---

## 12. 已知差異 / 風險

| 項目 | 說明 |
|---|---|
| 原版排程演算法缺失 | `CasinoFishBase` 不在 repo，群組排程為自訂（`server-fake/config/scheduleConfig.ts`） |
| csb 動畫 | three 無法讀 csb；獎圈 / 命中特效依 timeline 關鍵影格以 Tween 重做，版面為近似值 |
| 獎圈錨點 | 原版 SeatInfo `WinCircleAP` 座標未取得，暫定座位錨點上方 190（`WIN_CIRCLE_ANCHOR_OFFSET_Y`） |
| 魚碰撞盒大小 | 原版用 `Sprite3D` contentSize（引擎原始碼查不到賦值處）；此版用「模型在地面 XY 的範圍 × ColliderScale」，需要時微調 |
| 飛行魚 | 原版一般子彈不打飛行魚（需鎖定彈）。本階段沒有鎖定彈，改為可打，且碰撞中心取「模型中心沿視線投到地面」（`NORMAL_BULLET_HITS_FLYING`） |
| DUD 退款 | 沒打到魚的子彈（撞牆 3 次 / 出界 / 超時）假 server 會退款（`ShootModule.refundDud`） |
| 子彈上限 | 原版 30 發上限實際沒生效，此版生效 |
| c3b 多 part 共用頂點 | 各 part 骨骼表不同，three 自行算包圍體會越界 → 載入時以 c3b AABB 預設包圍體（`presetSkinnedBounds`） |
| 物件池 | 魚目前每次生成都 clone；之後可加池化（原版 `ModelMgr:pop/push`） |
| EFK 版本 | 少數舊版 efk（v13）未在第一批使用 |
| 效能 | 魚 SkinnedMesh 每隻獨立；之後可做 instancing / 動畫烘焙 |

---

## 13. 第二階段：技能按鈕、特殊子彈、測試工具

> 來源：原版 `Card.csd`、`SkillCtrlView.lua`、`SkillCtrlViewBase.lua`、`BulletDefine.lua`、`CannonDefine.lua`、
> `BulletLightning.lua`、`LockShootEffect.lua`、TMDCommon `TestSummonContent.lua` / `TestCheatModeContent.lua`

### 13.1 右側技能按鈕（原版 `main/Card.csd`）

- 位置：Main.csd 的 Card 節點 (1131, 150)，靠右下對齊 → x = W − 5、y = 150；按鈕 90×90、anchor (1, 0.5)。
- 直接用 CSD 執行環境（§13.6）載入 `Card.csd`，圖片、位置、子節點與原版一致。

| 按鈕 | 圖片（plist） | 功能 | 子彈類型 | 權重 |
|---|---|---|---|---|
| ImgBtn_1 橘·準心 | `Aim.png`（MainUI） | 自動瞄準（AutoShoot） | Lock | 1 |
| ImgBtn_2 紅·火箭 | `Torpedo.png`（MainUI） | 榴彈砲（Skill_1） | Focus | 2 |
| ImgBtn_4 紫·漩渦 | `Lightning_v2.png`（Bullet_dt3） | 紫雷擊＝擴散彈（Skill_3） | Advanced | 2 |
| ImgBtn_3 金·無人機 | `Drone.png`（MainUI） | 巡光炮（Skill_2） | LaserLock | 2 |
| ImgBtn_5 綠·自動 | `AIAuto.png`（MainUI） | 自動射擊（AIAuto） | Lock | 1 |

- 狀態：按下 0.2s 縮到 0.85、放開回 1；停用 = 灰 (128,128,128)；開啟 = 顯示 `ActEff`（原版粒子 `effect/Auto.plist`，以 `cannonef04_2.png` 旋轉光暈近似）與 `Cost`（`Block_6` + 金幣 + `number_7_0.fnt`，顯示「押注 × 倍率」）。
- 紫色按鈕常駐 `Card_lighting.csd`：關閉播 `idle_normal`、開啟播 `idle_click`（loop）。
- 規則（SkillCtrlView）：
  - 自動瞄準（1）與自動（5）互斥；三個技能（2、3、4）互斥；瞄準可以和技能同時開。
  - 子彈類型 = 開啟中權重最高者；全關 = 一般子彈（直線、會反彈）。
  - auto = 按鈕 1 或 5 開啟。
  - 手動技能（技能開、auto 關）：點到魚 → 鎖定，按住才射；點空白不射。

### 13.2 特殊子彈（SpecialBulletDefine）

| 類型 | 成本倍率 | ShootCD | 砲台外觀 | 限制賠率 | 行為 |
|---|---|---|---|---|---|
| None 一般 | 1 | 0.12 | A | – | 直線、撞牆反彈（第一階段） |
| Lock 鎖定 | 1 | 0.1 | A | – | 拋物線追蹤彈（Fireball.efk，速度 150），必中 |
| Focus 榴彈砲 | 5 | 0.25 | B | ≥ 6 | 拋物線追蹤彈（Weapon_Big_Bomb.efk，速度 200），必中；命中 `dt3_cannon_B_Hit`；**原版沒有範圍傷害** |
| Spread 雷擊 | 15 | 0.4 | C | – | 同 Advanced（原版沒有按鈕，保留定義） |
| Advanced 紫雷擊 | 20 | 0.4 | C + D 貼圖 | – | 擴散：主目標 + 範圍 60 內其他魚，共 3–6 條（§13.4） |
| LaserLock 巡光炮 | 30 | 0.4 | E + 無人機 ES | ≥ 16 | 雷射光束，每 0.4s 一次傷害（§13.5） |

- 追蹤彈拋物線（BulletPathMove3dTrack）：`movTime = max(dist/speed, 0.1)`、`h = 50 × movTime`；前半 `h·4t(1−t)`（t=u·0.5）、水平線性到中點；後半 `(1−t)·h`、水平 `0.5 + √t·0.5`；每幀重讀目標位置（追蹤）。
- 砲台外觀切換（CannonView）：A = Normal/Lock、B = 榴彈、C = 雷擊、C+`dt3_cannon_D.jpg` = 紫雷擊、E = 雷射；動畫 Idle 0–15、Atk 15–25（B/C/E）。
- 音效：Lock = MG_3、Focus = MG_4、雷擊 = MG_5、雷射 = MG_6、按鈕 = S_24、換鎖定目標 = L_4。

### 13.3 鎖定

- 自動選目標（BulletModel:LockFish）：目前目標還活著就保留；否則同種最近的魚；否則畫面內最高賠率（並符合限制賠率）。
- 點選（FishBase 3D 射線）：相機射線 vs 魚的 hitBox（OBB），多隻時取最高賠率；點到的魚優先。
- 準心 `main/LockAim_Anim.csd`：`start`（0–15）→ `loop`（20–80），每幀跟著魚的 lockPos 投影位置；換目標播 L_4。

### 13.4 紫雷擊（擴散彈）

- 目標：鎖定魚 + 距離 60 內其他可打的魚，總數 `random(2,5) + 1`（3–6 條）。
- 子彈 `Bullet_dt3/dt3_cannon_C_Bullet_purple.csd`（billboard），3D 直線 500/s 飛向主魚 lockPos。
- 命中：一個 `U2G_HIT_REQ` 帶全部目標；主魚播 `dt3_cannon_C_Hit_purple.csd`；主魚白閃 0.7s、其他 0.3s，依「與主魚的距離 / 60 × 0.3s」延遲（原版以世界原點算距離是 bug，此版改以主魚）；縮放脈動 ±4%（小魚 ±3%）。
- 被雷擊打死的魚依同樣延遲依序死亡。

### 13.5 巡光炮（雷射）

- 每 0.4s 一發（成本 押注×30），以 2D 直線 1000 px/s 計算抵達時間後命中。
- 光束 `Bullet_dt3/dt3_cannon_E_laser.csd`：放在砲口投影位置、轉向目標；`Line` 節點 scaleY = 長度 / 250、`Hit` 節點放在末端；每次射擊重設 3 次 `loop`（0–16），用完或 0.5s 沒射擊播 `end`（20–36）。
- 無人機 `dt3_cannon_ES.c3b` ×2 掛在骨骼 `dt3_cannon_ES_R / _L`（scale 2、rotation (−90,180,−90)）。

### 13.6 CSD 執行環境（`src/engine/csd/`）

- `tools/copy-assets.mjs` 把 Cocos Studio 原始檔 `.csd`（XML，位於 `TMD_CocosStudio_DragonTycoon3/CocosProject/cocosstudio`）轉成 `.csd.json`，放在與 `.csb` 相同的路徑，並自動複製相依的 plist、字型、子 csd。
- 支援節點：SingleNode、Sprite、ImageView、TextBMFont、ProjectNode（巢狀 csd）、Panel、Button；Particle 以旋轉光暈近似。
- Timeline：Position、Scale、RotationSkew、Alpha、VisibleForFrame、FileData、BlendFunc、CColor、AnchorPoint、FrameEvent；`Tween=False` 為階梯；EasingData 對照 cocos tweenfunc；第一個 key 之前取第一個 key、最後一個之後取最後一個（cocostudio Timeline 行為）。
- 60 fps；依 `AnimationList` 名稱播放、可 loop；opacity / color 向子節點層疊（CSLoader 預設）；子節點座標原點 = 父節點左下角。
- 用途：技能按鈕、準心、雷擊子彈、命中特效、雷射；之後抽卡可直接載入原版卡牌 csd。

### 13.7 Debug 面板（改版）

| 項目 | 行為 |
|---|---|
| A 出獎模式 | 按鈕顯示目前狀態「出獎模式：開啟 / 關閉」。送 `U2G_DEBUG_CLIENT_TOOL_USE_REQ {toolType: 1, target: 1/0}`；假 server 開啟時每次命中必中獎（原版 SetCheatList） |
| B 召喚魚 | 按下開選單：篩選框 + 清除鈕，列表「`<groupId>-<名稱>`」依 groupId 由大到小（原版 TestSummonUI）。名單 = 原版 `GroupIdMap` + 本版支援魚種的一般群組；本版不支援的反灰。送 `{toolType: 2, target: groupId}`，server 立即加入群組（107） |

- 回應：`G2U_DEBUG_CLIENT_TOOL_USE_ACK {toolType, errorCode}`（0 = 成功）。
- 按 ` 鍵開關面板。

### 13.8 協定 / RTP 變更

- `U2G_SHOOT_REQ.bulletType` = SpecialBulletType（0–5）；成本 = 押注 × 成本倍率。
- `scriptIdDataVec`：一般 = []；鎖定 / 榴彈 / 雷射 = [目標]；雷擊 = 全部目標、`angle = 0`。`U2G_HIT_REQ` 同。
- 假 server：一顆子彈的期望派彩 = RTP × 成本，以「注水法」分給命中的魚（`RtpEngine.judgeMulti`）：每條魚最多吸收自己的期望賠率（機率 = 1），吸收不了的分給其他魚；賠付 = 押注 × 賠率 × 倍率。雷擊打到多條小魚時 RTP 仍維持 110%（總容量不足時才會低於）。
- 單一目標的高成本子彈（雷射 ×30）打低賠率魚時機率會到上限 1 → 該發 RTP 低於目標；原版以限制賠率（≥16）避免。

### 13.9 本階段簡化

| 項目 | 說明 |
|---|---|
| 自動（AIAuto）設定面板 | 原版會開「智慧篩選」設定（魚種優先順序、發數、停止條件）；此版按下直接開關，目標 = 最高賠率，保留目前技能 |
| 無人機飛行 | 原版無人機會飛到目標附近並射擊（純表演）；此版靜態掛在骨骼上 |
| 粒子 | 按鈕 ActEff 等粒子以旋轉光暈近似 |
| 他人子彈 | 單人房，不處理他人同步子彈 |
