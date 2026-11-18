/** An illuminated, submerged sanctuary: scalloped vaults, mother-of-pearl and living coral. */
import * as T from 'three';
import { registerProceduralScene, type ProceduralScene, type ProceduralSceneContext } from './ProceduralScene';
import { SanctuaryKit, loadSurface, addSky, addShaft, addDrift, bakeFloorReflection, reflectionUniforms, REFLECTION_GLSL, environmentUniforms, ENVIRONMENT_GLSL, shadowUniforms, SHADOW_GLSL } from './SanctuaryKit';
import { MICROFACET_GLSL } from './SurfaceLighting';
import type { ProcMaterial } from './ProcMaterial';
import { zUp } from './sceneKit';

export async function buildTidePalace(ctx: ProceduralSceneContext): Promise<ProceduralScene> {
  const maps = await loadSurface('stone');
  const kit = new SanctuaryKit({ fog: 0x144b5f, ambient: 0x82b3ba, light: 0xc1f1e6, rim: 0x578ab5, sun: [-.35, .1, 1], warmth: .12 }, 9231);
  const pearl = kit.surface('tide-mother-of-pearl', maps, 0xbed1c9, { marble: true, gloss: .85 });
  const jade = kit.surface('tide-carved-jade', maps, 0x316e77, { marble: true, gloss: .78 });
  const bronze = kit.surface('tide-patinated-brass', maps, 0xa89a61, { metal: .65, gloss: .7 });
  const coralRose = kit.surface('tide-rose-coral', maps, 0xc2728d, { scale: .2, emissive: .055 });
  const coralMint = kit.surface('tide-mint-coral', maps, 0x70bcb1, { scale: .2, emissive: .08 });
  const floor = kit.material({ name: 'tide-caustic-mosaic', uniforms: { uMap: { value: maps.diffuse }, uNormalMap: { value: maps.normal }, ...reflectionUniforms(),...shadowUniforms() }, fragment: /* glsl */ `
    uniform sampler2D uMap,uNormalMap;
    ${REFLECTION_GLSL}
    ${SHADOW_GLSL}
    vec4 shade(){
      vec2 p=vWorldPos.xy;
      vec3 tex=texture2D(uMap,p*.045).rgb;
      vec2 tile=p/23.;vec2 edge=min(fract(tile),1.-fract(tile));
      float joint=1.-smoothstep(.008,.02+max(fwidth(tile.x),fwidth(tile.y)),min(edge.x,edge.y));
      vec3 c=mix(vec3(.13,.28,.32),vec3(.25,.44,.44),tex.g)*(.8+.2*mod(floor(tile.x)+floor(tile.y),2.));
      c*=1.-joint*.35;
      vec2 q=(p-vec2(0.,255.))*.012;float r=length(q);float a=atan(q.y,q.x);
      float shell=abs(r-(.9+.10*cos(a*12.)));
      float inlay=(1.-smoothstep(.006,.018,shell))+(1.-smoothstep(.006,.018,abs(r-1.25)));
      c=mix(c,vec3(.53,.51,.31),clamp(inlay,0.,1.)*.65);
      float n=fbm(p*.016+vec2(uTime*.025,-uTime*.012));
      float caustic=pow(max(0.,1.-abs(n-.51)*17.),4.);
      c+=vec3(.06,.22,.23)*caustic;
      c*=.72+.28*architecturalShadow(vWorldPos,vec3(0.,0.,1.));
      vec3 V=normalize(cameraPosition-vWorldPos);
      vec3 N=normalize(vec3(texture2D(uNormalMap,p*.012+uTime*.002).xy*.08-.04,1.));
      c+=vec3(.15,.38,.36)*pow(max(dot(N,normalize(V+normalize(vec3(-.4,.4,1.)))),0.),75.)*.45;
      float fres=pow(1.-max(dot(N,V),0.),5.);
      c=mix(c,floorReflection(vWorldPos,.0009+sin(uTime*.4+p.y*.018)*.00035),(.23+fres*.25)*smoothstep(.25,.72,1.-max(dot(N,V),0.)));
      float f=1.-exp(-max(length(vViewPos)-260.,0.)*.0012);
      return vec4(mix(c,vec3(.08,.27,.33),f),1.);
    }` });
  const crystal = kit.material({ name: 'tide-refractive-crystal', side: T.DoubleSide, uniforms: environmentUniforms(), fragment: /* glsl */ `
    ${MICROFACET_GLSL}
    ${ENVIRONMENT_GLSL}
    vec4 shade(){
      vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorldPos);
      float fres=pow(1.-abs(dot(N,V)),2.6);
      float inner=fbm(vWorldPos.xz*.036+vWorldPos.y*.018+uTime*.025);
      float fissure=pow(max(0.,1.-abs(inner-.49)*15.),6.);
      float light=pow(max(dot(reflect(-normalize(vec3(-.4,-.2,1.)),N),V),0.),35.);
      vec3 c=mix(vec3(.025,.18,.23),vec3(.27,.73,.77),fres*.85+inner*.25);
      c+=vec3(.18,.49,.48)*fissure*.45+vec3(.65,.91,.87)*light*.65;
      c+=vec3(.1,.27,.3)*max(N.z,0.);
      // Three wavelength-dependent indices give a restrained spectral edge to real local reflections.
      vec3 refracted=vec3(sanctuaryEnvironment(refract(-V,N,.685),.08).r,sanctuaryEnvironment(refract(-V,N,.672),.08).g,sanctuaryEnvironment(refract(-V,N,.659),.08).b);
      vec3 reflected=sanctuaryEnvironment(reflect(-V,N),.06);
      vec3 absorption=exp(-vec3(1.8,.35,.22)*(1.-fres));
      c=mix(c,refracted*absorption,.36*(1.-fres));
      c+=reflected*(.08+fres*.55);
      c+=ggxSpecular(N,V,normalize(vec3(-.4,-.2,1.)),vec3(.065),.12)*.5;
      return vec4(c,1.);
    }` });
  const glow = kit.emit('tide-pearlescent-lights', 0xa3ecdc, 1.1);
  const fanMat = kit.material({ name: 'tide-rose-sea-fans', side: T.DoubleSide, fragment: `vec4 shade(){float ribs=pow(max(0.,cos(vUv.x*95.+vUv.y*4.)),5.);float pore=vnoise(vUv*170.);vec3 c=mix(vec3(.25,.12,.24),vec3(.64,.35,.39),vUv.y)*(.75+.25*pore);c+=vec3(.18,.13,.10)*ribs;float edge=smoothstep(0.,.06,vUv.y);return vec4(c*edge,1.);}` });
  addSky(kit, 0x062a43, 0x286b78, 'ocean');
  kit.box(0, 500, -4, 2100, 1800, 7, floor);

  // Distant reef shelves and spires soften the silhouette behind the palace.
  for (let i = 0; i < 30; i++) {
    const x = (i - 14.5) * 43, y = 820 + kit.random() * 120, h = 40 + kit.random() * 180;
    const g = zUp(new T.CylinderGeometry(4, 22 + kit.random() * 20, h, 7, 4));
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + Math.sin(p.getZ(k) * .07 + i) * 7);
    g.computeVertexNormals(); kit.geometry(g.translate(x, y, h / 2 - 7), jade);
  }
  // Fluted aisle columns, fin capitals and braided brass collars.
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const y = 145 + i * 100, x = side * (125 + y * .24), h = 108 + i * 13;
    kit.column(x, y, h, 7.7, pearl, bronze);
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4;
      const points = [[x + Math.cos(a) * 5, y + Math.sin(a) * 5, h - 19], [x + Math.cos(a) * 13, y + Math.sin(a) * 13, h - 7], [x + Math.cos(a) * 18, y + Math.sin(a) * 18, h + 6]];
      kit.tube(points, 1.25, pearl, 16);
    }
    kit.geometry(new T.SphereGeometry(4, 16, 12).translate(x, y, h + 7), glow);
    kit.glows.push({ x, y, z: h + 7, size: 28, color: 0x508e94 });
    // Tall external arches form repeated curved shells, never crossing target silhouettes.
    kit.arch(x + side * 34, y + 20, 15, 63, h - 4, pearl, 3);
    kit.arch(x + side * 34, y + 17, 18, 55, h - 10, bronze, .8);
    coral(x + side * 16, y - 20, 0, 24 + kit.random() * 20, i % 2 ? coralRose : coralMint, i + side * 9);
    crystalCluster(x - side * 19, y + 20, 0, 17 + i * 2);
    seaFan(x + side * 36, y - 2, 31 + i * 5, side * .3);
  }
  // A ceremonial shell pavilion beyond the far combat boundary.
  for (let i = 0; i < 4; i++) kit.cylinder(0, 580, i * 2, 143 - i * 12, 2, pearl, 143 - i * 12, 96);
  kit.ring(0, 580, 8, 108, 1.4, bronze);
  for (let i = 0; i <= 8; i++) {
    const a = i / 8 * Math.PI, x = Math.cos(a) * 118, y = 580 + Math.sin(a) * 62;
    kit.column(x, y, 119, 7, pearl, bronze);
    kit.tube([[x, y, 120], [x * .76, y + 16, 160], [x * .35, 660, 197], [0, 666, 206]], 3.7, pearl, 40);
    kit.tube([[x, y - 3, 120], [x * .76, y + 13, 160], [x * .35, 657, 197], [0, 663, 206]], .8, bronze, 40);
  }
  // Scallop panels between the radial ribs, with fine iridescent grooves.
  const canopyMat = kit.material({ name: 'tide-iridescent-shell', side: T.DoubleSide, uniforms:environmentUniforms(), fragment: `${MICROFACET_GLSL}${ENVIRONMENT_GLSL}vec4 shade(){vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorldPos);float facing=abs(dot(N,V));float rib=.88+.12*sin(vUv.x*90.);vec3 pearl=mix(vec3(.17,.37,.42),vec3(.55,.68,.60),facing);vec3 film=.5+.5*cos(vec3(0.,2.1,4.2)+(1.-facing)*14.+vUv.y*3.);pearl+=film*pow(1.-facing,2.)*.16;pearl+=sanctuaryEnvironment(reflect(-V,N),.22)*(.06+.20*pow(1.-facing,3.));pearl+=ggxSpecular(N,V,normalize(vec3(-.3,.1,1.)),vec3(.055),.24)*.5;return vec4(pearl*rib,1.);}` });
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let j = 0; j <= 20; j++) for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI, t = j / 20, r = Math.cos(t * Math.PI / 2);
    positions.push(Math.cos(a) * 118 * r, 580 + Math.sin(a) * 62 * r + t * 86, 120 + Math.sin(t * Math.PI / 2) * 86);
    uv.push(i / 64, t);
    if (j < 20 && i < 64) { const k = j * 65 + i; indices.push(k, k + 65, k + 1, k + 1, k + 65, k + 66); }
  }
  const canopy = new T.BufferGeometry(); canopy.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); canopy.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); canopy.setIndex(indices); canopy.computeVertexNormals(); kit.geometry(canopy, canopyMat);
  // Suspended central crystal, in a ceremonial cradle instead of a flat emissive sprite.
  kit.cylinder(0, 570, 15, 29, 17, jade, 24, 48);
  kit.ring(0, 570, 24, 27, 1.5, bronze);
  const centerpiece = crystalGeometry(24, 87); centerpiece.translate(0, 570, 81);
  const jewel = kit.add(new T.Mesh(centerpiece, crystal));
  for (const side of [-1, 1]) kit.tube([[side * 24, 570, 23], [side * 35, 573, 45], [side * 32, 576, 67], [side * 20, 579, 78]], 2.4, bronze);
  kit.glows.push({ x: 0, y: 571, z: 85, size: 125, color: 0x24536b });
  for (const side of [-1, 1]) {
    coral(side * 164, 545, 0, 58, coralRose, side * 17);
    coral(side * 190, 641, 0, 80, coralMint, side * 21);
    crystalCluster(side * 105, 478, 8, 35);
  }
  // Carved balustrades at the edges, with luminous pearls and sea-fan silhouettes.
  for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
    const y = 205 + i * 35, x = side * (151 + y * .25);
    kit.cylinder(x, y, 11, 2.3, 22, pearl, 1.8, 12);
    if (i % 2 === 0) kit.geometry(new T.SphereGeometry(2.5, 12, 8).translate(x, y, 24), glow);
    if (i < 10) kit.tube([[x, y, 23], [x + side * 4, y + 17.5, 25], [x + side * 8.75, y + 35, 23]], 1.6, bronze, 8);
  }
  addShaft(kit, new T.Vector3(-130, 500, 390), new T.Vector3(45, 80, -2), 64, 0x78dbd5);
  addShaft(kit, new T.Vector3(200, 630, 400), new T.Vector3(-120, 260, -2), 45, 0x4db7cb);
  addShaft(kit, new T.Vector3(-260, 800, 500), new T.Vector3(90, 510, -2), 60, 0x639eae);
  const viewH = { value: ctx.renderer.domElement.height };
  addDrift(kit, viewH, 210, 0x97e2dd);
  kit.finish(); kit.fitHeight(.69); bakeFloorReflection(kit, ctx.renderer, floor); kit.root.userData.theme = '碧潮水晶殿';
  return { root: kit.root, materials: kit.materials, update: time => { viewH.value = ctx.renderer.domElement.height; jewel.position.z = Math.sin(time * .65) * 2.5; } };

  function crystalGeometry(r: number, h: number): T.BufferGeometry {
    const g = zUp(new T.CylinderGeometry(r * .65, r, h * .65, 6, 1, false));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0 && Math.hypot(p.getX(i), p.getY(i)) < .01) p.setZ(i, h * .62);
    g.computeVertexNormals(); return g.toNonIndexed();
  }
  function seaFan(x: number, y: number, h: number, yaw: number): void {
    const g = new T.PlaneGeometry(1, 1, 44, 20), p = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const a = (uv.getX(i) - .5) * Math.PI * 1.1, t = uv.getY(i);
      const scallop = 1 + .05 * Math.cos(a * 15);
      p.setXYZ(i, Math.sin(a) * h * t * scallop, Math.sin(a * 7 + t * 4) * t * 2, Math.cos(a) * h * t * scallop + t * 7);
    }
    g.rotateZ(yaw).translate(x, y, 3); g.computeVertexNormals(); kit.geometry(g, fanMat);
    kit.tube([[x,y,0],[x,y,h*.3],[x+Math.sin(yaw)*5,y,h*.7]], 1.4, coralRose, 14);
  }
  function crystalCluster(x: number, y: number, z: number, height: number): void {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.39996, h = height * (.5 + kit.random() * .6);
      const g = crystalGeometry(h * .14, h).rotateX((kit.random() - .5) * .4).rotateY((kit.random() - .5) * .4).translate(x + Math.cos(a) * 6, y + Math.sin(a) * 6, z + h / 2);
      kit.geometry(g, crystal);
    }
  }
  function coral(x: number, y: number, z: number, size: number, material: ProcMaterial, seed: number): void {
    const grow = (base: T.Vector3, direction: T.Vector3, length: number, radius: number, depth: number) => {
      const end = base.clone().addScaledVector(direction, length), mid = base.clone().lerp(end, .5).add(new T.Vector3(Math.sin(seed + base.z) * 2, .5, 0));
      kit.tube([base.toArray(), mid.toArray(), end.toArray()], radius, material, 7);
      if (depth === 0) { kit.geometry(new T.SphereGeometry(radius * 1.3, 6, 5).translate(...end.toArray()), material); return; }
      for (const sign of [-1, 1]) {
        const d = direction.clone().add(new T.Vector3(sign * (.5 + kit.random() * .25), (kit.random() - .5) * .5, .15)).normalize();
        grow(end, d, length * .65, radius * .65, depth - 1);
      }
    };
    grow(new T.Vector3(x, y, z), new T.Vector3(.05, 0, 1), size * .4, size * .045, 4);
  }
}

registerProceduralScene('tide-palace', buildTidePalace);
