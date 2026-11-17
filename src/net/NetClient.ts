import type { ClientToServer, ServerToClient } from './protocol';
import type { Transport } from './Transport';

type Handler<T> = (data: T) => void;

/** 型別安全的收發（對照原版 Net_* 與 G2U_* 監聽） */
export class NetClient {
  private handlers = new Map<string, Set<Handler<unknown>>>();
  /** 除錯：最近的訊息 */
  readonly log: { dir: 'in' | 'out'; cmd: string; t: number }[] = [];

  constructor(private readonly transport: Transport) {
    transport.onMessage((msg) => {
      this.pushLog('in', msg.cmd);
      const set = this.handlers.get(msg.cmd);
      if (!set || set.size === 0) {
        console.debug(`[Net] unhandled ${msg.cmd}`);
        return;
      }
      for (const h of [...set]) {
        try {
          h(msg.data);
        } catch (err) {
          console.error(`[Net] handler ${msg.cmd} threw`, err);
        }
      }
    });
  }

  send<K extends keyof ClientToServer>(cmd: K, data: ClientToServer[K]): void {
    this.pushLog('out', cmd);
    this.transport.send({ cmd, data });
  }

  on<K extends keyof ServerToClient>(cmd: K, handler: Handler<ServerToClient[K]>): () => void {
    let set = this.handlers.get(cmd);
    if (!set) {
      set = new Set();
      this.handlers.set(cmd, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  /** 等待下一則指定訊息 */
  wait<K extends keyof ServerToClient>(cmd: K, timeoutMs = 10000): Promise<ServerToClient[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`[Net] wait ${cmd} timeout`));
      }, timeoutMs);
      const off = this.on(cmd, (d) => {
        clearTimeout(timer);
        off();
        resolve(d);
      });
    });
  }

  private pushLog(dir: 'in' | 'out', cmd: string): void {
    this.log.push({ dir, cmd, t: performance.now() });
    if (this.log.length > 200) this.log.shift();
  }

  close(): void {
    this.transport.close();
  }
}
