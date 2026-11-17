#!/usr/bin/env node
// 依 asset-manifest.mjs 從原版 DragonTycoon3Resource 複製資源到 public/res（保留相對路徑）
// - c3b：解析材質貼圖並一起複製
// - efk / efkmat：掃描檔內 UTF-16 字串找相依貼圖 / 模型 / 材質
// - fnt：複製頁面圖
// - plist：複製貼圖並輸出 *.plist.json（runtime 不必解析 XML）
// 用法：npm run assets   （可用環境變數 D3_SRC 指定原版資源根目錄）
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_ROOT, CSD_SOURCE_ROOT, groups } from './asset-manifest.mjs';
import { listC3bTextures } from '../src/engine/loaders/C3bParser.ts';
import { parseCsd, listCsdDeps } from '../src/engine/csd/CsdParser.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEST_ROOT = resolve(here, '../public/res');
const SRC = resolve(SOURCE_ROOT);
const CSD_SRC = resolve(CSD_SOURCE_ROOT);

if (!existsSync(SRC)) {
  console.error(`找不到原版資源目錄：${SRC}\n請設定環境變數 D3_SRC`);
  process.exit(1);
}

// ---------- 小工具 ----------
const toPosix = (p) => p.replace(/\\/g, '/');
const rel = (abs) => toPosix(relative(SRC, abs));

let basenameIndex = null;
function findByBasename(name) {
  if (!basenameIndex) {
    basenameIndex = new Map();
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else {
          const k = e.name.toLowerCase();
          if (!basenameIndex.has(k)) basenameIndex.set(k, []);
          basenameIndex.get(k).push(p);
        }
      }
    };
    walk(SRC);
  }
  return basenameIndex.get(name.toLowerCase()) ?? [];
}

function expand(pattern) {
  if (!pattern.includes('*')) return [join(SRC, pattern)];
  const dir = join(SRC, posix.dirname(pattern));
  const re = new RegExp('^' + posix.basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => join(dir, e.name));
}

// ---------- plist（TexturePacker XML）解析 ----------
function parsePlistXml(xml) {
  const tokens = xml.match(/<\/?[a-zA-Z]+\/?>|[^<]+/g).filter((t) => t.trim() !== '' || false);
  let i = 0;
  const skipWs = () => {
    while (i < tokens.length && !tokens[i].startsWith('<')) i++;
  };
  const readText = (tag) => {
    let text = '';
    while (tokens[i] !== `</${tag}>`) text += tokens[i++];
    i++;
    return text;
  };
  const parseValue = () => {
    skipWs();
    const t = tokens[i++];
    if (t === '<dict>') {
      const obj = {};
      for (;;) {
        skipWs();
        if (tokens[i] === '</dict>') { i++; return obj; }
        if (tokens[i] !== '<key>') throw new Error('plist: expected <key>');
        i++;
        const key = readText('key');
        obj[key] = parseValue();
      }
    }
    if (t === '<dict/>') return {};
    if (t === '<array>') {
      const arr = [];
      for (;;) {
        skipWs();
        if (tokens[i] === '</array>') { i++; return arr; }
        arr.push(parseValue());
      }
    }
    if (t === '<array/>') return [];
    if (t === '<string>') return readText('string');
    if (t === '<string/>') return '';
    if (t === '<integer>') return parseInt(readText('integer'), 10);
    if (t === '<real>') return parseFloat(readText('real'));
    if (t === '<true/>') return true;
    if (t === '<false/>') return false;
    throw new Error(`plist: unexpected token ${t}`);
  };
  const start = tokens.indexOf('<plist version="1.0">') >= 0 ? tokens.indexOf('<plist version="1.0">') + 1 : 0;
  i = start;
  // 跳到第一個 <dict>
  while (i < tokens.length && tokens[i] !== '<dict>') i++;
  return parseValue();
}

const nums = (s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

function plistToAtlas(plist) {
  const meta = plist.metadata ?? {};
  const frames = {};
  for (const [name, f] of Object.entries(plist.frames ?? {})) {
    if (f.frame !== undefined) {
      // format 2
      const [x, y, w, h] = nums(f.frame);
      const [ox, oy] = nums(f.offset ?? '{0,0}');
      const [sw, sh] = nums(f.sourceSize ?? `{${w},${h}}`);
      frames[name] = { x, y, w, h, rotated: !!f.rotated, offsetX: ox, offsetY: oy, sourceW: sw, sourceH: sh };
    } else if (f.textureRect !== undefined) {
      // format 3
      const [x, y, w, h] = nums(f.textureRect);
      const [ox, oy] = nums(f.spriteOffset ?? '{0,0}');
      const [sw, sh] = nums(f.spriteSourceSize ?? `{${w},${h}}`);
      frames[name] = { x, y, w, h, rotated: !!f.textureRotated, offsetX: ox, offsetY: oy, sourceW: sw, sourceH: sh };
    } else {
      // format 0/1：x,y,width,height
      const { x = 0, y = 0, width: w = 0, height: h = 0 } = f;
      frames[name] = { x, y, w, h, rotated: false, offsetX: f.offsetX ?? 0, offsetY: f.offsetY ?? 0, sourceW: f.originalWidth ?? w, sourceH: f.originalHeight ?? h };
    }
  }
  const [tw, th] = nums(meta.size ?? '{0,0}');
  return { image: meta.realTextureFileName ?? meta.textureFileName ?? null, size: { w: tw, h: th }, frames };
}

// ---------- 相依掃描 ----------
function scanEfkRefs(buf) {
  const text = buf.toString('utf16le') + '\n' + buf.subarray(1).toString('utf16le');
  const m = text.match(/[A-Za-z0-9_\-./\\ ()]+\.(png|jpg|jpeg|dds|tga|efkmodel|efkmat|efkcurve|wav|ogg)/gi) ?? [];
  return [...new Set(m.map((s) => toPosix(s.trim())))];
}

function scanFntPages(text) {
  return [...text.matchAll(/^page\s+.*file="([^"]+)"/gm)].map((m) => m[1]);
}

// ---------- 主流程 ----------
const done = new Set();
const copied = [];
const missing = [];
let bytes = 0;

function copyOne(abs) {
  const r = rel(abs);
  const dest = join(DEST_ROOT, r);
  mkdirSync(dirname(dest), { recursive: true });
  const s = statSync(abs);
  if (!existsSync(dest) || statSync(dest).size !== s.size || statSync(dest).mtimeMs < s.mtimeMs) {
    copyFileSync(abs, dest);
  }
  bytes += s.size;
  copied.push(r);
  return dest;
}

/**
 * @param abs 期望的來源絕對路徑
 * @param from 參照它的檔案（除錯訊息用）
 * @param destRelOverride 找不到時以檔名搜尋到的檔案，要放到哪個相對路徑（efk 期望的位置）
 */
function process_(abs, from = null) {
  const key = abs.toLowerCase();
  if (done.has(key)) return;
  done.add(key);

  if (!existsSync(abs)) {
    // 以檔名在整個資源樹搜尋，複製到「期望位置」
    const hits = findByBasename(posix.basename(toPosix(abs)));
    if (hits.length === 0) {
      missing.push(`${rel(abs)}${from ? `  (ref by ${rel(from)})` : ''}`);
      return;
    }
    const dest = join(DEST_ROOT, rel(abs));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(hits[0], dest);
    bytes += statSync(hits[0]).size;
    copied.push(`${rel(abs)}  <= ${rel(hits[0])}`);
    handleDeps(hits[0], abs);
    return;
  }
  copyOne(abs);
  handleDeps(abs, abs);
}

/** @param srcAbs 實際讀取內容的檔案；@param asAbs 它在目的地扮演的路徑（決定相對參照的基準） */
function handleDeps(srcAbs, asAbs) {
  const ext = posix.extname(srcAbs).toLowerCase();
  const dir = dirname(asAbs);
  try {
    if (ext === '.c3b') {
      for (const t of listC3bTextures(readFileSync(srcAbs))) process_(join(dir, t), asAbs);
    } else if (ext === '.efk' || ext === '.efkmat' || ext === '.efkefc') {
      for (const t of scanEfkRefs(readFileSync(srcAbs))) process_(join(dir, t), asAbs);
    } else if (ext === '.fnt') {
      for (const p of scanFntPages(readFileSync(srcAbs, 'utf8'))) process_(join(dir, p), asAbs);
    } else if (ext === '.plist') {
      const plist = parsePlistXml(readFileSync(srcAbs, 'utf8'));
      if (plist.maxParticles !== undefined || plist.emitterType !== undefined) {
        // 粒子設定（cocos ParticleSystem）：輸出 *.particle.json + 貼圖，runtime 以近似效果呈現
        const tex = plist.textureFileName;
        if (tex) process_(join(dir, tex), asAbs);
        const json = {
          texture: tex ?? null,
          maxParticles: plist.maxParticles,
          duration: plist.duration,
          life: plist.particleLifespan,
          startSize: plist.startParticleSize,
          finishSize: plist.finishParticleSize,
          rotationStart: plist.rotationStart,
          rotationEnd: plist.rotationEnd,
          startColor: [plist.startColorRed, plist.startColorGreen, plist.startColorBlue, plist.startColorAlpha],
          finishColor: [plist.finishColorRed, plist.finishColorGreen, plist.finishColorBlue, plist.finishColorAlpha],
          blend: [plist.blendFuncSource, plist.blendFuncDestination],
        };
        const dest = join(DEST_ROOT, rel(asAbs) + '.particle.json');
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, JSON.stringify(json));
        copied.push(rel(asAbs) + '.particle.json  (generated)');
        return;
      }
      const atlas = plistToAtlas(plist);
      const image = atlas.image ?? posix.basename(toPosix(srcAbs)).replace(/\.plist$/i, '.png');
      atlas.image = image;
      process_(join(dir, image), asAbs);
      const jsonDest = join(DEST_ROOT, rel(asAbs) + '.json');
      mkdirSync(dirname(jsonDest), { recursive: true });
      writeFileSync(jsonDest, JSON.stringify(atlas));
      copied.push(rel(asAbs) + '.json  (generated)');
    }
  } catch (err) {
    console.warn(`! 解析相依失敗 ${rel(srcAbs)}: ${err.message}`);
  }
}

/**
 * Cocos Studio 原始檔 .csd（XML）→ public/res/<path>.json（與 csb 同路徑），並處理相依：
 * plist / 字型 / 圖片從原版資源複製；子 csd 遞迴轉換；粒子 plist 轉 .particle.json
 */
const csdDone = new Set();
function processCsd(relPath, from = null) {
  const key = relPath.toLowerCase();
  if (csdDone.has(key)) return;
  csdDone.add(key);
  const abs = join(CSD_SRC, relPath);
  if (!existsSync(abs)) {
    missing.push(`csd:${relPath}${from ? `  (ref by ${from})` : ''}`);
    return;
  }
  let csd;
  try {
    csd = parseCsd(readFileSync(abs, 'utf8'));
  } catch (err) {
    console.warn(`! csd 解析失敗 ${relPath}: ${err.message}`);
    return;
  }
  const dest = join(DEST_ROOT, relPath + '.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(csd));
  copied.push(`${relPath}.json  (from csd)`);
  const deps = listCsdDeps(csd);
  const res = (p) => join(SRC, p.replace(/^DragonTycoon3Resource\//, ''));
  for (const p of deps.plists) process_(res(p), abs);
  for (const p of deps.fonts) process_(res(p), abs);
  for (const p of deps.images) process_(res(p), abs);
  for (const p of deps.particles) process_(res(p), abs);
  for (const p of deps.csds) processCsd(p, relPath);
}

const t0 = Date.now();
for (const [group, list] of Object.entries(groups)) {
  const before = copied.length;
  for (const pattern of list) {
    if (pattern.startsWith('csd:')) {
      processCsd(pattern.slice(4));
      continue;
    }
    const files = expand(pattern);
    if (files.length === 0) missing.push(`${pattern}  (manifest:${group})`);
    for (const f of files) process_(f);
  }
  console.log(`[${group}] ${copied.length - before} files`);
}

writeFileSync(
  join(DEST_ROOT, 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: toPosix(SRC), files: copied.map((c) => c.split('  ')[0]).sort() }, null, 1),
);

console.log(`\n共 ${copied.length} 個檔案，${(bytes / 1024 / 1024).toFixed(1)} MB，${Date.now() - t0} ms → ${toPosix(DEST_ROOT)}`);
if (missing.length) {
  console.log(`\n找不到 ${missing.length} 個：`);
  for (const m of missing) console.log('  - ' + m);
}
