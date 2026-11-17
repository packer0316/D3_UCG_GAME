#!/usr/bin/env node
// c3b 結構 dump（除錯用）
// 用法：npm run inspect:c3b -- <file.c3b> [--bones] [--anim]
import { readFileSync } from 'node:fs';
import { parseC3b } from '../src/engine/loaders/C3bParser.ts';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const showBones = args.includes('--bones');
const showAnim = args.includes('--anim');

if (files.length === 0) {
  console.log('usage: npm run inspect:c3b -- <file.c3b> [--bones] [--anim]');
  process.exit(1);
}

const fmtMat = (m) => `[t=${[m[12], m[13], m[14]].map((v) => v.toFixed(2)).join(',')}]`;

function dumpNode(node, depth) {
  const pad = '  '.repeat(depth);
  const parts = node.parts
    .map((p) => `{part=${p.meshPartId} mat=${p.materialId} bones=${p.bones.length}}`)
    .join(' ');
  if (showBones || depth < 2 || node.parts.length) {
    console.log(`${pad}- ${node.id}${node.skeleton ? ' [skeleton]' : ''} ${fmtMat(node.transform)} ${parts}`);
  }
  for (const c of node.children) dumpNode(c, depth + 1);
}

for (const file of files) {
  const data = parseC3b(readFileSync(file));
  console.log(`\n=== ${file}  (c3b v${data.version})`);
  console.log('refs:', data.references.map((r) => `${r.id}:${r.type}`).join(', '));
  data.meshes.forEach((m, i) => {
    const vcount = m.vertices.length / m.stride;
    console.log(
      `mesh[${i}] verts=${vcount} attribs=${m.attribs.map((a) => `${a.name.replace('VERTEX_ATTRIB_', '')}(${a.size})`).join(' ')}`,
    );
    m.parts.forEach((p) => console.log(`   part ${p.id} indices=${p.indices.length} aabb=${p.aabb?.map((v) => v.toFixed(1)).join(',')}`));
  });
  data.materials.forEach((m) =>
    console.log(`material ${m.id}: ${m.textures.map((t) => `${t.usage}:${t.filename} (${t.wrapS},${t.wrapT})`).join(' ')}`),
  );
  console.log('nodes:');
  data.nodes.forEach((n) => dumpNode(n, 1));
  data.animations.forEach((a) => {
    let maxT = 0;
    let keys = 0;
    for (const b of a.bones) for (const k of b.keys) { maxT = Math.max(maxT, k.time); keys++; }
    console.log(`anim "${a.id}" total=${a.totalTime.toFixed(3)}s (${(a.totalTime * 30).toFixed(0)} frames@30) bones=${a.bones.length} keys=${keys} maxKeyTime=${maxT.toFixed(4)}`);
    if (showAnim) a.bones.slice(0, 5).forEach((b) => console.log(`   ${b.bone}: ${b.keys.length} keys, first t=${b.keys[0]?.time}`));
  });
}
