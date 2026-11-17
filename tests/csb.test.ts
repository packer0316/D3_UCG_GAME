import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsd, type CsdFile, type CsdNode } from '../src/engine/csd/CsdParser';
import { parseCsb } from '../src/engine/csd/CsbParser';

const fixture = (name: string) => readFileSync(`tests/fixtures/csb/${name}`);

/** 數值取到小數 3 位（csd 文字 vs csb float32） */
const norm = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)));

function stripNode(n: CsdNode): unknown {
  // scale9Caps：csb 只存 capInsets 矩形（沒有原圖尺寸無法換回四邊寬），CsbParser 不輸出
  const { children, file, scale9Caps: _caps, ...rest } = n;
  // 子檔：csd 引用 .csd、csb 引用 .csb（同一個檔）
  const f = file && { ...file, path: file.path.replace(/\.cs[db]$/, '') };
  return { ...rest, file: f, children: children.map(stripNode) };
}

function comparable(c: CsdFile) {
  return norm({ duration: c.duration, animations: c.animations, timelines: c.timelines, root: stripNode(c.root) });
}

describe('CsbParser（Cocos Studio FlatBuffers）', () => {
  // 同一份 UI 的 csd 原始檔與編譯後 csb：解析結果應該一致
  for (const name of ['LockAim_Anim', 'SeatInfo']) {
    it(`${name}.csb 與 ${name}.csd 解析結果相同（節點 / 時間軸 / 動畫區段）`, () => {
      const csd = parseCsd(fixture(`${name}.csd`).toString('utf8'));
      const csb = parseCsb(fixture(`${name}.csb`));
      const { root: rootA, ...restA } = comparable(csd) as { root: unknown };
      const { root: rootB, ...restB } = comparable(csb) as { root: unknown };
      expect(rootB).toEqual(rootA);
      expect(restB).toEqual(restA);
    });
  }

  it('獎圈 Reward_Big_0.csb：start / loop / end、程式要改的節點都在', () => {
    const warns: string[] = [];
    const csb = parseCsb(fixture('Reward_Big_0.csb'), 'Reward_Big_0', (m) => warns.push(m));
    expect(warns).toEqual([]);
    expect(csb.animations).toEqual([
      { name: 'start', start: 0, end: 45 },
      { name: 'loop', start: 50, end: 110 },
      { name: 'end', start: 115, end: 135 },
    ]);
    const byName = new Map<string, CsdNode>();
    const walk = (n: CsdNode) => {
      if (!byName.has(n.name)) byName.set(n.name, n);
      n.children.forEach(walk);
    };
    walk(csb.root);
    expect(byName.get('Node_Scale')?.scaleX).toBeCloseTo(0.7);
    expect(byName.get('img')).toMatchObject({ type: 'Sprite', file: { type: 'PlistSubImage', plist: 'DinosaurExport/plist/Reward_common_D3_1.plist' } });
    expect(byName.get('num')).toMatchObject({ type: 'TextBMFont', font: { path: 'DinosaurExport/fonts/d3_num_jp01.fnt' } });
    expect(byName.get('MegaAward')).toMatchObject({ type: 'Sprite', visible: false });
    expect(byName.get('ExplosionNode')).toMatchObject({ type: 'ProjectNode', file: { path: 'DinosaurExport/main/Death_Explosion_big_Anim.csb' } });
    expect(byName.get('Particle_1')).toMatchObject({ type: 'Particle', file: { path: 'DinosaurExport/effect/particle_palace_item.plist' }, blend: [1, 1] });
    // 頭像外層 Img：5f 出現、0.3 → 15f (1.3, 1.426) → 20f → 25f 1.5，旋轉 -21 → 0
    const img = byName.get('Img')!;
    const scale = csb.timelines.find((t) => t.tag === img.actionTag && t.prop === 'Scale')!;
    expect(scale.frames.map((f) => f.i)).toEqual([5, 15, 20, 25]);
    expect(norm(scale.frames[1].v)).toEqual({ x: 1.3, y: 1.426 });
    const rot = csb.timelines.find((t) => t.tag === img.actionTag && t.prop === 'RotationSkew')!;
    expect(rot.frames[0]).toMatchObject({ i: 5, v: { x: -21, y: -21 } });
  });
});
