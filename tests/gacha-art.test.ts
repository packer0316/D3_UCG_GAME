import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GACHA_POOL } from '@game/ugc/GachaDefine';
import { cardArtwork } from '@features/ugc/ui/GachaArtwork';

const cards = [...GACHA_POOL, { kind: 'scene' as const, id: 0, rarity: 'N' as const }];

/** Inspect the shipped WebP header so accidental atlas aspect changes cannot stretch the card art. */
function webpSize(data: Buffer): [number, number] {
  expect(data.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  throw new Error(`Unsupported WebP chunk ${chunk}`);
}

describe('shipped gacha card artwork', () => {
  it('covers the entire real pool and starter scene with distinct illustrated cells', () => {
    const slots = new Set<string>();
    for (const card of cards) {
      const art = cardArtwork(card);
      expect(art.file.startsWith('illustrations/'), `${card.kind}:${card.id}`).toBe(true);
      expect(art.index).toBeGreaterThanOrEqual(0);
      expect(art.index).toBeLessThan(art.columns * art.rows);
      const slot = `${art.file}:${art.index}`;
      expect(slots.has(slot), `duplicate art for ${card.kind}:${card.id}`).toBe(false);
      slots.add(slot);
    }
    expect(slots.size).toBe(36);
  });

  it('ships decodable atlases with unstretched 2:3 card cells', () => {
    const visited = new Set<string>();
    for (const card of cards) {
      const art = cardArtwork(card);
      if (visited.has(art.file)) continue;
      visited.add(art.file);
      const data = readFileSync(fileURLToPath(new URL(`../public/res/gacha/${art.file}`, import.meta.url)));
      const [width, height] = webpSize(data);
      // The largest card face is ~260 design pixels; keep source tiles above that.
      expect(width / art.columns).toBeGreaterThanOrEqual(320);
      expect((width / art.columns) / (height / art.rows), art.file).toBeCloseTo(2 / 3, 2);
    }
  });
});
