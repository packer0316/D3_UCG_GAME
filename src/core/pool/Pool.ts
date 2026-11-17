/** 簡單物件池（對應原版 ModelMgr:pop / push） */
export class Pool<T> {
  private free: T[] = [];
  constructor(
    private readonly create: () => T,
    private readonly reset?: (item: T) => void,
    private readonly max = 256,
  ) {}

  pop(): T {
    return this.free.pop() ?? this.create();
  }

  push(item: T): void {
    this.reset?.(item);
    if (this.free.length < this.max) this.free.push(item);
  }

  get size(): number {
    return this.free.length;
  }
}

/** 以 key 分池（例如每個模型路徑一個池） */
export class KeyedPool<T> {
  private pools = new Map<string, T[]>();
  constructor(private readonly maxPerKey = 64) {}

  pop(key: string): T | undefined {
    return this.pools.get(key)?.pop();
  }

  push(key: string, item: T): void {
    let list = this.pools.get(key);
    if (!list) {
      list = [];
      this.pools.set(key, list);
    }
    if (list.length < this.maxPerKey) list.push(item);
  }
}
