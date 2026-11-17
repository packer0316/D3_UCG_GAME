#!/usr/bin/env node
// Cocos Studio .csd 結構 dump（除錯用）
// 用法：node tools/inspect-csd.mjs <file.csd> [--timelines]
import { readFileSync } from 'node:fs';
import { parseCsd, listCsdDeps } from '../src/engine/csd/CsdParser.ts';

const args = process.argv.slice(2);
const showTl = args.includes('--timelines');
for (const file of args.filter((a) => !a.startsWith('--'))) {
  const csd = parseCsd(readFileSync(file, 'utf8'));
  console.log(`\n=== ${csd.name}  duration=${csd.duration} speed=${csd.speed}`);
  console.log('animations:', csd.animations.map((a) => `${a.name}[${a.start}-${a.end}]`).join(' '));
  const tlByTag = new Map();
  for (const t of csd.timelines) {
    if (!tlByTag.has(t.tag)) tlByTag.set(t.tag, []);
    tlByTag.get(t.tag).push(`${t.prop}(${t.frames.length})`);
  }
  const walk = (n, d) => {
    const f = n.file ? ` file=${n.file.plist ? n.file.plist.split('/').pop() + ':' : ''}${n.file.path}` : '';
    const tl = tlByTag.get(n.actionTag);
    console.log(
      `${'  '.repeat(d)}- ${n.name} <${n.type}> pos(${n.x.toFixed(1)},${n.y.toFixed(1)}) size(${n.width.toFixed(0)}x${n.height.toFixed(0)}) anc(${n.anchorX},${n.anchorY}) sc(${n.scaleX},${n.scaleY}) rot${n.rotX} a${n.alpha}${n.visible ? '' : ' HIDDEN'}${n.blend ? ` blend${n.blend}` : ''}${f}${n.text !== undefined ? ` text="${n.text}"` : ''}${n.font ? ` font=${n.font.path}` : ''}${tl ? `  TL:${tl.join(',')}` : ''}`,
    );
    n.children.forEach((c) => walk(c, d + 1));
  };
  walk(csd.root, 0);
  const deps = listCsdDeps(csd);
  console.log('deps:', Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, [...v]])));
  if (showTl) for (const t of csd.timelines) console.log(`  tl ${t.tag} ${t.prop}: ${t.frames.map((f) => f.i).join(',')}`);
}
