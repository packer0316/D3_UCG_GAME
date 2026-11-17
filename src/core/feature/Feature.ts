/**
 * 擴充機制：每個功能（debug 面板、之後的抽卡、BossShow…）實作 GameFeature，
 * 在 install() 內向 context 註冊事件、UI、render pass、registry。
 * FeatureManager 依 deps 排序安裝，並在每幀呼叫 update。
 */
export interface GameFeature<Ctx> {
  readonly id: string;
  readonly deps?: readonly string[];
  install(ctx: Ctx): void | Promise<void>;
  update?(dt: number): void;
  dispose?(): void;
}

export class FeatureManager<Ctx> {
  private installed: GameFeature<Ctx>[] = [];

  constructor(private readonly ctx: Ctx) {}

  async installAll(features: GameFeature<Ctx>[]): Promise<void> {
    for (const f of sortByDeps(features)) {
      await f.install(this.ctx);
      this.installed.push(f);
      console.info(`[Feature] installed ${f.id}`);
    }
  }

  get<T extends GameFeature<Ctx>>(id: string): T | undefined {
    return this.installed.find((f) => f.id === id) as T | undefined;
  }

  update(dt: number): void {
    for (const f of this.installed) f.update?.(dt);
  }

  disposeAll(): void {
    for (const f of [...this.installed].reverse()) f.dispose?.();
    this.installed = [];
  }
}

function sortByDeps<Ctx>(features: GameFeature<Ctx>[]): GameFeature<Ctx>[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const out: GameFeature<Ctx>[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (f: GameFeature<Ctx>) => {
    const s = state.get(f.id);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`[Feature] circular dependency at ${f.id}`);
    state.set(f.id, 'visiting');
    for (const d of f.deps ?? []) {
      const dep = byId.get(d);
      if (!dep) throw new Error(`[Feature] ${f.id} depends on missing ${d}`);
      visit(dep);
    }
    state.set(f.id, 'done');
    out.push(f);
  };
  features.forEach(visit);
  return out;
}
