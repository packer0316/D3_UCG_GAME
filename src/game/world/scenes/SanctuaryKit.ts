/** Authored environments for the prison camera. Geometry is batched; lighting belongs to each scene. */
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneKit, mergeAll, zUp, makeGlowMesh, GLOW_FRAGMENT, ADDITIVE, type Glow } from './sceneKit';
import type { ProcMaterial } from './ProcMaterial';
import { seededRandom } from './noise';
import { SCENE_CAMERA } from './ProceduralScene';
import { MICROFACET_GLSL } from './SurfaceLighting';

export const ENVIRONMENT_GLSL = /* glsl */ `
 uniform samplerCube uEnvironment;uniform float uEnvironmentReady;
 vec3 sanctuaryEnvironment(vec3 direction,float roughness){
   if(uEnvironmentReady<.5)return gardenEnvironment(direction,roughness);
   return textureCube(uEnvironment,direction,roughness*5.).rgb;
 }
`;
export const environmentUniforms = (): Record<string,T.IUniform> => ({uEnvironment:{value:null},uEnvironmentReady:{value:0}});
export const shadowUniforms = (): Record<string,T.IUniform> => ({uStaticShadow:{value:null},uShadowMatrix:{value:new T.Matrix4()},uShadowReady:{value:0}});
export const SHADOW_GLSL = /* glsl */ `
 uniform sampler2D uStaticShadow;uniform mat4 uShadowMatrix;uniform float uShadowReady;
 float architecturalShadow(vec3 P,vec3 N){
   if(uShadowReady<.5)return 1.;
   vec4 q=uShadowMatrix*vec4(P+N*.28,1.);vec3 uv=q.xyz/q.w;
   if(any(lessThan(uv,vec3(.003)))||any(greaterThan(uv,vec3(.997))))return 1.;
   float shadow=0.;
   for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
     float depth=texture2D(uStaticShadow,uv.xy+vec2(float(x),float(y))*1.3/2048.).r;
     shadow+=step(uv.z-.0003,depth);
   }
   return shadow/9.;
 }
`;

const BASE = `${import.meta.env.BASE_URL}res/scenes/sanctuaries/`;
const textures = new Map<string, Promise<T.Texture>>();
export function surfaceTexture(path: string, repeat = true): Promise<T.Texture> {
  let task = textures.get(path);
  if (!task) {
    task = new T.TextureLoader().loadAsync(BASE + path).then(t => {
      t.wrapS = t.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
      t.anisotropy = 4;
      // The game's renderer uses display-space textures, matching its original Cocos materials.
      t.colorSpace = T.NoColorSpace;
      return t;
    });
    textures.set(path, task);
  }
  return task;
}

export interface SurfaceMaps { diffuse: T.Texture; normal: T.Texture; rough: T.Texture }
export async function loadSurface(name: string): Promise<SurfaceMaps> {
  const [diffuse, normal, rough] = await Promise.all(['diff', 'nor_gl', 'rough'].map(k => surfaceTexture(`surfaces/${name}-${k}.webp`)));
  return { diffuse, normal, rough };
}

export interface SanctuaryPalette {
  fog: number; ambient: number; light: number; rim: number;
  sun: [number, number, number]; warmth: number;
}
const rgb = (hex: number) => new T.Color(hex);
export const REFLECTION_GLSL = /* glsl */ `
  uniform sampler2D uReflection;
  uniform mat4 uReflectionMatrix;
  vec3 floorReflection(vec3 position, float distortion) {
    vec4 p=uReflectionMatrix*vec4(position,1.);
    vec2 uv=p.xy/p.w;
    uv+=vec2(sin(position.y*.14),cos(position.x*.17))*distortion;
    if(p.w<=0.||any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998))))return vec3(0.);
    return texture2D(uReflection,uv,distortion*650.).rgb;
  }
`;
export function reflectionUniforms(): Record<string, T.IUniform> {
  const empty = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); empty.needsUpdate = true;
  return { uReflection: { value: empty }, uReflectionMatrix: { value: new T.Matrix4() } };
}

export class SanctuaryKit extends SceneKit {
  private readonly batches = new Map<ProcMaterial, T.BufferGeometry[]>();
  readonly glows: Glow[] = [];
  readonly random: () => number;
  constructor(readonly palette: SanctuaryPalette, seed: number) { super(); this.random = seededRandom(seed); }

  surface(name: string, maps: SurfaceMaps, color: number, opts: { scale?: number; metal?: number; gloss?: number; marble?: boolean; uv?: boolean; floor?: number; emissive?: number } = {}): ProcMaterial {
    return this.material({ name, side: T.DoubleSide, uniforms: {
      uAlbedo: { value: maps.diffuse }, uNormalMap: { value: maps.normal }, uRough: { value: maps.rough },
      uTint: { value: rgb(color) }, uAmbient: { value: rgb(this.palette.ambient) }, uLight: { value: rgb(this.palette.light) },
      uRim: { value: rgb(this.palette.rim) }, uFog: { value: rgb(this.palette.fog) },
      uSun: { value: new T.Vector3(...this.palette.sun).normalize() }, uWarmth: { value: this.palette.warmth },
      ...environmentUniforms(),
      ...shadowUniforms(),
      ...(opts.floor ? reflectionUniforms() : {}),
    }, fragment: /* glsl */ `
      uniform sampler2D uAlbedo,uNormalMap,uRough;
      uniform vec3 uTint,uAmbient,uLight,uRim,uFog,uSun;
      uniform float uWarmth;
      ${MICROFACET_GLSL}
      ${ENVIRONMENT_GLSL}
      ${SHADOW_GLSL}
      ${opts.floor ? REFLECTION_GLSL : ''}
      vec4 shade() {
        vec3 N=normalize(vNormal)*(gl_FrontFacing?1.0:-1.0);
        vec3 an=abs(N);
        vec2 uv=${opts.uv ? 'vUv' : `(an.z>.55?vWorldPos.xy:an.x>an.y?vWorldPos.yz:vWorldPos.xz)*${(opts.scale ?? .035).toFixed(5)}`};
        vec3 tex=texture2D(uAlbedo,uv).rgb;
        vec3 albedo=mix(vec3(1.),tex,${opts.marble ? '.18' : '.72'})*uTint;
        vec3 normalTex=texture2D(uNormalMap,uv).xyz*2.-1.;
        vec3 dp1=dFdx(vWorldPos),dp2=dFdy(vWorldPos);
        vec2 duv1=dFdx(uv),duv2=dFdy(uv);
        vec3 t=cross(dp2,N)*duv1.x+cross(N,dp1)*duv2.x;
        vec3 b=cross(dp2,N)*duv1.y+cross(N,dp1)*duv2.y;
        float inv=inversesqrt(max(max(dot(t,t),dot(b,b)),.000001));
        N=normalize(N+(normalTex.x*t+normalTex.y*b)*inv*${opts.marble ? '.11' : '.32'});
        float grain=texture2D(uRough,uv).r;
        ${opts.marble ? `float vein=1.-smoothstep(.025,.10,abs(sin((vWorldPos.x*.05+vWorldPos.y*.027+vWorldPos.z*.032+tex.g*2.)*2.)));
        albedo=mix(albedo,albedo*.48,vein*.36);` : ''}
        ${opts.floor ? `vec2 tile=vWorldPos.xy/${opts.floor === 1 ? '24.' : '32.'};
        vec2 grid=min(fract(tile),1.-fract(tile));
        float joint=1.-smoothstep(.008,.018+max(fwidth(tile.x),fwidth(tile.y)),min(grid.x,grid.y));
        ${opts.floor === 1 ? `float check=mod(floor(tile.x)+floor(tile.y),2.);albedo*=mix(.42,.87,check);` : ''}
        albedo*=1.-joint*.52;
        float medallion=length(vWorldPos.xy-vec2(0.,250.));
        float inlay=1.-smoothstep(.5,1.1,abs(medallion-105.));
        albedo=mix(albedo,vec3(.48,.38,.20),inlay*.75);` : ''}
        float shadow=architecturalShadow(vWorldPos,N);
        float diffuse=max(dot(N,uSun),0.)*(.16+.84*shadow);
        float back=max(dot(N,normalize(vec3(-uSun.x,-.35,.4))),0.);
        float ao=mix(.55,1.,smoothstep(0.,25.,vWorldPos.z));
        if(abs(N.z)>.8)ao=.95;
        vec3 lighting=uAmbient*(.75+.25*max(N.z,0.))+uLight*diffuse*.75+uRim*back*.28;
        vec3 V=normalize(cameraPosition-vWorldPos);
        float rough=clamp(grain*.22+${(1 - (opts.gloss ?? .4)).toFixed(3)}*.70,.10,.94);
        // Specular antialiasing widens subpixel normal lobes instead of shimmering.
        vec3 dn1=dFdx(N),dn2=dFdy(N);
        rough=sqrt(clamp(rough*rough+.18*(dot(dn1,dn1)+dot(dn2,dn2)),.01,.94));
        float fresnel=pow(1.-max(dot(N,V),0.),5.);
        vec3 F0=mix(vec3(.045),albedo,${(opts.metal ?? 0).toFixed(3)});
        vec3 col=albedo*lighting*ao*${(1-(opts.metal??0)*.52).toFixed(3)};
        col+=ggxSpecular(N,V,uSun,F0,rough)*uLight*.9*shadow;
        col+=ggxSpecular(N,V,normalize(vec3(-.5,-.6,.4)),F0,rough)*uRim*.25;
        vec3 reflectedEnvironment=sanctuaryEnvironment(reflect(-V,N),rough);
        col+=reflectedEnvironment*schlickFresnel(F0,max(dot(N,V),0.))*(1.-rough*.7)*.8;
        ${opts.gloss && opts.gloss>.65 ? 'col+=ggxSpecular(N,V,uSun,vec3(.04),.12)*uLight*.22*shadow;' : ''}
        // Analytic pools complement the sculpted normals without adding global scene lights.
        float bay=mod(vWorldPos.y+35.,90.)-45.;
        float side=abs(vWorldPos.x)-(118.+max(vWorldPos.y,0.)*.23);
        float lamp=exp(-side*side*.0015-bay*bay*.002-abs(vWorldPos.z-16.)*.035);
        col+=albedo*vec3(1.,.48,.16)*lamp*uWarmth*(.94+.06*sin(uTime*3.1+floor(vWorldPos.y/90.)));
        ${opts.floor ? `float row=mod(vWorldPos.y-30.,90.)-45.;
        float column=abs(vWorldPos.x)-(118.+max(vWorldPos.y,0.)*.23);
        float contact=exp(-column*column*.003-row*row*.005);
        float castShadow=exp(-pow((column+18.)/32.,2.)-pow((row+14.)/22.,2.));
        col*=1.-contact*.38-castShadow*.16;
        vec3 reflected=floorReflection(vWorldPos,.0006+grain*.0007);
        float puddle=smoothstep(.30,.65,tex.g+vnoise(vWorldPos.xy*.018)*.25);
        float wet=(${opts.floor === 1 ? '.25' : '.09+puddle*.18'}+fresnel*.28)*(1.-joint*.85);
        // Fixed-view reflection smoothly fades when the home editor switches to its overhead camera.
        wet*=smoothstep(.25,.72,1.-max(dot(N,V),0.));
        col=mix(col,reflected,wet);
        ${opts.floor === 1 ? `vec2 rose=(vWorldPos.xy-vec2(-35.,385.))/vec2(115.,180.);float rr=length(rose);float aa=atan(rose.y,rose.x);float petal=pow(.5+.5*cos(aa*12.),5.);float lead=smoothstep(.01,.07,abs(sin(rr*20.)));vec3 glass=mix(vec3(.12,.18,.55),vec3(.55,.08,.17),.5+.5*sin(aa*5.));col+=glass*petal*lead*exp(-rr*rr*1.7)*.18;` : ''}
        ` : ''}
        ${name.startsWith('tide-') ? `vec2 wave=vWorldPos.xy*.035+vWorldPos.z*.017;float c1=sin(wave.x+sin(wave.y+uTime*.4)),c2=sin(wave.y*1.31-sin(wave.x-uTime*.3));float caustic=pow(max(0.,1.-abs(c1+c2)*.8),14.);col+=vec3(.10,.25,.23)*caustic*(.3+.7*max(N.z,0.));` : ''}
        ${opts.emissive ? `col+=uTint*${opts.emissive.toFixed(3)};` : ''}
        float heightDensity=exp(-max(vWorldPos.z,0.)*.018);
        float fog=1.-exp(-max(length(vViewPos)-260.,0.)*(.00048+heightDensity*.00023));
        return vec4(mix(col,uFog,fog),1.);
      }` });
  }

  emit(name: string, color: number, intensity = 1): ProcMaterial {
    return this.material({ name, uniforms: { uTint: { value: rgb(color) } }, side: T.DoubleSide, fragment: `uniform vec3 uTint; vec4 shade(){return vec4(uTint*${intensity.toFixed(3)},1.);}` });
  }
  geometry(g: T.BufferGeometry, material: ProcMaterial): void {
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material)!.push(g);
  }
  box(x: number, y: number, z: number, w: number, d: number, h: number, material: ProcMaterial): void {
    this.geometry(new T.BoxGeometry(w, d, h).translate(x, y, z), material);
  }
  cylinder(x: number, y: number, z: number, radius: number, height: number, material: ProcMaterial, top = radius, segments = 24): void {
    this.geometry(zUp(new T.CylinderGeometry(top, radius, height, segments)).translate(x, y, z), material);
  }
  tube(points: number[][], r: number, mat: ProcMaterial, segments = 36, closed = false): void {
    this.geometry(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(p[0], p[1], p[2])), closed), segments, r, 6, closed), mat);
  }
  ring(x: number, y: number, z: number, r: number, thickness: number, mat: ProcMaterial, vertical = false): void {
    const g = new T.TorusGeometry(r, thickness, 8, 64);
    if (vertical) g.rotateX(Math.PI / 2);
    this.geometry(g.translate(x, y, z), mat);
  }
  /** Curved Gothic archivolt in the X/Z plane. */
  arch(x: number, y: number, z: number, width: number, height: number, mat: ProcMaterial, r = 2): void {
    const shape = new T.Shape();
    shape.moveTo(-width / 2, 0); shape.lineTo(-width / 2, height * .58);
    shape.bezierCurveTo(-width / 2, height * .8, -width * .2, height * .96, 0, height);
    shape.bezierCurveTo(width * .2, height * .96, width / 2, height * .8, width / 2, height * .58);
    shape.lineTo(width / 2, 0);
    this.tube(shape.getPoints(28).map(p => [x + p.x, y, z + p.y]), r, mat, 80);
  }
  column(x: number, y: number, height: number, radius: number, stone: ProcMaterial, trim: ProcMaterial): void {
    this.box(x, y, 4, radius * 3.3, radius * 3.3, 8, stone);
    for (const [z, r, h] of [[10, 1.5, 4], [14, 1.22, 3], [height - 9, 1.22, 4], [height - 4, 1.5, 6]]) {
      this.cylinder(x, y, z, radius * r, h, trim);
    }
    const g = zUp(new T.CylinderGeometry(radius * .86, radius, height - 30, 64));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getY(i), p.getX(i));
      const flute = 1 - .07 * (.5 + .5 * Math.cos(angle * 16));
      p.setXY(i, p.getX(i) * flute, p.getY(i) * flute);
    }
    g.computeVertexNormals(); this.geometry(g.translate(x, y, height / 2), stone);
    this.box(x, y, height, radius * 3.2, radius * 3.2, 4, stone);
  }
  finish(): void {
    for (const [mat, parts] of this.batches) {
      const mesh = new T.Mesh(mergeAll(parts), mat); mesh.name = mat.name;
      this.add(mesh);
    }
    this.batches.clear();
    if (this.glows.length) {
      const mat = this.material({ name: 'local-light-halos', fragment: GLOW_FRAGMENT, vertexColors: true, uniforms: { uBlink: { value: 0 } }, ...ADDITIVE });
      this.add(makeGlowMesh(this.glows, mat));
    }
  }

  /** Compress authored height, baking inverse-transpose normals, while retaining the requested camera. */
  fitHeight(scale: number): void {
    this.root.traverse(o => {
      if (o.renderOrder < -1) return; // atmospheric sky remains spherical
      const geometry = (o as T.Mesh).geometry;
      if (geometry) geometry.scale(1, 1, scale);
    });
  }
}

/** Bake a real architectural reflection once; the game keeps its normal single world render pass. */
export function bakeFloorReflection(kit: SanctuaryKit, renderer: T.WebGLRenderer, floor: ProcMaterial): void {
  if (!floor.uniforms.uReflection) return;
  const target = new T.WebGLRenderTarget(1024, 576, { minFilter: T.LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: true });
  const camera = new T.PerspectiveCamera(SCENE_CAMERA.fov, 16 / 9, 10, 20000);
  const pitch = SCENE_CAMERA.pitchDown * Math.PI / 180;
  camera.position.set(SCENE_CAMERA.x, SCENE_CAMERA.y, -SCENE_CAMERA.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(SCENE_CAMERA.x, SCENE_CAMERA.y + Math.cos(pitch) * 100, -SCENE_CAMERA.z + Math.sin(pitch) * 100);
  camera.updateMatrixWorld(true);
  const bias = new T.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
  const matrix = bias.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  const hidden: T.Object3D[] = [];
  kit.root.traverse(o => {
    const material = (o as T.Mesh).material;
    const transparent = material && (Array.isArray(material) ? material.some(m => m.transparent) : material.transparent);
    if (material === floor || transparent) { if (o.visible) hidden.push(o); o.visible = false; }
  });
  const previousTarget = renderer.getRenderTarget(), clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha();
  const parent=kit.root.parent;
  const scene = new T.Scene(); scene.add(kit.root);
  const environment=new T.WebGLCubeRenderTarget(256,{minFilter:T.LinearMipmapLinearFilter,generateMipmaps:true});
  const probe=new T.CubeCamera(4,10000,environment);
  probe.position.set(0,350,48);
  const shadowTarget=new T.WebGLRenderTarget(2048,2048,{minFilter:T.NearestFilter,magFilter:T.NearestFilter});
  shadowTarget.depthTexture=new T.DepthTexture(2048,2048,T.UnsignedIntType);
  const lightCamera=new T.OrthographicCamera(-590,590,590,-590,1,2400);
  const aim=new T.Vector3(0,330,0);
  lightCamera.position.copy(aim).addScaledVector(new T.Vector3(...kit.palette.sun).normalize(),1100);
  lightCamera.up.set(0,0,1);lightCamera.lookAt(aim);lightCamera.updateMatrixWorld(true);
  const shadowMatrix=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(lightCamera.projectionMatrix).multiply(lightCamera.matrixWorldInverse);
  const depthMaterial=new T.MeshDepthMaterial();
  const sky=kit.root.children.filter(o=>o.renderOrder < -1 && o.visible);
  try {
    sky.forEach(o=>{o.visible=false;});
    scene.overrideMaterial=depthMaterial;
    renderer.setRenderTarget(shadowTarget);renderer.setClearColor(0xffffff,1);renderer.clear();renderer.render(scene,lightCamera);
    scene.overrideMaterial=null;sky.forEach(o=>{o.visible=true;});
    for(const material of kit.materials)if(material.uniforms.uStaticShadow){
      material.uniforms.uStaticShadow.value=shadowTarget.depthTexture;
      material.uniforms.uShadowMatrix.value=shadowMatrix;
      material.uniforms.uShadowReady.value=1;
    }
    // Real local architectural probe, captured once. Roughness selects the cubemap mip level.
    renderer.setClearColor(kit.palette.fog,1);
    probe.update(renderer,scene);
    for(const material of kit.materials)if(material.uniforms.uEnvironment){
      material.uniforms.uEnvironment.value=environment.texture;
      material.uniforms.uEnvironmentReady.value=1;
    }
    renderer.setRenderTarget(target); renderer.setClearColor(kit.palette.fog, 1); renderer.clear(); renderer.render(scene, camera);
  } finally {
    scene.overrideMaterial=null;depthMaterial.dispose();sky.forEach(o=>{o.visible=true;});
    renderer.setRenderTarget(previousTarget); renderer.setClearColor(clear, alpha); scene.remove(kit.root); hidden.forEach(o => { o.visible = true; });
    parent?.add(kit.root);
  }
  (floor.uniforms.uReflection.value as T.Texture).dispose();
  floor.uniforms.uReflection.value = target.texture;
  floor.uniforms.uReflectionMatrix.value = matrix;
  kit.root.userData.reflection = target;
  kit.root.userData.environment = environment;
  kit.root.userData.staticShadow = shadowTarget;
}

let sculpture: Promise<{ geometry: T.BufferGeometry; maps: SurfaceMaps }> | undefined;
export function loadSculpture(): Promise<{ geometry: T.BufferGeometry; maps: SurfaceMaps }> {
  sculpture ??= new GLTFLoader().loadAsync(BASE + 'gothic_statue/gothic_statue.gltf').then(asset => {
    asset.scene.updateMatrixWorld(true);
    let source: T.Mesh | undefined;
    asset.scene.traverse(o => { if ((o as T.Mesh).isMesh) source = o as T.Mesh; });
    if (!source) throw new Error('Gothic sculpture is missing its mesh');
    const g = source.geometry.clone().applyMatrix4(source.matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox!, center = b.getCenter(new T.Vector3());
    const scale = 1 / (b.max.y - b.min.y);
    g.translate(-center.x, -b.min.y, -center.z).scale(scale, scale, scale).rotateX(Math.PI / 2);
    const mat = source.material as T.MeshStandardMaterial;
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) if (t) { t.colorSpace = T.NoColorSpace; t.anisotropy = 4; }
    return { geometry: g, maps: { diffuse: mat.map!, normal: mat.normalMap!, rough: mat.roughnessMap! } };
  });
  return sculpture;
}

export function addSky(kit: SanctuaryKit, top: number, horizon: number, kind: 'night' | 'ocean' | 'dawn'): void {
  const mat = kit.material({ name: `${kind}-atmosphere`, side: T.BackSide, depthWrite: false, uniforms: {
    uTop: { value: rgb(top) }, uHorizon: { value: rgb(horizon) },
  }, fragment: /* glsl */ `uniform vec3 uTop,uHorizon;
    vec4 shade(){
      vec3 d=normalize(vWorldPos-cameraPosition);
      float high=smoothstep(-.12,.6,d.z);
      vec3 c=mix(uHorizon,uTop,high);
      float clouds=fbm(d.xy*4.+d.z*3.+vec2(uTime*.004,0.));
      c+=vec3(${kind === 'ocean' ? '.025,.13,.14' : '.10,.07,.10'})*smoothstep(.38,.78,clouds)*(.4+high*.6);
      ${kind === 'night' ? `float moon=length(d-normalize(vec3(-.35,1.,.36)));c+=vec3(.65,.78,1.)*(1.-smoothstep(.035,.04,moon))*.7;c+=vec3(.1,.15,.3)*exp(-moon*13.);` : ''}
      ${kind === 'ocean' ? `float sun=length(d-normalize(vec3(-.3,1.,.7)));c+=vec3(.22,.55,.54)*exp(-sun*3.);float ripple=pow(max(0.,1.-abs(clouds-.52)*15.),5.);c+=vec3(.06,.17,.16)*ripple*high;` : ''}
      ${kind === 'dawn' ? `float sun=length(d-normalize(vec3(.45,1.,.17)));c+=vec3(.8,.33,.12)*exp(-sun*8.);c+=vec3(1.,.77,.42)*(1.-smoothstep(.025,.03,sun));` : ''}
      return vec4(c,1.);
    }` });
  kit.add(new T.Mesh(new T.SphereGeometry(5000, 32, 20), mat), -3);
}

/** Soft, moving volumetric-looking shafts: transparent tapered geometry, never global bloom. */
export function addShaft(kit: SanctuaryKit, start: T.Vector3, end: T.Vector3, width: number, color: number): void {
  const direction = end.clone().sub(start), length = direction.length();
  const g = new T.CylinderGeometry(width * .3, width, length, 24, 1, true);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.clone().normalize()));
  g.translate(...start.clone().add(end).multiplyScalar(.5).toArray());
  const mat = kit.material({ name: 'soft-light-shaft', transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    uniforms: { uTint: { value: rgb(color) } }, fragment: `uniform vec3 uTint;vec4 shade(){vec3 V=normalize(cameraPosition-vWorldPos);float rim=pow(abs(dot(normalize(vNormal),V)),1.5);float fade=sin(vUv.y*3.14159);float a=rim*fade*.045*(.8+.2*sin(vWorldPos.z*.07+uTime*.15));return vec4(uTint,a);}` });
  kit.add(new T.Mesh(g, mat));
}

export function addDrift(kit: SanctuaryKit, viewH: T.IUniform, count: number, color: number, petals = false): void {
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([(kit.random() - .5) * 750, kit.random() * 780, kit.random() * 220 + 5], i * 3);
    seeds[i] = kit.random();
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(positions, 3)); geo.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
  const mat = kit.material({ name: petals ? 'falling-maple-leaves' : 'ambient-motes', transparent: true, depthWrite: false,
    defines: { PROC_WORLD: true, PROC_POINTS: true }, uniforms: { uViewH: viewH, uTint: { value: rgb(color) } },
    vertex: `attribute float aSeed;varying float seed;uniform float uViewH;
      void procWorld(inout vec3 p){seed=aSeed;p.x+=sin(uTime*.3+aSeed*20.)*9.;p.y+=cos(uTime*.15+aSeed*25.)*7.;p.z=mod(p.z-uTime*${petals ? '2.4' : '.8'}+10000.,220.);}
      float procPointSize(vec4 mv){return ${petals ? '7.' : '2.4'}*uViewH/900.*clamp(400./-mv.z,.5,3.);}`,
    fragment: `uniform vec3 uTint;varying float seed;vec4 shade(){vec2 p=gl_PointCoord-.5;float a=uTime*.3+seed*6.28;p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;float r=length(p*vec2(1.,${petals ? '1.8' : '1.'}));float alpha=(1.-smoothstep(.18,.48,r))*.65;return vec4(uTint*(.7+.3*sin(seed*40.+uTime)),alpha);}` });
  kit.add(new T.Points(geo, mat));
}
