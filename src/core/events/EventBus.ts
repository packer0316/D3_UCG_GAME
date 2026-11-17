/**
 * 型別安全的事件匯流排。
 * Events 為「事件名稱 → payload 型別」的對照表，例如：
 *   interface GameEvents { 'fish:killed': { serial: number } }
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, fn: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Listener<Events[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] listener of "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
