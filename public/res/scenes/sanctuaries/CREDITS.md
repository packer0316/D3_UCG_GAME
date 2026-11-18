# Sanctuary environment assets

Imported from the user's local FisherFPS project on 2026-11-17.

The three new environments are authored for D3_UCG_GAME. Rose Castle references
FisherFPS's ghost-bride castle: carved archivolts, fluted columns, scanned guardians,
leaded rose glass, candles, antique gilt and the mourning fresco. Architecture has
been rebuilt for D3's Z-up coordinates and prison/cemetery camera.

## Existing generated artwork

- `mourner-glass-v2.png`, `ceiling-fresco-v2.png`: original generated FisherFPS art.
- Generation provenance and prompts: `GENERATED-ASSETS.md` (copied unchanged).

## CC0 scans and material maps

- Gothic Statue: https://polyhaven.com/a/gothic_statue
- Damaged Plaster: https://polyhaven.com/a/damaged_plaster
- Sandstone Blocks 05: https://polyhaven.com/a/sandstone_blocks_05
- Cobblestone Floor 08: https://polyhaven.com/a/cobblestone_floor_08
- Brown Planks 03: https://polyhaven.com/a/brown_planks_03
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Source credits: FisherFPS README and `public/castle/CREDITS.txt`.

The source project's WebP conversions are retained. The guardian's geometry is
normalized and rotated at load time, and the source maps are used by the new
scene-local lighting shader. No character, combat, audio or licensed cherub assets
were imported. All runtime assets are served locally.
