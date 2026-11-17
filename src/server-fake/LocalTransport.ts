import type { NetMessage } from '@net/protocol';
import type { Transport } from '@net/Transport';

/**
 * 同一頁面內的 client ↔ server 傳輸，模擬網路延遲；訊息以 structuredClone 複製（避免共用參考）。
 */
export function createLocalTransportPair(latencyMs: () => number = () => 20 + Math.random() * 40): {
  client: Transport;
  server: Transport;
} {
  const clientListeners: ((m: NetMessage) => void)[] = [];
  const serverListeners: ((m: NetMessage) => void)[] = [];
  let closed = false;
  // 保持訊息順序：每個方向的送達時間不早於上一則
  let lastToServer = 0;
  let lastToClient = 0;

  const deliver = (listeners: ((m: NetMessage) => void)[], msg: NetMessage, dir: 'toServer' | 'toClient') => {
    if (closed) return;
    const copy = structuredClone(msg);
    const now = performance.now();
    const last = dir === 'toServer' ? lastToServer : lastToClient;
    const at = Math.max(now + latencyMs(), last);
    if (dir === 'toServer') lastToServer = at;
    else lastToClient = at;
    setTimeout(() => {
      if (closed) return;
      for (const l of listeners) l(copy);
    }, at - now);
  };

  return {
    client: {
      send: (m) => deliver(serverListeners, m, 'toServer'),
      onMessage: (cb) => clientListeners.push(cb),
      close: () => (closed = true),
    },
    server: {
      send: (m) => deliver(clientListeners, m, 'toClient'),
      onMessage: (cb) => serverListeners.push(cb),
      close: () => (closed = true),
    },
  };
}
