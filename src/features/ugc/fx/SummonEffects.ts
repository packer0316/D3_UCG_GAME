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
uniform vec4 uRects[10];
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
float rectDistance(vec2 p, vec2 b) {
  vec2 q = abs(p)-b+0.012;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-0.012;
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
    vec4 r = uRects[i];
    vec2 local = (uv-r.xy)*aspect;
    float d = rectDistance(local,r.zw*aspect*.5);
    float edge = exp(-max(d,0.0)*56.0)*smoothstep(-.015,.004,d);
    float fire = exp(-abs(d-(warp-.45)*.065)*95.0);
    float breath = .65+.25*sin(t*1.8+float(i));
    color += uColors[i]*(edge*.23+fire*filament*.7)*breath;
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
  private cards: HTMLElement[] = [];
  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private burstAt = -100_000;
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
    for (const name of ['uResolution','uTime','uCharge','uAge','uStrength','uOrigin','uColor','uRects[0]','uColors[0]','uCount']) {
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
  }

  private visibility = (): void => {
    cancelAnimationFrame(this.raf);
    if (!document.hidden && this.running) this.raf = requestAnimationFrame(this.tick);
  };
  private onScroll = (): void => this.layout();

  setCards(cards: HTMLElement[]): void { this.cards = cards.slice(0, 10); this.layout(); }
  setCharge(value: number): void { this.charge = value; }

  burst(finish: CardFinish, target?: HTMLElement): void {
    this.color = CARD_FINISH[finish].rgb;
    this.strength = finish === 'red' ? 1.6 : finish === 'gold' ? 1.25 : .85;
    const bounds = this.host.getBoundingClientRect();
    const rect = target?.getBoundingClientRect();
    this.origin = rect && bounds.width ? [(rect.left + rect.width / 2 - bounds.left) / bounds.width, (rect.top + rect.height / 2 - bounds.top) / bounds.height] : [.5, .5];
    this.burstAt = performance.now();
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
    const rects = new Float32Array(40), colors = new Float32Array(30);
    this.cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      rects.set([(r.left+r.width/2-host.left)/host.width, (r.top+r.height/2-host.top)/host.height, r.width/host.width, r.height/host.height], i*4);
      colors.set(CARD_FINISH[(card.dataset.finish ?? 'gold') as CardFinish].rgb, i*3);
    });
    gl.uniform4fv(this.uniforms.get('uRects[0]')!, rects);
    gl.uniform3fv(this.uniforms.get('uColors[0]')!, colors);
    gl.uniform1i(this.uniforms.get('uCount')!, this.cards.length);
  }

  private tick = (now: number): void => {
    if (!this.running || document.hidden) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.lastFrame < 1000 / 30) return;
    this.lastFrame = now;
    const gl = this.gl!;
    gl.useProgram(this.program);
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
