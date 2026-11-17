# 龍魂召喚

抽卡首頁、單抽、十連、卡池一覽與收藏頁共用全幅卡片元件。共有 36 張對應卡圖：23 種龍、6 個場景（含初始森林）、7 件裝飾；抽卡池中實際為 35 種。

## 卡色與機率

| 卡面 | 遊戲稀有度 | 用途 |
| --- | --- | --- |
| 白銀 | N | 普通 |
| 蒼藍 | R | 稀有 |
| 幻紫 | SR | 史詩 |
| 鎏金 | SSR | 傳說 |
| 緋紅 | SSR | 帝王暴龍、翔空蒼龍的特別卡面 |

基礎機率仍為 62% / 27% / 9% / 2%，十連保底 R 以上。緋紅不是第五個遊戲稀有度，不改動卡池、扣券、保底、重複轉換或存檔格式。

## 演出與互動

- 召喚券不足時顯示取得方式，按鈕停用；請求與演出期間鎖住重複抽取。
- 卡背入場 → 能量蓄積 → 逐張 3D 翻卡；高稀有度最後揭曉。十連的 SSR 另有中央卡片特寫、傳說字幕與衝擊。
- 一張共享 WebGL 畫布負責 domain-warped FBM 煙霧、流動卡緣光焰、餘燼、能量衝擊與光暈；卡面以 CSS 3D 與箔光處理滑鼠視差。
- 可切換音效、跳過演出、放大鑑賞、依龍魂／領域／造物篩選卡池；收藏頁沿用等級與升級操作。
- 關閉取消動畫計時器，保留已取得的結果；請求尚未回來時，重新開啟仍會鎖定，晚到的結果可在下次開啟查看。
- Escape 先關閉卡片鑑賞／卡池，第二次才關抽卡面板。面板內有鍵盤焦點循環與狀態朗讀。
- 特效以 30 fps 更新，畫布上限 1300 × 900；關面板／分頁隱藏時停止繪製。WebGL 無法初始化時保留卡面與 CSS 演出；減少動態效果偏好直接顯示結果。
- 使用遊戲設計座標的 container queries：桌面十連為 5 × 2，直向窄畫面改為可捲動的 2 或 3 欄。

## 素材與維護

- `public/res/gacha/illustrations/`：8 張 WebP 插畫檔，包含獨立蒼龍插畫與其餘角色／場景／裝飾圖集。
- `public/res/gacha/sanctuary.webp`、`card-back.webp`：召喚聖殿與雕刻金屬龍紋卡背。
- 以上美術使用內建 `image_gen` 生成；完整最終提示詞在 [GACHA-ART-PROMPTS.json](GACHA-ART-PROMPTS.json)。以專案 C3B 模型輸出作為龍族身份參考，卡面是美術重新詮釋。
- `public/res/gacha/portraits/`：36 張原模型輸出的參考圖。`tools/gacha-art.html` / `gacha-art.ts` 為只在開發階段使用的輸出工作室，不進入主遊戲 bundle。
- `GachaArtwork.ts` 定義圖集格位；新增物品時需一併補插畫映射。測試會檢查全卡池覆蓋、格位唯一與圖集比例。
- `tools/import-gacha-art.mjs <manifest.json>` 只轉為 WebP，不重新生成、不修改原始圖；manifest 是 `[{ "source": "原圖絕對路徑", "destination": "輸出路徑" }]`。

## 驗證

```powershell
npm run build
npm test
# 瀏覽器工具為選用的開發依賴，未變更專案套件清單。
npm install --no-save --package-lock=false playwright
npm run dev
# 另一個終端機；使用獨立無頭 Edge，不使用玩家的瀏覽器存檔。
node tools/check-gacha-ui.mjs
```

瀏覽器檢查包含實際十連扣券、連點阻擋、跳過、全部卡色、SSR 特寫、單抽、收藏、卡池篩選、關閉中的延遲回覆、失敗恢復、直向畫面和減少動態效果；畫面輸出在 `node_modules/.cache/gacha/`。測試用的固定全卡色結果只存在於自動化腳本，不會加入正式遊戲。
