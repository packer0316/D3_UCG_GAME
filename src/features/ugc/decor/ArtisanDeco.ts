/** Twelve authored Z-up garden models. Geometry is merged per finish; animation is entirely on the GPU. */
import * as T from 'three';
import type { DecoDefine } from '@game/ugc/DecoDefine';
import type { DecoObjectOptions } from './DecoFactory';
import { ProcMaterial } from '@game/world/scenes/ProcMaterial';
import { MICROFACET_GLSL } from '@game/world/scenes/SurfaceLighting';
import { mergeAll, zUp } from '@game/world/scenes/sceneKit';
import { seededRandom } from '@game/world/scenes/noise';

type Finish = 'stone' | 'metal' | 'wood' | 'leaf' | 'wax' | 'snow' | 'cloth' | 'glaze';
type Mat = ProcMaterial;
const v = (p: number[]) => new T.Vector3(p[0], p[1], p[2]);

class Atelier {
  readonly root = new T.Group();
  readonly random = seededRandom(4815);
  private readonly batches = new Map<Mat, T.BufferGeometry[]>();
  constructor(private readonly opts: DecoObjectOptions) {}
  material(name: string, color: number, kind: Finish = 'stone', emission = 0): Mat {
    const metal = kind === 'metal' ? .85 : 0;
    const rough = { stone: .58, metal: .25, wood: .43, leaf: .52, wax: .34, snow: .72, cloth: .9, glaze: .17 }[kind];
    return new ProcMaterial({ name, side: T.DoubleSide, transparent: !!this.opts.ghost || !!this.opts.editing, depthWrite: !this.opts.ghost,
      uniforms: { uTint: { value: new T.Color(color) }, uOpacity: { value: this.opts.ghost ? .56 : 1 } },
      fragment: /* glsl */ `${MICROFACET_GLSL}
      uniform vec3 uTint;uniform float uOpacity;
      vec4 shade(){
        vec3 N=normalize(vNormal)*(gl_FrontFacing?1.:-1.),V=normalize(cameraPosition-vWorldPos);
        float grain=vnoise3(vWorldPos*${kind === 'wood' ? 'vec3(2.8,2.8,.16)' : kind==='snow'?'24.':'3.7'});
        vec3 base=uTint*(${kind==='snow'?'.96+.04':'.90+.10'}*grain);
        ${kind === 'wood' ? 'base*=.93+.07*sin(vWorldPos.x*8.+grain*2.);' : ''}
        ${kind === 'stone' || kind === 'glaze' ? 'float veins=pow(1.-abs(sin(vWorldPos.x*.6+vWorldPos.z*.35+grain*2.)),12.);base*=1.-veins*.16;' : ''}
        ${kind === 'snow' ? 'base+=vec3(.08,.13,.18)*pow(grain,7.);' : ''}
        vec3 L=normalize(vec3(-.45,-.65,1.)),rim=normalize(vec3(.65,.5,.55));
        float ao=mix(.62,1.,smoothstep(0.,3.5,vWorldPos.z));
        vec3 c=base*(vec3(.35,.40,.47)+vec3(.83,.76,.63)*max(dot(N,L),0.)*.68)*ao;
        vec3 F0=mix(vec3(.045),base,${metal.toFixed(2)});
        float rough=clamp(${rough.toFixed(2)}+(grain-.5)*.12,.12,.95);
        c*=1.-${(metal * .5).toFixed(2)};
        c+=ggxSpecular(N,V,L,F0,rough)*vec3(.75,.66,.48)*1.2;
        c+=ggxSpecular(N,V,rim,F0,rough)*vec3(.22,.38,.53);
        c+=gardenEnvironment(reflect(-V,N),rough)*schlickFresnel(F0,max(dot(N,V),0.))*(1.-rough*.65)*.65;
        ${kind === 'leaf' ? 'c+=base*max(dot(-N,L),0.)*.38+vec3(.05,.1,.02)*pow(1.-abs(dot(N,V)),2.);' : ''}
        ${kind === 'glaze' || kind === 'wax' ? 'c+=ggxSpecular(N,V,L,vec3(.04),.13)*.4;' : ''}
        c+=uTint*${emission.toFixed(3)}*(.92+.08*sin(uTime*3.6+vWorldPos.z));
        return vec4(c,uOpacity);
      }` });
  }
  custom(name: string, fragment: string, vertex = '', defines: Record<string, boolean> = {}): Mat {
    return new ProcMaterial({ name, side: T.DoubleSide, transparent: !!this.opts.ghost || !!this.opts.editing, depthWrite: !this.opts.ghost,
      uniforms: { uOpacity: { value: this.opts.ghost ? .56 : 1 } }, defines, vertex,
      fragment: `${MICROFACET_GLSL}\nuniform float uOpacity;\n${fragment}` });
  }
  add(g: T.BufferGeometry, m: Mat): void {
    if (!this.batches.has(m)) this.batches.set(m, []);
    this.batches.get(m)!.push(g);
  }
  box(x: number,y: number,z: number,w: number,d: number,h: number,m: Mat): void {this.add(new T.BoxGeometry(w,d,h).translate(x,y,z),m);}
  ball(x: number,y: number,z: number,rx: number,ry: number,rz: number,m: Mat,segments=20): void {
    this.add(new T.SphereGeometry(1,segments,12).scale(rx,ry,rz).translate(x,y,z),m);
  }
  cylinder(x: number,y: number,z: number,r: number,h: number,m: Mat,top=r,segments=24): void {
    this.add(zUp(new T.CylinderGeometry(top,r,h,segments)).translate(x,y,z),m);
  }
  ring(x: number,y: number,z: number,r: number,t: number,m: Mat,rotation=0): void {
    this.add(new T.TorusGeometry(r,t,6,48).rotateX(rotation).translate(x,y,z),m);
  }
  tube(points: number[][],r: number,m: Mat,segments=20): void {
    this.add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v)),segments,r,6,false),m);
  }
  branch(points: number[][],r: number,m: Mat): void {
    const curve=new T.CatmullRomCurve3(points.map(v)),g=new T.TubeGeometry(curve,24,r,8,false),p=g.getAttribute('position');
    for(let i=0;i<=24;i++){
      const center=curve.getPointAt(i/24),taper=1.-.82*Math.pow(i/24,.8);
      for(let j=0;j<=8;j++){const k=i*9+j;p.setXYZ(k,center.x+(p.getX(k)-center.x)*taper,center.y+(p.getY(k)-center.y)*taper,center.z+(p.getZ(k)-center.z)*taper);}
    }
    g.computeVertexNormals();this.add(g,m);
  }
  lathe(points: number[][],x: number,y: number,z: number,m: Mat): void {
    this.add(zUp(new T.LatheGeometry(points.map(p=>new T.Vector2(p[0],p[1])),48)).translate(x,y,z),m);
  }
  leaf(x: number,y: number,z: number,length: number,width: number,angle: number,m: Mat): void {
    const g=new T.SphereGeometry(1,8,5).scale(length,width,.09).rotateY(Math.sin(angle*2.4)*.65).rotateX(Math.cos(angle)*.5).rotateZ(angle).translate(x,y,z);this.add(g,m);
  }
  rose(x: number,y: number,z: number,size: number,m: Mat): void {
    for(let j=0;j<3;j++)for(let i=0;i<5;i++){
      const a=i*Math.PI*.4+j*.65,r=size*(.17+j*.23);
      this.add(new T.SphereGeometry(1,8,6).scale(size*.42,size*.20,size*.48).rotateX(.35+j*.25).rotateZ(a).translate(x+Math.cos(a)*r,y+Math.sin(a)*r,z+j*.1),m);
    }
  }
  finish(rot: 0|1): T.Group {
    for(const [mat,parts] of this.batches){
      const mesh=new T.Mesh(mergeAll(parts),mat);mesh.name=mat.name;
      if(this.opts.ghost||this.opts.editing)mesh.renderOrder=10;
      mesh.onBeforeRender=()=>{mat.time=performance.now()*.001;};
      this.root.add(mesh);
    }
    this.root.rotation.z=rot*Math.PI/2;
    this.root.userData.artisan=true;
    return this.root;
  }
}

const WATER = /* glsl */ `
vec4 shade(){
 vec2 p=vDecoPos.xy;float t=uTime;
 vec2 slopes=vec2(cos(p.x*1.9+t*1.6)+cos(p.y*2.8-t*1.1),sin(p.y*1.7+t*1.4)+sin(p.x*2.2+t))*.085;
 vec3 N=normalize(vNormal+vec3(slopes,0.)),V=normalize(cameraPosition-vWorldPos);
 float F=pow(1.-abs(dot(N,V)),4.);
 float ripples=pow(.5+.5*sin(length(p)*3.8-t*3.),12.);
 vec3 c=mix(vec3(.025,.21,.25),vec3(.17,.48,.51),F)+gardenEnvironment(reflect(-V,N),.12)*(.22+F*.45);
 c+=ggxSpecular(N,V,normalize(vec3(-.45,-.65,1.)),vec3(.04),.15)*1.5;
 c+=vec3(.13,.27,.26)*ripples*.27;
 return vec4(c,uOpacity);
}`;

export function buildArtisanDeco(def: DecoDefine,rot: 0|1,opts: DecoObjectOptions): T.Object3D {
  const a=new Atelier(opts);
  const stone=a.material('carved-ivory-stone',0xc7c7b9,'stone');
  const gold=a.material('antique-brass',0xcda759,'metal');
  const iron=a.material('wrought-iron',0x313b40,'metal');
  const wood=a.material('carved-heartwood',0x925735,'wood');
  const green=a.material('living-foliage',0x438351,'leaf');
  const red=a.material('rose-petals',0xb82f48,'wax');
  const light=a.material('warm-lantern-glass',0xffc374,'glaze',.65);
  const water=a.custom('rippling-water',`varying vec3 vDecoPos;${WATER}`,'varying vec3 vDecoPos;void procDisplace(inout vec3 p,inout vec3 n){vDecoPos=p;}',{PROC_DISPLACE:true});

  // Material instances not used by this particular model must not survive the build.
  const possible=[stone,gold,iron,wood,green,red,light,water];
  switch(def.id){
    case 'pumpkin_lantern': {
      const skin=a.material('ribbed-pumpkin-rind',0xdd7624,'wax');
      const g=new T.SphereGeometry(1,64,32),p=g.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),theta=Math.atan2(y,x);
        const ribs=1.-.065*Math.cos(theta*10.);
        p.setXYZ(i,x*3.25*ribs,y*2.9*ribs,z*3.+3.8);
      }
      g.computeVertexNormals();a.add(g,skin);
      a.tube([[0,0,6.5],[.15,0,7.6],[-.75,.1,8.6]],.4,green);
      for(const sign of [-1,1]){
        a.tube([[sign*2.6,0,4],[sign*3.8,-.2,4.8],[sign*4.1,-.2,6],[sign*3.6,-.4,6.3]],.21,wood);
        a.tube([[sign*1.5,0,1.4],[sign*1.8,-.6,.6],[sign*2.4,-1.4,.35]],.3,wood);
        a.leaf(sign*.85,.1,7.2,1,.43,sign*.4,green);
      }
      // Carved eyes and mouth follow the curved rind with a dark recessed lip.
      const face=a.custom('pumpkin-carved-light',`vec4 shade(){vec2 q=vUv;float eyes=0.;for(int i=0;i<2;i++){vec2 e=q-vec2(.31+float(i)*.38,.65);eyes=max(eyes,step(abs(e.x),(.15-e.y)*.6)*step(-.085,e.y)*step(e.y,.15));}float smile=step(abs(q.x-.5),.34)*step(.22+abs(q.x-.5)*.3,q.y)*step(q.y,.38+abs(q.x-.5)*.2);float tooth=step(.6,fract(q.x*12.))*step(.31,q.y);float cut=max(eyes,smile*(1.-tooth));if(cut<.5)discard;float flame=.82+.18*sin(uTime*5.+q.x*12.)*sin(uTime*3.+q.y*9.);return vec4(vec3(1.,.54,.065)*flame,uOpacity);}`);
      const faceGeo=new T.PlaneGeometry(5.3,4.4,24,20),fp=faceGeo.getAttribute('position');
      for(let i=0;i<fp.count;i++){
        const x=fp.getX(i),z=fp.getY(i)+3.8;
        const y=-3.18*Math.sqrt(Math.max(.01,1.-x*x/10.56-(z-3.8)**2/9.));
        fp.setXYZ(i,x,y-.08,z);
      }
      faceGeo.computeVertexNormals();a.add(faceGeo,face);break;
    }
    case 'victorian_lamp': {
      a.cylinder(0,0,.45,2.8,.9,stone,2.5);a.cylinder(0,0,1.3,1.5,1.1,iron,1.15);
      a.lathe([[1.1,1.8],[1.1,2.4],[.5,3.2],[.4,16.8],[.8,17.6]],0,0,0,iron);
      for(const z of [3,6,15.8,17.6])a.ring(0,0,z,.55,.13,gold);
      for(const s of [-1,1])a.tube([[0,0,14],[s*2,0,15.4],[s*2.5,0,17.1],[s*1.7,0,17.7]],.18,gold);
      a.cylinder(0,0,18.3,2.2,.55,iron,2.2,6);
      a.cylinder(0,0,20.1,1.65,3.2,light,2,6);
      for(let i=0;i<6;i++){const t=i*Math.PI/3;a.tube([[Math.cos(t)*1.68,Math.sin(t)*1.68,18.55],[Math.cos(t)*2,Math.sin(t)*2,21.7]],.11,iron,4);}
      a.cylinder(0,0,22.5,2.65,1.7,iron,.6,6);a.ring(0,0,21.7,2.2,.12,gold);
      a.ball(0,0,23.6,.42,.42,.65,gold);break;
    }
    case 'taiwan_flag': {
      a.cylinder(-3.2,0,.5,1.45,1,stone,1.25);a.cylinder(-3.2,0,12,.18,23,gold);a.ball(-3.2,0,23.8,.35,.35,.35,gold);
      a.ring(-3.2,0,.95,1.22,.12,gold);
      const flag=a.custom('taiwan-silk-flag',/* glsl */ `
       vec4 shade(){vec2 uv=vUv;vec3 c=vec3(.83,.055,.095);
       if(uv.x<.5&&uv.y>.5){c=vec3(.035,.10,.48);vec2 p=(uv-vec2(.25,.75))*vec2(1.5,1.);float r=length(p),theta=atan(p.y,p.x);
       float sector=mod(theta+3.14159265/12.,6.2831853/12.)-3.14159265/12.;
       float edge=.142*cos(3.14159265/12.)/(cos(sector)+sin(abs(sector))*2.25);
       float rays=1.-smoothstep(edge-.002,edge+.002,r);float disk=1.-smoothstep(.078,.082,r);
       float blueRing=smoothstep(.083,.087,r)*(1.-smoothstep(.091,.095,r));c=mix(c,vec3(.98),max(disk,rays*(1.-blueRing)));}
       vec3 N=normalize(vNormal);float shine=pow(abs(dot(N,normalize(cameraPosition-vWorldPos))),9.);
       float weave=.97+.03*sin(uv.x*900.)*sin(uv.y*600.);return vec4(c*(.76+.24*abs(N.y))*weave+vec3(.11)*shine,uOpacity);
       }`,
       'void procDisplace(inout vec3 p,inout vec3 n){float u=uv.x,phase=u*7.-uTime*2.4;p.y+=sin(phase)*u*.48+sin(u*17.-uTime*3.5)*u*.12;p.z+=sin(u*4.-uTime*1.9)*u*.16;n=normalize(vec3(-cos(phase)*u*.5,-1.,.06));}',{PROC_DISPLACE:true});
      // X/Z plane, readable from the gameplay camera, flag stays inside its one-cell plot.
      a.add(new T.PlaneGeometry(6.8,4.53,32,12).rotateX(Math.PI/2).translate(.2,-.02,20.5),flag);break;
    }
    case 'snowman': {
      const snow=a.material('sparkling-powder-snow',0xd9edf3,'snow');
      a.ball(0,0,2.6,3,2.8,2.7,snow);a.ball(0,0,6.1,2.3,2.2,2.35,snow);a.ball(0,0,9.5,1.85,1.8,1.85,snow);
      a.cylinder(0,0,11.2,2.35,.3,iron);a.cylinder(0,0,12.5,1.5,2.4,iron);a.cylinder(0,0,11.8,1.52,.45,red);
      a.ring(0,0,7.9,1.75,.42,red);a.box(1,-1.9,6.5,.85,.35,2.6,red);
      for(const x of [-.62,.62])a.ball(x,-1.65,9.9,.2,.16,.2,iron);
      for(let i=0;i<5;i++){const x=(i-2)*.3;a.ball(x,-1.72,8.9+x*x*.5,.11,.13,.11,iron,8);}
      const carrot=a.material('carrot',0xe68730,'wax');a.add(new T.ConeGeometry(.25,1.35,12).rotateX(Math.PI).translate(0,-2.35,9.4),carrot);
      for(const z of [4.9,6,6.9])a.ball(0,-2.13,z,.19,.13,.19,iron);
      for(const s of [-1,1]){a.tube([[s*1.7,0,6.5],[s*3.3,0,7.1],[s*4.2,0,8.4]],.16,wood);a.tube([[s*3.3,0,7.1],[s*4.4,-.1,7.2]],.12,wood,6);}break;
    }
    case 'mushroom_lantern': {
      a.ball(0,0,.4,4.1,3.5,.65,green);
      for(const [x,y,z,r] of [[-.7,.4,5.8,3],[2,-1.4,3.4,1.6],[-2.4,-1.5,2.7,1.3]]){
        a.cylinder(x,y,z*.43,r*.25,z*.8,stone,r*.31);
        const cap=new T.SphereGeometry(r,32,16,0,Math.PI*2,0,Math.PI*.53).rotateX(Math.PI/2).translate(x,y,z);a.add(cap,red);
        a.cylinder(x,y,z,r*.93,.14,stone,r*.93);
        for(let j=0;j<9;j++){const t=j*2.4,rad=r*(.3+(j%3)*.21);a.ball(x+Math.cos(t)*rad,y+Math.sin(t)*rad,z+Math.sqrt(r*r-rad*rad)*.97,.23,.23,.09,stone,8);}
        a.ball(x,y-r*.26,z*.48,r*.2,.08,r*.23,light);
      }
      for(let i=0;i<10;i++){const t=i*2.4;a.leaf(Math.cos(t)*3,Math.sin(t)*2.5,.7,.8,.3,t,green);}break;
    }
    case 'lotus_bowl': {
      const glaze=a.material('celadon-crackle-glaze',0x6fbaa7,'glaze');
      a.lathe([[0,0],[2.3,0],[2.6,.4],[3.5,1.2],[4.2,2.7],[4.25,3],[3.95,3],[3.7,2.65],[3.4,1.2]],0,0,0,glaze);
      a.ring(0,0,3,4.1,.12,gold);a.cylinder(0,0,2.65,3.8,.05,water);
      for(const [x,y,r] of [[-1.5,-.7,1.3],[1.4,.9,1.1],[.1,1.8,.85]])a.ball(x,y,2.75,r,r*.8,.07,green);
      const pink=a.material('lotus-silk-petals',0xf2a3b8,'wax');
      for(let j=0;j<3;j++)for(let i=0;i<8;i++){const t=i*Math.PI/4+j*.3,r=1.15-j*.32;
        a.add(new T.SphereGeometry(1,10,8).scale(.43,1.25-j*.2,.12).rotateX(.18+j*.22).rotateZ(t).translate(Math.sin(t)*r,-Math.cos(t)*r,3.2+j*.23),pink);}
      a.ball(0,0,3.8,.42,.42,.18,gold);
      for(let i=0;i<14;i++){const t=i*Math.PI/7;a.ball(Math.cos(t)*.35,Math.sin(t)*.35,3.96,.065,.065,.13,gold,6);}break;
    }
    case 'rose_bench': {
      for(let i=0;i<5;i++)a.box(0,-1.6+i*.7,4.7,16,.56,.45,wood);
      for(let i=0;i<4;i++)a.box(0,2,6+i*.85,16,.48,.65,wood);
      for(const s of [-1,1]){
        for(const y of [-1.8,1.7])a.tube([[s*7,y,.3],[s*6.8,y,2.5],[s*7,y,5.2]],.24,iron);
        a.tube([[s*7.1,-2.5,5],[s*7.1,-2.5,6.7],[s*7.1,0,7.4],[s*7.1,2.1,7.1],[s*7.1,2.1,5]],.22,iron);
        a.tube([[s*7.1,1.8,9],[s*7.1,1.8,3],[s*7.1,-1.2,2],[s*7.1,-1.8,3.2]],.15,gold);
        for(let i=0;i<5;i++){const z=5.7+i*.65;a.rose(s*(7.6+.25*Math.sin(i)),1.5,z,.42,red);a.leaf(s*7.6,1.4,z-.3,.65,.25,i,green);}
      }break;
    }
    case 'wishing_well': {
      for(let row=0;row<4;row++)for(let i=0;i<16;i++){
        const t=(i+row*.5)*Math.PI/8;
        const b=new T.BoxGeometry(1.5,.9,.85).rotateZ(t+Math.PI/2).translate(Math.cos(t)*3.8,Math.sin(t)*3.8,.6+row*.92);a.add(b,stone);
      }
      a.ring(0,0,4.1,3.85,.25,gold);a.cylinder(0,0,1.7,3.3,.08,water);
      for(const x of [-6,6])a.box(x,0,6.8,.7,.85,13.2,wood);
      a.add(zUp(new T.CylinderGeometry(.48,.48,12.4,16)).rotateY(Math.PI/2).translate(0,0,9),wood);
      a.tube([[.2,0,8.9],[.2,0,7],[.2,0,5.2]],.09,gold,8);
      a.lathe([[0,0],[.7,0],[1,1.2],[.85,1.2],[.6,.2]],.2,0,4.8,gold);a.ring(.2,0,6.05,.86,.08,iron);
      for(const side of [-1,1]){
        const roof=new T.BoxGeometry(14.8,4.7,.4).rotateX(-side*.48).translate(0,side*1.9,12.9);a.add(roof,red);
        for(let i=0;i<18;i++)a.tube([[-7+i*.8,side*4.1,11.8],[-7+i*.8,side*2,12.9],[-7+i*.8,0,13.9]],.12,wood,8);
      }
      a.tube([[-7.5,0,14],[-3,0,14.1],[3,0,14.1],[7.5,0,14]],.22,gold);
      for(let i=0;i<12;i++){const t=i*.7;a.leaf(-6+Math.cos(t)*.7,Math.sin(t)*.6,1+i*.7,.65,.26,t,green);}break;
    }
    case 'celestial_orrery': {
      a.box(0,0,.7,8,7,1.4,stone);a.lathe([[2.8,1.4],[2.8,2],[1.3,2.8],[.8,6],[1.8,7],[2,7.5]],0,0,0,gold);
      const blue=a.material('sapphire-star-globe',0x3aadd4,'glaze',.18);a.ball(0,0,11.1,2,2,2,blue,32);
      const orbit=a.custom('turning-celestial-rings',`vec4 shade(){vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorldPos);vec3 f0=vec3(.7,.45,.15);vec3 c=f0*(.4+.3*max(N.z,0.));c+=gardenEnvironment(reflect(-V,N),.22)*schlickFresnel(f0,abs(dot(N,V)));c+=ggxSpecular(N,V,normalize(vec3(-.4,-.6,1.)),f0,.24);return vec4(c,uOpacity);}`,
        'void procDisplace(inout vec3 p,inout vec3 n){float t=uTime*.12;mat2 r=mat2(cos(t),-sin(t),sin(t),cos(t));p.xz=r*(p.xz-vec2(0.,11.1))+vec2(0.,11.1);n.xz=r*n.xz;}',{PROC_DISPLACE:true});
      for(let i=0;i<3;i++){
        a.add(new T.TorusGeometry(3.25+i*.68,.13,8,80).rotateX(Math.PI/2).rotateZ(.25+i*.5).translate(0,0,11.1),orbit);
        const t=i*2.3;a.ball(Math.cos(t)*3.3,Math.sin(t)*1.8,11.1+Math.sin(t)*3.3,.5,.5,.5,i%2?red:blue);
      }
      for(let i=0;i<16;i++){const t=i*Math.PI/8;a.ball(Math.cos(t)*2.4,Math.sin(t)*2.4,2,.12,.12,.12,iron,8);}break;
    }
    case 'banyan_tree': {
      a.ball(0,0,.35,13.7,4.1,.55,stone);a.ball(0,0,.75,12.9,3.8,.45,green);
      a.branch([[0,0,.7],[-1.1,.1,6],[.5,0,12],[-.5,0,21]],1.65,wood);
      for(let i=0;i<8;i++){
        const t=i*Math.PI/4;a.tube([[Math.cos(t)*5,Math.sin(t)*2.4,.8],[Math.cos(t)*2.5,Math.sin(t)*1.4,1.5],[0,0,5]],.4,wood,12);
      }
      for(const s of [-1,1])for(let i=0;i<3;i++){
        const x=s*(5+i*3.1),y=(i-1)*1.5,z=17.5-i*.8;
        a.branch([[0,0,8+i*1.3],[s*4,y*.5,14],[x,y,z+1.4]],.7-i*.1,wood);
        for(let j=0;j<5;j++){const dx=(j-2)*.6;a.tube([[x+dx,y,z],[x+dx+.25,y+.2,z*.5],[x+dx+.5,y+.1,1.4+(j%2)*2]],.06,wood,12);}
        for(let j=0;j<65;j++){
          const t=a.random()*Math.PI*2,r=Math.sqrt(a.random());
          const lx=x+Math.cos(t)*r*2.5,ly=y+Math.sin(t)*r*1.6,lz=z+1.5+(1-r)*2.4+a.random();
          a.leaf(lx,ly,lz,.65+a.random()*.4,.3,t,green);
        }
      }
      for(let i=0;i<220;i++){
        const t=a.random()*Math.PI*2,r=Math.sqrt(a.random());
        const x=Math.cos(t)*r*7.6,y=Math.sin(t)*r*3.1,z=19.2+(1-r)*2.7+a.random()*1.5;
        a.leaf(x,y,z,.65+a.random()*.35,.32,t,green);
      }
      break;
    }
    case 'rose_pergola': {
      for(const s of [-1,1]){
        a.box(s*11,0,.8,4.2,5,1.6,stone);a.box(s*11,0,2,3.1,3.8,1.2,stone);
        a.cylinder(s*11,0,9.8,1.25,14.2,stone,1.25,32);
        for(let i=0;i<8;i++){const t=i*Math.PI/4;a.cylinder(s*11+Math.cos(t)*1.16,Math.sin(t)*1.16,9.8,.16,13,stone);}
        for(const z of [3,16.5,17.2])a.box(s*11,0,z,3.5,4,.5,gold);
        a.lathe([[1.4,0],[1.5,.4],[1.9,2.4],[2,2.6],[1.7,2.6]],s*11,-2,0,stone);
        for(let i=0;i<15;i++){const t=i*.8,z=3+i*.85,x=s*11+Math.cos(t)*1.7,y=Math.sin(t)*1.7;a.leaf(x,y,z,.9,.35,t,green);if(i%2===0)a.rose(x,y-.25,z,.55,red);}
      }
      for(const y of [-1.6,1.6])a.tube([[-12,y,17],[-7,y,19.7],[0,y,21],[7,y,19.7],[12,y,17]],.5,stone,40);
      for(let i=-10;i<=10;i+=2)a.tube([[i,-2.4,20.5-i*i*.025],[i,0,20.9-i*i*.025],[i,2.4,20.5-i*i*.025]],.16,gold,8);
      for(let i=0;i<38;i++){
        const x=(a.random()-.5)*25,y=(a.random()-.5)*3,z=20.6-x*x*.024;
        a.leaf(x,y,z,.95,.38,i,green);if(i%2===0)a.rose(x,y-.4,z+.25,.6,red);
      }break;
    }
    case 'celestial_fountain': {
      a.cylinder(0,0,.55,9.25,1.1,stone,9.25,8);a.cylinder(0,0,1.35,8.7,.8,stone,8.4,48);
      a.lathe([[7.5,1.6],[8,1.6],[8.5,2.3],[8.7,3.5],[8.7,4.1],[8.1,4.1],[7.7,3.3],[7.5,1.6]],0,0,0,stone);
      a.ring(0,0,4.1,8.4,.18,gold);a.ring(0,0,2,8.15,.13,gold);
      a.cylinder(0,0,3.6,7.9,.07,water);
      a.lathe([[2.5,1.7],[2.5,3.8],[1.5,5],[1.1,7.8],[2,9],[2.2,9.3]],0,0,0,stone);
      a.lathe([[1.8,8.7],[2.3,9],[4.1,10.2],[4.4,10.8],[4.3,11.2],[3.9,11.2],[2,9.6]],0,0,0,stone);
      a.ring(0,0,11.1,4.25,.16,gold);a.cylinder(0,0,10.9,3.9,.07,water);
      a.lathe([[1.4,10.5],[1,12.2],[.65,13.6]],0,0,0,gold);
      const sapphire=a.material('fountain-blue-crystal',0x53b6d0,'glaze',.16);a.ball(0,0,14.5,1.7,1.7,1.7,sapphire,32);
      for(let i=0;i<6;i++){
        const t=i*Math.PI/3,c=Math.cos(t),s=Math.sin(t);
        a.tube([[c*3.8,s*3.8,10.8],[c*5.4,s*5.4,10.4],[c*6.7,s*6.7,7.8],[c*7.3,s*7.3,3.65]],.105,water,30);
        a.ring(c*7.25,s*7.25,3.69,.45,.035,water);
        a.rose(c*8.35,s*8.35,2.85,.45,gold);
        a.tube([[c*1.3,s*1.3,5.2],[c*1.85-s*.35,s*1.85+c*.35,6.4],[c*1.4-s*.65,s*1.4+c*.65,7.9]],.10,gold,12);
      }
      const drops=a.custom('falling-fountain-droplets',`vec4 shade(){vec3 V=normalize(cameraPosition-vWorldPos),N=normalize(vNormal);float F=pow(1.-abs(dot(N,V)),3.);return vec4(vec3(.35,.67,.75)+gardenEnvironment(reflect(-V,N),.1)*(.3+F*.4),uOpacity);}`,
        'void procDisplace(inout vec3 p,inout vec3 n){float t=fract(uv.x-uTime*.3);float a=uv.y*6.2831853;vec3 center=vec3(cos(a)*(3.9+t*3.4),sin(a)*(3.9+t*3.4),10.9-7.2*t*t);p+=center;}',{PROC_DISPLACE:true});
      for(let i=0;i<30;i++){
        const g=new T.SphereGeometry(.085,6,4),uv=g.getAttribute('uv');for(let j=0;j<uv.count;j++)uv.setXY(j,(i%5)/5,Math.floor(i/5)/6);a.add(g,drops);
      }
      break;
    }
  }
  const root=a.finish(rot),used=new Set<T.Material>();
  root.traverse(o=>{if((o as T.Mesh).isMesh)used.add((o as T.Mesh).material as T.Material);});
  possible.filter(m=>!used.has(m)).forEach(m=>m.dispose());
  const shadow=new T.Mesh(new T.PlaneGeometry(def.w*9.6,def.d*9.6),new T.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{opacity:{value:opts.ghost ? .12 : .28}},
    vertexShader:'varying vec2 uvShadow;void main(){uvShadow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 uvShadow;uniform float opacity;void main(){vec2 p=uvShadow*2.-1.;float a=exp(-dot(p,p)*3.)*(1.-smoothstep(.65,1.,length(p)));gl_FragColor=vec4(.025,.035,.045,a*opacity);}',
  }));
  shadow.name='soft-contact-shadow';shadow.position.z=.035;shadow.renderOrder=opts.editing||opts.ghost?8:0;root.add(shadow);
  return root;
}
