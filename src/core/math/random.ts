/** 可指定種子的亂數（mulberry32），假 server 與測試用 */
export class Random {
  private s: number;
  constructor(seed = Date.now() >>> 0) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, it) => s + weight(it), 0);
    let r = this.next() * total;
    for (const it of items) {
      r -= weight(it);
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}
