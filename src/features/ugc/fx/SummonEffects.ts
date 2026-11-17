/** One shared WebGL surface: domain-warped smoke, turbulent card coronas, embers and reveal shockwaves. */
import { CARD_FINISH, type CardFinish } from '../ui/SummonCard';

const vertex = `attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
const fragment = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uCharge, uAge, uStrength;
uniform vec2 uOrigin;
uniform vec3 uColor;
uniform vec4 uCornersA[10]; // projected top-left / top-right
uniform vec4 uCornersB[10]; // projected bottom-right / bottom-left
uniform vec3 uColors[10];
uniform int uCount;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
float fbm(vec2 p) {
  float n = 0.0, a = .5;
  mat2 m = mat2(.8,.6,-.6,.8);
  for(int i=0;i<4;i++) { n += a*noise(p); p = m*p*2.03 + 7.1; a *= .5; }
  return n;
}
float cross2(vec2 a, vec2 b) { return a.x*b.y-a.y*b.x; }
float segmentDistance2(vec2 v, vec2 edge) {
  vec2 closest = v-edge*clamp(dot(v,edge)/max(dot(edge,edge),.00000001),0.0,1.0);
  return dot(closest,closest);
}
float quadDistance(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  vec2 e0=b-a, e1=c-b, e2=d-c, e3=a-d;
  vec2 v0=p-a, v1=p-b, v2=p-c, v3=p-d;
  float distance2 = min(min(segmentDistance2(v0,e0),segmentDistance2(v1,e1)),
                        min(segmentDistance2(v2,e2),segmentDistance2(v3,e3)));
  // A CSS Y flip reverses the winding; the inside test must work for both faces.
  vec4 side = vec4(cross2(e0,v0),cross2(e1,v1),cross2(e2,v2),cross2(e3,v3))*sign(cross2(e0,d-a));
  float inside = step(0.0,min(min(side.x,side.y),min(side.z,side.w)));
  return sqrt(distance2)*(1.0-2.0*inside);
}
void main() {
  vec2 uv = gl_FragCoord.xy/uResolution;
  uv.y = 1.0-uv.y;
  vec2 aspect = vec2(uResolution.x/uResolution.y, 1.0);
  vec2 p = uv*aspect;
  float t = uTime;
  vec2 drift = vec2(t*.035, -t*.09);
  float warp = fbm(p*4.3+drift);
  float cloud = fbm(p*6.0+vec2(warp*3.0,warp*2.0)-drift);
  float filament = pow(max(0.0, 1.0-abs(cloud-.5)*2.0), 17.0);
  float floorFog = smoothstep(.42,1.0,uv.y);
  vec3 color = vec3(.14,.19,.23)*cloud*floorFog*.25;
  color += vec3(.65,.38,.12)*filament*floorFog*.09;

  // Each card has a soft, organically broken fire edge. Geometry is only an invisible distance field.
  for(int i=0;i<10;i++) {
    if(i>=uCount) break;
    vec2 a=uCornersA[i].xy*aspect, b=uCornersA[i].zw*aspect;
    vec2 c=uCornersB[i].xy*aspect, d=uCornersB[i].zw*aspect;
    float reach = .16;
    vec2 lo=min(min(a,b),min(c,d)), hi=max(max(a,b),max(c,d));
    if(any(lessThan(p,lo-reach)) || any(greaterThan(p,hi+reach))) continue;
    float distance = quadDistance(p,a,b,c,d);
    // Keep the flame's flow attached to the card's axes as well as its projected outline.
    vec2 delta = p-(a+b+c+d)*.25;
    vec2 local = vec2(dot(delta,(b-a)/max(length(b-a),.0001)),dot(delta,(d-a)/max(length(d-a),.0001)));
    float cardWarp = fbm(local*9.0+drift);
    float cardFilament = pow(max(0.0,1.0-abs(noise(local*23.0+cardWarp*2.0+drift)-.5)*2.0),13.0);
    // Original intensity, with only a slightly wider falloff and flame displacement.
    float edge = exp(-max(distance,0.0)*50.0)*smoothstep(-.015,.004,distance);
    float fire = exp(-abs(distance-(cardWarp-.45)*.075)*95.0);
    float breath = .65+.25*sin(t*1.8+float(i));
    color += uColors[i]*(edge*.23+fire*cardFilament*.7)*breath;
  }
  // Rising ember field with fine cores and broad photographic bloom.
  vec2 sp = p*vec2(32.0,22.0)+vec2(sin(t*.15)*.5,t*.48);
  vec2 cell = floor(sp), f = fract(sp);
  float seed = hash(cell);
  vec2 spot = vec2(hash(cell+7.3),hash(cell+17.2));
  float d = length((f-spot)*vec2(1.0,.65));
  float spark = (exp(-d*80.0)*1.5+exp(-d*14.0)*.08)*step(.88,seed);
  color += vec3(1.0,.6,.24)*spark*(.5+.5*sin(t*2.0+seed*30.0));

  vec2 c = (uv-uOrigin)*aspect;
  float radius = length(c);
  float angle = atan(c.y,c.x);
  float flow = fbm(vec2(angle*2.0+radius*3.0-t*.3,radius*6.0-t*.65));
  float funnel = exp(-abs(c.x+sin(c.y*7.0-t*1.7)*.04)*15.0);
  color += uColor*uCharge*(funnel*.27+filament*exp(-radius*2.5)*.5);
  // A non-strobing reveal: turbulent expanding plasma, radial light and an anamorphic flare.
  float life = exp(-uAge*2.5)*step(0.0,uAge);
  float wave = exp(-abs(radius-uAge*.56-(flow-.5)*.12)*46.0);
  float rays = pow(max(0.0,sin(angle*19.0+flow*6.0)),14.0)*exp(-radius*3.0);
  float flare = exp(-abs(c.y)*140.0)*exp(-abs(c.x)*2.0);
  color += uColor*(wave*.75+rays*.35+flare*.3)*life*uStrength;
  color += mix(uColor,vec3(1.0),.65)*exp(-radius*13.0)*life*uStrength*.7;
  float alpha = clamp(max(max(color.r,color.g),color.b),0.0,.85);
  gl_FragColor = vec4(color,alpha);
}`;

export class SummonEffects {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private cards: { element: HTMLElement; corners: HTMLElement[] }[] = [];
  private readonly cornersA = new Float32Array(40);
  private readonly cornersB = new Float32Array(40);
  private readonly colors = new Float32Array(30);
  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private burstAt = -100_000;
  private burstTarget: HTMLElement | null = null;
  private charge = 0;
  private currentCharge = 0;
  private origin = [.5, .5];
  private color: readonly number[] = CARD_FINISH.gold.rgb;
  private strength = 1;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resize = new ResizeObserver(() => this.layout());

  constructor(private readonly host: HTMLElement) {
    this.canvas.className = 'summon-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.stop(); this.canvas.hidden = true; });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.gl = null; this.program = null; this.buffer = null; this.uniforms.clear();
      if (this.host.getClientRects().length) this.start();
    });
  }

  private initialize(): boolean {
    if (this.program) return true;
    const gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    this.gl = gl;
    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return false; }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return false; }
    this.program = program;
    gl.useProgram(program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    for (const name of ['uResolution','uTime','uCharge','uAge','uStrength','uOrigin','uColor','uCornersA[0]','uCornersB[0]','uColors[0]','uCount']) {
      this.uniforms.set(name, gl.getUniformLocation(program, name));
    }
    return true;
  }

  start(): void {
    if (this.running || this.reduced.matches) return;
    if (!this.initialize()) { this.canvas.hidden = true; return; }
    this.canvas.hidden = false;
    this.running = true;
    this.resize.observe(this.host);
    document.addEventListener('visibilitychange', this.visibility);
    this.host.addEventListener('scroll', this.onScroll, true);
    this.layout();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.host.removeEventListener('scroll', this.onScroll, true);
    this.charge = this.currentCharge = 0;
    this.burstAt = -100_000;
    this.burstTarget = null;
  }

  private visibility = (): void => {
    cancelAnimationFrame(this.raf);
    if (!document.hidden && this.running) this.raf = requestAnimationFrame(this.tick);
  };
  private onScroll = (): void => this.layout();

  setCards(cards: HTMLElement[]): void {
    this.cards = cards.slice(0, 10).map(element => ({ element, corners: Array.from(element.querySelectorAll<HTMLElement>('.summon-card-corner')) }));
    this.layout();
  }
  setCharge(value: number): void { this.charge = value; }
  /** Squeeze build-up: move the charge funnel onto a card in its finish colour, without a burst. */
  aim(finish: CardFinish, target: HTMLElement): void { this.color = CARD_FINISH[finish].rgb; this.burstTarget = target; }

  burst(finish: CardFinish, target?: HTMLElement): void {
    this.color = CARD_FINISH[finish].rgb;
    this.strength = finish === 'red' ? 1.6 : finish === 'gold' ? 1.25 : .85;
    const bounds = this.host.getBoundingClientRect();
    const rect = target?.getBoundingClientRect();
    this.origin = rect && bounds.width ? [(rect.left + rect.width / 2 - bounds.left) / bounds.width, (rect.top + rect.height / 2 - bounds.top) / bounds.height] : [.5, .5];
    this.burstAt = performance.now();
    this.burstTarget = target ?? null;
  }

  private layout(): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const host = this.host.getBoundingClientRect();
    if (host.width <= 0 || host.height <= 0) return;
    // Cap fill-rate independently of the game's renderer / device pixel ratio.
    const scale = Math.min(1.25, 1300 / host.width, 900 / host.height);
    const width = Math.round(host.width * scale), height = Math.round(host.height * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.get('uResolution')!, width, height);
    this.updateCardProjection();
  }

  private updateCardProjection(): void {
    const gl = this.gl!;
    const host = this.canvas.getBoundingClientRect();
    if (host.width <= 0 || host.height <= 0) return;
    let count = 0;
    for (const { element, corners } of this.cards) {
      if (!element.isConnected || corners.length !== 4) continue;
      const [a, b, c, d] = corners.map(point => point.getBoundingClientRect());
      const ax=(a.x-host.x)/host.width, ay=(a.y-host.y)/host.height;
      const bx=(b.x-host.x)/host.width, by=(b.y-host.y)/host.height;
      const cx=(c.x-host.x)/host.width, cy=(c.y-host.y)/host.height;
      const dx=(d.x-host.x)/host.width, dy=(d.y-host.y)/host.height;
      // Hidden cards and an exactly edge-on flip have no surface. Avoid a degenerate SDF.
      if (Math.abs((bx-ax)*(dy-ay)-(by-ay)*(dx-ax)) < 1e-8) continue;
      this.cornersA.set([ax,ay,bx,by], count*4);
      this.cornersB.set([cx,cy,dx,dy], count*4);
      const finish = CARD_FINISH[(element.dataset.finish ?? 'gold') as CardFinish];
      this.colors.set(finish.rgb, count*3);
      if (element === this.burstTarget) this.origin = [(ax+bx+cx+dx)*.25, (ay+by+cy+dy)*.25];
      count++;
    }
    gl.uniform4fv(this.uniforms.get('uCornersA[0]')!, this.cornersA);
    gl.uniform4fv(this.uniforms.get('uCornersB[0]')!, this.cornersB);
    gl.uniform3fv(this.uniforms.get('uColors[0]')!, this.colors);
    gl.uniform1i(this.uniforms.get('uCount')!, count);
  }

  private tick = (now: number): void => {
    if (!this.running || document.hidden) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.lastFrame < 1000 / 30) return;
    this.lastFrame = now;
    const gl = this.gl!;
    gl.useProgram(this.program);
    // CSS transforms can change without a resize (hover, fan lift, deal, flip, spotlight).
    // Read the projected corner points on every rendered frame, reusing the uniform buffers.
    this.updateCardProjection();
    this.currentCharge += (this.charge-this.currentCharge)*.09;
    gl.uniform1f(this.uniforms.get('uTime')!, now / 1000);
    gl.uniform1f(this.uniforms.get('uCharge')!, this.currentCharge);
    gl.uniform1f(this.uniforms.get('uAge')!, (now-this.burstAt)/1000);
    gl.uniform1f(this.uniforms.get('uStrength')!, this.strength);
    gl.uniform2fv(this.uniforms.get('uOrigin')!, this.origin);
    gl.uniform3fv(this.uniforms.get('uColor')!, this.color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  dispose(): void {
    this.stop();
    if (this.gl) { this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    this.canvas.remove();
  }
}
