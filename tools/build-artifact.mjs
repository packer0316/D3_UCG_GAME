/**
 * 建置 claude.ai Artifact 發佈版（npm run build:artifact -- <輸出資料夾>）。
 *
 * Artifact 只提供網頁常見的檔案類型，所以：
 * - VITE_PACKED_BINARY=1 + 相對路徑（--base=./）建置；src/app/packedBinary.ts 在執行期把 *.b64.txt 還原成 ArrayBuffer
 * - VITE_DEBUG=1：開放 debug 面板（Artifact 網址不能加 ?debug）
 * - .c3b / .efk / .efkmat / .efkmodel / .bin → 同名 + .b64.txt（base64 文字），刪掉原檔
 * - 執行期用不到的檔案刪掉：原始 TexturePacker .plist（遊戲讀 *.plist.json）、.d.ts、.md
 * - 輸出上傳批次 <輸出資料夾>-batches.json：每批 ≤ 250 檔、≤ 60 MB；不在 Artifact 預設類型的副檔名附上 contentType
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const out = resolve(process.argv[2] ?? 'dist-artifact');
const PACK = new Set(['.c3b', '.efk', '.efkmat', '.efkmodel', '.bin']);
const DROP = (rel) => rel.endsWith('.plist') || rel.endsWith('.d.ts') || rel.endsWith('.md');
/** Artifact 不認得的副檔名 → 實際內容的類型 */
const CONTENT_TYPE = { '.fnt': 'text/plain', '.gltf': 'application/json' };
const MAX_FILES = 250;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_FILE_BYTES = 15.5 * 1024 * 1024;

execSync(`npx tsc --noEmit && npx vite build --base=./ --outDir "${out}" --emptyOutDir`, {
  stdio: 'inherit',
  shell: true,
  // VITE_DEBUG：Artifact 網址不能加 ?debug，直接開放 debug 面板（` 鍵開關）
  env: { ...process.env, VITE_PACKED_BINARY: '1', VITE_DEBUG: '1' },
});

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

let packed = 0;
let dropped = 0;
for (const file of walk(out)) {
  const rel = relative(out, file).split(sep).join('/');
  if (DROP(rel)) {
    rmSync(file);
    dropped++;
  } else if (PACK.has(extname(file).toLowerCase())) {
    writeFileSync(file + '.b64.txt', readFileSync(file).toString('base64'));
    rmSync(file);
    packed++;
  }
}

const files = walk(out)
  .map((f) => ({ rel: relative(out, f).split(sep).join('/'), size: statSync(f).size }))
  .filter((f) => f.rel !== 'index.html')
  .sort((a, b) => a.rel.localeCompare(b.rel));
const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
if (tooBig.length) throw new Error(`檔案超過單檔上限：${tooBig.map((f) => f.rel).join(', ')}`);

const batches = [];
let cur = null;
for (const f of files) {
  if (!cur || cur.count >= MAX_FILES || cur.bytes + f.size > MAX_BYTES) batches.push((cur = { count: 0, bytes: 0, files: {} }));
  const type = CONTENT_TYPE[extname(f.rel).toLowerCase()];
  cur.files[f.rel] = type ? { from: f.rel, contentType: type } : f.rel;
  cur.count++;
  cur.bytes += f.size;
}
writeFileSync(`${out}-batches.json`, JSON.stringify(batches.map((b) => b.files)));

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`\n打包 ${packed} 個二進位檔、刪掉 ${dropped} 個用不到的檔案；共 ${files.length} 檔 + index.html，${mb(files.reduce((s, f) => s + f.size, 0))} MB`);
batches.forEach((b, i) => console.log(`  批次 ${i + 1}: ${b.count} 檔、${mb(b.bytes)} MB`));
console.log(`上傳批次：${out}-batches.json`);
