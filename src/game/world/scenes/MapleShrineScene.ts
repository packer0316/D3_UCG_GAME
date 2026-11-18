/** Vermilion shrine at sunset: curved tiled roofs, carved lanterns and individually shaped maple leaves. */
import * as T from 'three';
import { registerProceduralScene, type ProceduralScene, type ProceduralSceneContext } from './ProceduralScene';
import { SanctuaryKit, loadSurface, addSky, addDrift, bakeFloorReflection } from './SanctuaryKit';
import { tint } from './sceneKit';
import type { ProcMaterial } from './ProcMaterial';
import { fbm } from './noise';

export async function buildMapleShrine(ctx: ProceduralSceneContext): Promise<ProceduralScene> {
  const [stoneMaps, woodMaps, pavingMaps] = await Promise.all([loadSurface('stone'), loadSurface('wood'), loadSurface('paving')]);
  const kit = new SanctuaryKit({ fog: 0x776f87, ambient: 0xa4a9b0, light: 0xffd6a5, rim: 0x858eac, sun: [.6, .1, .7], warmth: .48 }, 6170);
  const stone = kit.surface('shrine-weathered-stone', stoneMaps, 0x9a9f97, { gloss: .4 });
  const wood = kit.surface('shrine-dark-cedar', woodMaps, 0x51453d);
  const red = kit.surface('shrine-vermilion-lacquer', woodMaps, 0xb3422d, { gloss: .75 });
  const gold = kit.surface('shrine-bronze-fittings', stoneMaps, 0xc5a261, { metal: .7, gloss: .7 });
  const paving = kit.surface('shrine-rainwashed-paving', pavingMaps, 0x8d9290, { scale: .026, floor: 2, gloss: .75 });
  const moss = kit.surface('shrine-moss', stoneMaps, 0x52634a, { scale: .08 });
  const lanternCore = kit.emit('shrine-lantern-paper', 0xffc873, .88);
  const windowPaper = kit.material({ name: 'shrine-washi-window', fragment: `vec4 shade(){float fiber=vnoise(vUv*vec2(230.,120.));float glow=.72+.28*sin(vWorldPos.x*.045+vWorldPos.z*.02);float frame=smoothstep(0.,.09,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));return vec4(vec3(.78,.48,.20)*(glow*(.82+.18*frame)+fiber*.065),1.);}` });
  const roof = kit.material({ name: 'shrine-glazed-roof-tiles', side: T.DoubleSide, fragment: /* glsl */ `
    vec4 shade(){
      vec2 p=vWorldPos.xy*.17;
      float course=fract(p.y),tile=fract(p.x+step(.5,fract(p.y*.5))*.5);
      float seam=(1.-smoothstep(.02,.09,min(course,1.-course)))*.6+(1.-smoothstep(.01,.06,min(tile,1.-tile)))*.3;
      vec3 N=normalize(vNormal);float light=.45+.55*max(dot(N,normalize(vec3(.6,.1,.7))),0.);
      vec3 c=vec3(.13,.23,.25)*light*(1.-seam);
      c+=vec3(.1,.14,.13)*pow(max(dot(reflect(-normalize(vec3(.6,.1,.7)),N),normalize(cameraPosition-vWorldPos)),0.),35.);
      return vec4(c,1.);
    }` });
  const foliage = kit.material({ name: 'shrine-maple-canopy', side: T.DoubleSide, vertexColors: true,
    defines: { PROC_DISPLACE: true }, vertex: `void procDisplace(inout vec3 p,inout vec3 n){p.x+=sin(p.y*.065+uTime*.7)*.9;p.y+=sin(p.x*.05+uTime*.4)*.45;}`,
    fragment: `vec4 shade(){vec3 N=normalize(vNormal);float light=.58+.42*abs(dot(N,normalize(vec3(.6,.1,.7))));float veins=.82+.18*smoothstep(.015,.055,abs(vUv.x-.5));return vec4(vColor*light*veins,1.);}` });
  addSky(kit, 0x444960, 0xbd998b, 'dawn');
  kit.box(0, 400, -3, 2200, 1800, 5, paving);
  // Layered mountain silhouettes with softly eroded ridgelines.
  for (let layer = 0; layer < 3; layer++) {
    const mat = kit.material({ name: `shrine-mountain-${layer}`, uniforms: { uTint: { value: new T.Color([0x747a87, 0x63737c, 0x4d6267][layer]) } },
      fragment: `uniform vec3 uTint;vec4 shade(){vec3 N=normalize(vNormal);float light=.6+.4*max(dot(N,normalize(vec3(.6,.1,.7))),0.);float forest=fbm(vWorldPos.xy*.055);float stone=fbm(vWorldPos.xy*.012+vWorldPos.z*.03);vec3 c=uTint*(light+forest*.14);c=mix(c,vec3(.30,.34,.35),smoothstep(.55,.75,stone)*.25);float haze=1.-exp(-max(length(vViewPos)-850.,0.)*.0012);return vec4(mix(c,vec3(.51,.48,.52),haze),1.);}` });
    const g = new T.PlaneGeometry(2600, 520, 150, 40), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), t = (y + 260) / 520;
      const profile = Math.pow(Math.max(0, Math.sin(t * Math.PI)), .7);
      const h = 140 + Math.sin(x * .004 + layer) * 55 + fbm(x * .009, y * .008, 4, layer * 17) * 150;
      p.setZ(i, profile * h - 10);
    }
    g.translate(0, 1590 - layer * 200, 0); g.computeVertexNormals(); kit.geometry(g, mat);
  }
  // Clear stone courtyard; garden borders converge naturally with the prison camera.
  for (const side of [-1, 1]) {
    for (let y = 60; y < 690; y += 36) {
      const x = side * (126 + y * .26);
      kit.box(x, y, 1.5, 15, 34, 4, stone);
      kit.box(x + side * 26, y, -.3, 38, 37, 1, moss);
      if (Math.round(y / 36) % 2 === 0) lantern(x + side * 16, y, .82 + y * .0007);
    }
    for (const [y, height, width] of [[170, 116, 88], [350, 135, 107], [550, 153, 118]]) {
      tree(side * (160 + y * .27), y, height, width, side);
    }
    // Low carved rail with finials and a repeated, legible rhythm.
    for (let y = 270; y < 650; y += 32) {
      const x = side * (155 + y * .29);
      kit.box(x, y, 15, 4, 4, 30, red);
      kit.cylinder(x, y, 31, 3.1, 3, gold, 1.9);
      if (y < 620) for (const z of [11, 24]) kit.tube([[x, y, z], [x + side * 9.28, y + 32, z]], 1.8, red, 2);
    }
  }
  // The torii is behind the gameplay boundary; the open lintel frames the distant sanctuary.
  torii(0, 437, 216, 134, 1);
  for (let i = 0; i < 7; i++) kit.box(0, 521 + i * 12, 1 + i * 2.5, 231 - i * 8, 19, 2.5, stone);
  building(0, 632, 180, 112, 88, 18);
  for (const side of [-1, 1]) {
    building(side * 263, 675, 102, 83, 69, 3);
    for (let level = 1; level <= 2; level++) building(side * 263, 675, 102 - level * 19, 83 - level * 15, 45, 3 + level * 51);
    // Stone guardian bases, paired ceremonial lanterns and twisted sacred ropes.
    lantern(side * 111, 540, 1.65);
    kit.box(side * 120, 591, 14, 29, 30, 27, stone);
    kit.cylinder(side * 120, 591, 32, 10, 10, stone, 12);
    kit.geometry(new T.SphereGeometry(9, 16, 12).scale(.8, 1, 1.2).translate(side * 120, 591, 46), stone);
    for (const a of [-.6, .6]) kit.tube([[side * 120 + a * 12, 586, 47], [side * 120 + a * 14, 585, 60], [side * 120 + a * 7, 586, 58]], 2, stone, 10);
  }
  // Fine fallen leaves collect at the boundaries rather than hiding the combat floor.
  for (let i = 0; i < 440; i++) {
    const y = kit.random() * 700, side = kit.random() < .5 ? -1 : 1;
    const x = side * (112 + y * .23 + kit.random() * 55);
    const g = mapleLeaf(1.1 + kit.random() * 1.6).rotateZ(kit.random() * Math.PI * 2).translate(x, y, .1);
    kit.geometry(tint(g, leafColor()), foliage);
  }
  const viewH = { value: ctx.renderer.domElement.height };
  addDrift(kit, viewH, 110, 0xf2a358, true);
  addDrift(kit, viewH, 80, 0xffce78);
  kit.finish(); kit.fitHeight(.75); bakeFloorReflection(kit, ctx.renderer, paving); kit.root.userData.theme = '赤楓燈籠神社';
  return { root: kit.root, materials: kit.materials, update: () => { viewH.value = ctx.renderer.domElement.height; } };

  function leafColor(): number { return [0xc85631, 0xe0873b, 0xa93e2c, 0xdd6740, 0xbf863b][Math.floor(kit.random() * 5)]; }
  function mapleLeaf(size: number): T.BufferGeometry {
    const s = new T.Shape();
    const points = [[0,-.7],[-.12,-.28],[-.55,-.3],[-.38,-.05],[-.78,.2],[-.38,.28],[-.48,.66],[-.14,.46],[0,1],[.14,.46],[.48,.66],[.38,.28],[.78,.2],[.38,-.05],[.55,-.3],[.12,-.28]];
    points.forEach(([x, y], i) => i ? s.lineTo(x * size, y * size) : s.moveTo(x * size, y * size)); s.closePath();
    const g = new T.ShapeGeometry(s); const uv = g.getAttribute('uv'), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (size * 2) + .5, p.getY(i) / (size * 2) + .5);
    return g;
  }
  function tree(x: number, y: number, h: number, w: number, side: number): void {
    kit.tube([[x,y,0],[x-side*4,y+2,h*.28],[x-side*12,y+7,h*.57],[x-side*22,y+11,h*.87]], 5, wood, 22);
    for (let j = 0; j < 9; j++) {
      const a = j * 2.39996, reach = w * (.28 + kit.random() * .25);
      const ex = x + Math.cos(a) * reach - side * 15, ey = y + Math.sin(a) * reach;
      const ez = h * (.64 + kit.random() * .28);
      kit.tube([[x-side*8,y+4,h*.4],[x+Math.cos(a)*reach*.55-side*9,y+Math.sin(a)*reach*.45,h*.65],[ex,ey,ez]], 1.8 + kit.random() * 1.3, wood, 15);
      for (let k = 0; k < 110; k++) {
        const phi = kit.random() * Math.PI * 2, r = Math.sqrt(kit.random()) * w * .26;
        const lx = ex + Math.cos(phi) * r, ly = ey + Math.sin(phi) * r, lz = ez + (kit.random() - .5) * 16;
        const leaf = mapleLeaf(2.4 + kit.random() * 2).rotateX((kit.random() - .5) * 1.6).rotateY((kit.random() - .5) * 1.2).rotateZ(kit.random() * Math.PI * 2).translate(lx, ly, lz);
        kit.geometry(tint(leaf, leafColor()), foliage);
      }
    }
    // Exposed roots follow the garden bed, avoiding the central paving.
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      kit.tube([[x,y,4],[x+Math.cos(a)*12,y+Math.sin(a)*12,1.8],[x+Math.cos(a)*26,y+Math.sin(a)*24,.2]], 1.8, wood, 10);
    }
  }
  function torii(x: number, y: number, w: number, h: number, scale: number): void {
    for (const side of [-1, 1]) {
      kit.cylinder(x + side * w * .37, y, h / 2, 5.7 * scale, h, red, 4.7 * scale);
      kit.cylinder(x + side * w * .37, y, 8, 7 * scale, 16, wood);
      for (const z of [h * .70, h * .9]) kit.cylinder(x + side * w * .37, y, z, 6 * scale, 3, gold);
    }
    kit.box(x, y, h * .75, w * .89, 6 * scale, 7 * scale, red);
    kit.tube([[x-w*.53,y,h+6],[x-w*.35,y,h],[x,y,h-1],[x+w*.35,y,h],[x+w*.53,y,h+6]], 5 * scale, wood, 40);
    kit.tube([[x-w*.49,y,h-3],[x,y,h-8],[x+w*.49,y,h-3]], 3.5 * scale, red, 30);
    kit.box(x, y - 4, h * .85, 13 * scale, 3, 20 * scale, gold);
    kit.box(x, y - 6, h * .85, 9 * scale, 1, 16 * scale, wood);
    kit.tube([[x-w*.35,y-4,h*.68],[x,y-5,h*.6],[x+w*.35,y-4,h*.68]], 1.6, stone, 32);
    for (let i = -3; i <= 3; i++) {
      const paper = new T.PlaneGeometry(3, 9).rotateX(Math.PI / 2).rotateY(i * .08).translate(x + i * w * .08, y - 5, h * .6 - 7 + Math.abs(i));
      kit.geometry(paper, lanternCore);
    }
  }
  function roofShape(x: number, y: number, z: number, w: number, d: number, rise: number, material: ProcMaterial): void {
    const g = new T.PlaneGeometry(w, d, 40, 28), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (w / 2), v = p.getY(i) / (d / 2);
      const upturn = Math.pow(Math.abs(u), 5) * 7 + Math.pow(Math.abs(v), 5) * 8;
      p.setZ(i, rise * (1 - Math.abs(v)) + upturn);
    }
    g.computeVertexNormals(); kit.geometry(g.translate(x, y, z), material);
    for (const side of [-1, 1]) {
      const pts = Array.from({ length: 30 }, (_, j) => { const u = j / 29 * 2 - 1; return [x + u * w / 2, y + side * d / 2, z + Math.pow(Math.abs(u), 5) * 7 + 8]; });
      kit.tube(pts, 1.7, gold, 36);
    }
    kit.tube([[x-w*.53,y,z+rise+10],[x-w*.40,y,z+rise+2],[x+w*.40,y,z+rise+2],[x+w*.53,y,z+rise+10]], 2.4, gold, 36);
    for (let i = -12; i <= 12; i++) {
      const u = i / 12;
      for (const side of [-1,1]) kit.tube([[x+u*w*.48,y,z+rise+Math.pow(Math.abs(u),5)*7],[x+u*w*.48,y+side*d*.31,z+rise*.38+Math.pow(Math.abs(u),5)*7],[x+u*w*.48,y+side*d*.5,z+8+Math.pow(Math.abs(u),5)*7]], .65, roof, 16);
    }
  }
  function building(x: number, y: number, w: number, d: number, h: number, base: number): void {
    kit.box(x, y, base + 3, w + 18, d + 14, 6, stone);
    kit.box(x, y + 5, base + h * .45, w * .88, d * .85, h * .8, wood);
    kit.box(x, y - d * .45, base + h * .44, w * .85, 2, h * .65, windowPaper);
    // Dense lattice windows with real depth and a shaded veranda.
    for (let i = -10; i <= 10; i++) kit.box(x + i * w * .039, y - d * .47, base + h * .43, 1.3, 2.5, h * .64, wood);
    for (let i = 1; i <= 6; i++) kit.box(x, y - d * .48, base + 7 + i * h * .09, w * .85, 2.5, 1.3, wood);
    for (const u of [-.46, -.24, 0, .24, .46]) {
      kit.cylinder(x + u * w, y - d * .48, base + h * .44, 3, h * .88, red, 2.5);
      kit.box(x + u * w, y - d * .48, base + h * .83, 12, 12, 4, gold);
    }
    kit.box(x, y - d * .5, base + h * .81, w, 7, 5, red);
    roofShape(x, y, base + h * .83, w * 1.22, d * 1.28, h * .35, roof);
    kit.glows.push({ x, y: y - d * .48 - 3, z: base + h * .44, size: w * .5, height: h * .5, color: 0x5a3213 });
  }
  function lantern(x: number, y: number, s: number): void {
    kit.box(x, y, 2 * s, 17 * s, 17 * s, 4 * s, stone);
    kit.cylinder(x, y, 12 * s, 3.5 * s, 18 * s, stone, 2.8 * s, 8);
    kit.box(x, y, 22 * s, 14 * s, 14 * s, 4 * s, stone);
    kit.box(x, y, 29 * s, 9 * s, 9 * s, 11 * s, lanternCore);
    for (const dx of [-5, 5]) for (const dy of [-5, 5]) kit.box(x + dx * s, y + dy * s, 29 * s, 1.5 * s, 1.5 * s, 12 * s, wood);
    const r = new T.ConeGeometry(12 * s, 8 * s, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).translate(x, y, 38 * s);
    kit.geometry(r, stone); kit.geometry(new T.SphereGeometry(2 * s, 10, 8).translate(x, y, 44 * s), gold);
    kit.glows.push({ x, y: y - 6 * s, z: 29 * s, size: 32 * s, color: 0x945021 });
  }
}

registerProceduralScene('maple-shrine', buildMapleShrine);
