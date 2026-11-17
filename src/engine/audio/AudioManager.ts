/**
 * Web Audio 音效 / BGM。瀏覽器需使用者互動後才能播放：第一次點擊時自動 resume。
 * 路徑使用原版 SoundDefine 寫法（例如 "sound/MG_3"），實際檔案 Sound/mp3/<name>.mp3
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private pendingBgm: string | null = null;
  /** 同一音效最短間隔（避免連射時疊太多） */
  private lastPlay = new Map<string, number>();
  muted = false;

  constructor(private readonly resolveUrl: (path: string) => string) {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
      if (this.pendingBgm) {
        const n = this.pendingBgm;
        this.pendingBgm = null;
        void this.playBgm(n);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: false, capture: true });
    window.addEventListener('keydown', unlock, { once: false, capture: true });
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.45;
      this.bgmGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private path(name: string): string {
    return this.resolveUrl(`Sound/mp3/${name}.mp3`);
  }

  load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ensure();
      p = fetch(this.path(name))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((b) => ctx.decodeAudioData(b))
        .catch((e) => {
          console.warn(`[Audio] load ${name} failed`, e);
          return null;
        });
      this.buffers.set(name, p);
    }
    return p;
  }

  play(name: string, opts: { volume?: number; minInterval?: number } = {}): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state !== 'running') return;
    const now = performance.now();
    const minI = (opts.minInterval ?? 0.03) * 1000;
    if (now - (this.lastPlay.get(name) ?? -Infinity) < minI) return;
    this.lastPlay.set(name, now);
    void this.load(name).then((buf) => {
      if (!buf || !this.sfxGain) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (opts.volume !== undefined && opts.volume !== 1) {
        const g = ctx.createGain();
        g.gain.value = opts.volume;
        src.connect(g).connect(this.sfxGain);
      } else src.connect(this.sfxGain);
      src.start();
    });
  }

  async playBgm(name: string): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state !== 'running') {
      this.pendingBgm = name;
      return;
    }
    const buf = await this.load(name);
    if (!buf || !this.bgmGain) return;
    this.bgmSource?.stop();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.bgmGain);
    src.start();
    this.bgmSource = src;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.bgmGain) this.bgmGain.gain.value = m ? 0 : 0.45;
  }
}
