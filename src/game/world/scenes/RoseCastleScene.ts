/** FisherFPS's mourning gallery re-composed for the fixed, low prison camera. */
import * as T from 'three';
import { registerProceduralScene, type ProceduralScene, type ProceduralSceneContext } from './ProceduralScene';
import { SanctuaryKit, addSky, addShaft, addDrift, loadSurface, loadSculpture, surfaceTexture, bakeFloorReflection } from './SanctuaryKit';

export async function buildRoseCastle(ctx: ProceduralSceneContext): Promise<ProceduralScene> {
  const [plasterMaps, woodMaps, statue, glass, fresco] = await Promise.all([
    loadSurface('plaster'), loadSurface('wood'), loadSculpture(), surfaceTexture('mourner-glass-v2.png', false), surfaceTexture('ceiling-fresco-v2.png', false),
  ]);
  const kit = new SanctuaryKit({ fog: 0x232e43, ambient: 0x8294b0, light: 0xc4d7f7, rim: 0x957a9a, sun: [-.6, -.4, .9], warmth: .65 }, 7142);
  const stone = kit.surface('castle-carved-ivory', plasterMaps, 0xb2b0ba, { marble: true, gloss: .55 });
  const wall = kit.surface('castle-aged-stucco', plasterMaps, 0x6c7587);
  const dark = kit.surface('castle-black-marble', plasterMaps, 0x283343, { marble: true, gloss: .7 });
  const gold = kit.surface('castle-antique-gilt', plasterMaps, 0xb19962, { metal: .8, gloss: .8 });
  const wood = kit.surface('castle-mahogany', woodMaps, 0x5e3037);
  const floor = kit.surface('castle-checkered-marble', plasterMaps, 0x8b91a4, { marble: true, floor: 1, gloss: .92 });
  const ivory = kit.surface('castle-scanned-guardians', statue.maps, 0xd3c8b5, { uv: true, gloss: .55 });
  const flame = kit.material({name:'castle-living-candle-flames',defines:{PROC_DISPLACE:true},vertex:`void procDisplace(inout vec3 p,inout vec3 n){float height=uv.y;float sway=sin(uTime*4.3+p.x*2.+p.y)*.18+sin(uTime*8.7+p.y)*.07;p.x+=sway*height*height;p.z+=sin(uTime*6.+p.x)*height*.12;}`,fragment:`vec4 shade(){float core=pow(max(0.,1.-abs(vUv.x-.5)*2.),2.);vec3 c=mix(vec3(1.,.28,.025),vec3(1.2,.91,.52),core);c*=.91+.09*sin(uTime*6.+vWorldPos.x*3.);return vec4(c,1.);}`});
  const wax = kit.surface('castle-wax', plasterMaps, 0xd3b9a1, { emissive: .08 });
  const velvet = kit.material({ name: 'castle-pleated-velvet', side: T.DoubleSide, fragment: `vec4 shade(){vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorldPos);float pleat=.6+.4*abs(dot(N,normalize(vec3(-.4,-1.,.6))));float pattern=.94+.06*cos(vUv.x*195.)*sin(vUv.y*260.);float sheen=pow(1.-abs(dot(N,V)),2.5);return vec4(vec3(.28,.035,.065)*pleat*pattern+vec3(.27,.07,.095)*sheen*.4,1.);}` });
  addSky(kit, 0x080f23, 0x3c435b, 'night');
  kit.box(0, 400, -3, 1800, 1600, 5, floor);
  // End wall and side galleries sit beyond the playable trapezoid.
  kit.box(0, 675, 128, 900, 18, 258, wall);
  for (const side of [-1, 1]) {
    kit.box(side * 337, 365, 110, 18, 625, 220, wall);
    kit.box(side * 321, 365, 23, 17, 625, 46, dark);
    for (const [z, width, height] of [[5, 24, 8], [45, 22, 5], [153, 25, 6], [215, 27, 9]]) {
      kit.box(side * 323, 365, z, width, 625, height, z === 45 || z === 153 ? gold : stone);
    }
    for (let y = 120; y < 650; y += 90) {
      const x = side * (118 + y * .23);
      kit.column(x, y, 159, 7.5, stone, gold);
      // Layered arches span from the aisles to the outer wall, leaving the central floor open.
      kit.arch(side * 305, y + 6, 30, 48, 118, stone, 3);
      kit.arch(side * 305, y + 3, 33, 41, 111, gold, .9);
      kit.box(side * 305, y + 9, 70, 45, 3, 82, dark);
      for (const dz of [18, 32, 141]) kit.box(x, y, dz, 24, 24, 2.2, gold);
      // Actual scanned drapery and anatomy, with shared buffers and sculpted normals.
      if (y === 300 || y === 480) {
        kit.box(side * (Math.abs(x) + 30), y + 12, 10, 34, 30, 20, dark);
        kit.box(side * (Math.abs(x) + 30), y + 12, 21, 38, 34, 3, gold);
        const g = statue.geometry.clone().scale(82, 82, 82 / .68).rotateZ(side * .18).translate(side * (Math.abs(x) + 30), y + 12, 23);
        kit.geometry(g, ivory);
      }
      for (let j = 0; j < 5; j++) candle(x - side * (12 + j * 1.9), y - 5, 3, 5 + (j % 3) * 3);
      window(side * 324, y, 161, 30, 46, side * Math.PI / 2);
    }
  }
  // Five deep archivolts make the apse read as architecture rather than a backdrop plane.
  for (const [width, height, y, r, m] of [[380, 253, 648, 7, stone], [357, 242, 641, 2, gold], [342, 233, 638, 4, dark], [323, 224, 634, 2, gold]] as const) {
    kit.arch(0, y, 0, width, height, m, r);
  }
  for (const x of [-270, -210, 210, 270]) {
    kit.column(x, 641, 204, 10, stone, gold);
    for (let i = 0; i < 8; i++) kit.box(x + (i - 3.5) * 3.8, 630, 198, 2.1, 6, 6, stone);
  }
  // Rose window: original generated painted glass and sculpted radial tracery.
  const roseMat = kit.material({ name: 'castle-rose-window', uniforms: { uGlass: { value: glass } }, side: T.DoubleSide,
    fragment: `uniform sampler2D uGlass;vec4 shade(){vec2 p=vUv*2.-1.;float r=length(p);float petal=(atan(p.y,p.x)+3.141593)*12./6.283185;vec2 uv=vec2(.025+fract(petal)*.21,.08+r*.83);if(mod(floor(petal),2.)>.5)uv.x=1.-uv.x;if(r<.2)uv=vec2(.43,.64)+p*.7;vec3 c=texture2D(uGlass,uv).rgb;c*=mix(vec3(.65,.9,1.35),vec3(1.35,.55,.8),.5+.5*sin(floor(petal)*2.4+r*5.));return vec4(c*.92,1.);}` });
  // Preserve the rose's circular silhouette while lowering the architecture to fit the camera.
  kit.geometry(new T.CircleGeometry(57, 96).scale(1, 1 / .68, 1).rotateX(Math.PI / 2).translate(0, 628, 132), roseMat);
  for (const [r, thick, mat] of [[62, 3.2, stone], [58.5, .9, gold], [55.5, 1.6, dark], [34, 1, stone], [11, 1.2, gold]] as const) {
    kit.geometry(new T.TorusGeometry(r, thick, 8, 64).scale(1, 1 / .68, 1).rotateX(Math.PI / 2).translate(0, 625, 132), mat);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    kit.tube([[Math.cos(a) * 11, 622, 132 + Math.sin(a) * 11 / .68], [Math.cos(a) * 56, 622, 132 + Math.sin(a) * 56 / .68]], .85, stone, 2);
    const points = Array.from({ length: 41 }, (_, j) => {
      const b = j / 40 * Math.PI * 2, r = 8.5 + 1.7 * Math.cos(b * 4);
      return [Math.cos(a) * 43 + Math.cos(b) * r, 622, 132 + (Math.sin(a) * 43 + Math.sin(b) * r) / .68];
    });
    kit.tube(points, .65, gold, 48);
  }
  kit.glows.push({ x: 0, y: 624, z: 132, size: 180, color: 0x4a417e });
  for (const x of [-107, 107]) {
    const g = new T.PlaneGeometry(44, 158, 48, 25), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i);
      p.setZ(i, Math.sin(u * 1.15) * 2.5 + Math.sin(u * .24) * 1.1);
      if (v < -65) p.setY(i, v + Math.pow(Math.sin(u * .4), 2) * 9);
    }
    g.computeVertexNormals(); g.rotateX(Math.PI / 2).translate(x, 631, 99); kit.geometry(g, velvet);
    kit.box(x, 627, 179, 49, 6, 4, gold);
    for (let j = -3; j <= 3; j++) kit.geometry(new T.SphereGeometry(1.5, 8, 6).translate(x + j * 6, 622, 174), gold);
  }
  // The altar and steps start behind the far edge of the combat floor.
  for (let i = 0; i < 4; i++) kit.box(0, 565 + i * 9, i * 2 + 1, 242 - i * 14, 100 - i * 15, 2, stone);
  kit.box(0, 596, 15, 79, 24, 18, dark); kit.box(0, 596, 25, 89, 30, 4, stone);
  for (const x of [-32, -16, 0, 16, 32]) candle(x, 590, 27, 7 + Math.abs(x) * .1);
  for (const side of [-1, 1]) {
    const x = side * 152;
    kit.box(x, 570, 9, 35, 32, 18, dark);
    kit.box(x, 570, 19, 39, 36, 3, gold);
    kit.geometry(statue.geometry.clone().scale(86, 86, 86 / .68).rotateZ(side * .15).translate(x, 570, 21), ivory);
    for (let i = 0; i < 3; i++) candle(x + (i - 1) * 7, 553, 2, 5 + i * 3);
  }
  for (const side of [-1, 1]) for (let y = 330; y < 540; y += 60) {
    // Carved benches along the aisles, outside the visible central corridor.
    const x = side * (135 + y * .24);
    kit.box(x, y, 7, 46, 14, 5, wood);
    for (const dx of [-18, 18]) for (const dy of [-5, 5]) kit.cylinder(x + dx, y + dy, 3, 1.4, 6, gold, 1);
    kit.tube([[x - 22, y + 7, 9], [x - 19, y + 8, 24], [x, y + 8, 28], [x + 19, y + 8, 24], [x + 22, y + 7, 9]], 2, wood);
  }
  // Rear vaulted ceiling with the original FisherFPS mourning fresco inset.
  const ceilingMat = kit.material({ name: 'castle-fresco', uniforms: { uArt: { value: fresco } }, side: T.DoubleSide,
    fragment: `uniform sampler2D uArt;vec4 shade(){return vec4(texture2D(uArt,vUv).rgb*vec3(.48,.51,.65),1.);}` });
  kit.geometry(new T.PlaneGeometry(215, 330).translate(0, 475, 235), ceilingMat);
  for (const x of [-245, 245]) {
    kit.geometry(new T.PlaneGeometry(48, 114).rotateX(Math.PI / 2).translate(x, 633, 111), ceilingMat);
    for (const dx of [-25, 25]) kit.box(x + dx, 630, 111, 2.4, 4, 120, gold);
    for (const z of [51, 171]) kit.box(x, 630, z, 54, 4, 3, gold);
    for (const z of [49, 174]) kit.box(x, 632, z, 59, 6, 3, stone);
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 40 }, (_, i) => {
        const a = i / 39 * Math.PI * 2.2, r = 1 + i / 39 * 7;
        return [x + side * 10 + Math.cos(a) * r, 628, 181 + Math.sin(a) * r];
      });
      kit.tube(points, .8, gold, 40);
    }
  }
  for (const y of [360, 475, 590]) {
    kit.arch(0, y, 149, 565, 110, stone, 3);
    kit.arch(0, y - 2, 153, 554, 105, gold, .7);
  }
  // Chandelier in the rear third: below the vault, above all targets.
  kit.cylinder(0, 482, 201, .8, 55, gold);
  for (const r of [23, 35]) {
    kit.ring(0, 482, 176, r, 1.1, gold);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, x = Math.cos(a) * r, y = 482 + Math.sin(a) * r;
      kit.tube([[0, 482, 193], [x * .6, 482 + (y - 482) * .6, 177], [x, y, 176]], .65, gold, 18);
      candle(x, y, 177, 5);
    }
  }
  addShaft(kit, new T.Vector3(-215, 410, 208), new T.Vector3(80, 110, 0), 36, 0xa4b7ff);
  addShaft(kit, new T.Vector3(235, 530, 206), new T.Vector3(-70, 230, 0), 30, 0xcca2de);
  const viewH = { value: ctx.renderer.domElement.height };
  addDrift(kit, viewH, 155, 0xe2c7b3);
  kit.finish();
  kit.fitHeight(.68);
  bakeFloorReflection(kit, ctx.renderer, floor);
  kit.root.userData.theme = '永夜薔薇城堡';
  return { root: kit.root, materials: kit.materials, update: () => { viewH.value = ctx.renderer.domElement.height; } };

  function candle(x: number, y: number, z: number, h: number): void {
    kit.cylinder(x, y, z + h / 2, .9, h, wax, .8, 10);
    kit.cylinder(x, y, z - .5, 1.8, 1, gold, 1.8, 12);
    kit.geometry(new T.SphereGeometry(.8, 8, 8).scale(.65, .65, 2.4).translate(x, y, z + h + 1.2), flame);
    kit.glows.push({ x, y, z: z + h + 1.2, size: 13, color: 0xc77b36 });
  }
  function window(x: number, y: number, z: number, w: number, h: number, yaw: number): void {
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h * .66);
    s.quadraticCurveTo(w / 2, h * .84, 0, h); s.quadraticCurveTo(-w / 2, h * .84, -w / 2, h * .66); s.closePath();
    const g = new T.ShapeGeometry(s, 24), p = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getY(i) / h);
    const mat = kit.material({ name: 'castle-lancet-glass', uniforms: { uGlass: { value: glass } }, side: T.DoubleSide,
      fragment: `uniform sampler2D uGlass;vec4 shade(){return vec4(texture2D(uGlass,vUv).rgb*vec3(.7,.95,1.35),1.);}` });
    g.rotateX(Math.PI / 2).rotateZ(yaw).translate(x, y, z - h / 2); kit.geometry(g, mat);
    const border = s.getPoints(24).map(p => new T.Vector3(p.x, 0, p.y).applyAxisAngle(new T.Vector3(0, 0, 1), yaw).add(new T.Vector3(x - Math.sign(x), y, z - h / 2)).toArray());
    kit.tube(border, 1.2, gold, 64);
  }
}

registerProceduralScene('rose-castle', buildRoseCastle);
