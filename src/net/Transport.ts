import type { NetMessage } from './protocol';

/** 傳輸層介面：假 server 用 LocalTransport，真 server 換成 WebSocketTransport 即可 */
export interface Transport {
  send(msg: NetMessage): void;
  onMessage(cb: (msg: NetMessage) => void): void;
  close(): void;
}

/** 真 server 用（預留） */
export class WebSocketTransport implements Transport {
  private ws: WebSocket;
  private listeners: ((m: NetMessage) => void)[] = [];
  private queue: NetMessage[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      for (const m of this.queue) this.ws.send(JSON.stringify(m));
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as NetMessage;
      for (const l of this.listeners) l(msg);
    };
  }

  send(msg: NetMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  onMessage(cb: (msg: NetMessage) => void): void {
    this.listeners.push(cb);
  }

  close(): void {
    this.ws.close();
  }
}
