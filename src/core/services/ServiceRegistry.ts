/**
 * 以 token 取得服務的簡易容器（避免全域單例互相 import）。
 *   export const AudioToken = createToken<AudioManager>('audio');
 *   services.register(AudioToken, audio);
 *   services.get(AudioToken).play(...)
 */
export interface ServiceToken<T> {
  readonly name: string;
  /** 只用於型別推導 */
  readonly __type?: T;
}

export function createToken<T>(name: string): ServiceToken<T> {
  return { name };
}

export class ServiceRegistry {
  private map = new Map<ServiceToken<unknown>, unknown>();

  register<T>(token: ServiceToken<T>, impl: T): void {
    if (this.map.has(token)) console.warn(`[Services] "${token.name}" re-registered`);
    this.map.set(token, impl);
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.map.has(token)) throw new Error(`[Services] "${token.name}" not registered`);
    return this.map.get(token) as T;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    return this.map.get(token) as T | undefined;
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.map.has(token);
  }
}
