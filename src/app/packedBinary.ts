/**
 * Artifact 發佈版用：claude.ai Artifact 不提供 .c3b / .efk / .efkmat / .efkmodel / .bin 這類二進位檔，
 * 發佈時（tools/build-artifact.mjs）把它們轉成同名的 `*.b64.txt`（base64 文字）。
 * 這裡攔截 fetch（模型、glTF）與 XMLHttpRequest（Effekseer 自己的載入器），讀 .b64.txt 再還原成 ArrayBuffer，
 * 呼叫端完全不用改。只在 VITE_PACKED_BINARY=1 的建置中安裝（main.ts）。
 */

const PACKED = /\.(c3b|efk|efkmat|efkmodel|bin)(?=$|[?#])/i;

/** 原始 URL → 打包後的 URL（去掉 query / hash，加上 .b64.txt） */
function packedUrl(url: string): string {
  return url.replace(/[?#].*$/, '') + '.b64.txt';
}

function base64ToBuffer(text: string): ArrayBuffer {
  const s = text.trim();
  const fromBase64 = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  if (fromBase64) return fromBase64(s).buffer as ArrayBuffer;
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function installPackedBinary(): void {
  const origFetch = window.fetch.bind(window);
  const cache = new Map<string, Promise<ArrayBuffer>>();
  const load = (url: string): Promise<ArrayBuffer> => {
    const key = packedUrl(url);
    let p = cache.get(key);
    if (!p) {
      p = origFetch(key).then(async (r) => {
        if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
        return base64ToBuffer(await r.text());
      });
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    // 每次給一份新的 ArrayBuffer：呼叫端可能會 transfer / 改寫
    return p.then((b) => b.slice(0));
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!PACKED.test(url)) return origFetch(input, init);
    return load(url).then(
      (buf) => new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }),
      () => new Response(null, { status: 404 }),
    );
  };

  // Effekseer 以 XHR（responseType = arraybuffer）讀 .efk 與其相依檔；只處理非同步請求
  const packedXhr = new WeakMap<XMLHttpRequest, string>();
  const open = XMLHttpRequest.prototype.open as (this: XMLHttpRequest, ...args: unknown[]) => void;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = String(args[1]);
    const async = args.length < 3 || args[2] !== false;
    if (async && PACKED.test(url)) packedXhr.set(this, url);
    else packedXhr.delete(this);
    return open.apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = packedXhr.get(this);
    if (!url) return send.call(this, body);
    const define = (k: string, v: unknown) => Object.defineProperty(this, k, { configurable: true, value: v });
    load(url).then(
      (buf) => {
        define('response', buf);
        define('status', 200);
        define('readyState', 4);
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('load'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      },
      () => {
        define('status', 404);
        define('readyState', 4);
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('error'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      },
    );
  };
}
