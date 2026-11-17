/**
 * 原版 PathMove.lua（PathMoveNormal:RunMovPathAct / CreateSplineMoveAct）的翻譯。
 *
 * 原版把整條路徑組成一個 cc.Sequence 交給 runAction 逐幀推進；
 * 這裡改成先「編譯」成分段時間軸，再用 evaluate(t) 直接求位置（可任意快轉 / 晚加入）。
 *
 * 每個 waypoint 依序產生：
 *   1. MoveTo(wp.duration, wp.xy)          從上一段終點線性移動（duration 0 = 瞬移）
 *   2. [waitStart] Delay(wp.wait) [waitEnd] wait > 0 時；waitStart/End 給 WaitAction 動畫用
 *   3. spline（若有）
 *        - 一般：cc.CardinalSplineTo（每段時間均分，忽略 pt.duration）
 *        - pt[1..] 有任何 wait > 0：改為逐段 cc.BezierTo，段後接 wait
 * 起點 = wp[0].xy（原版 setPosition(startPos)）
 */
import type { Vec2 } from '@core/math/cocos';
import type { PathDatum, PathSplinePoint } from './PathTypes';

export type PathSegment =
  | { kind: 'move'; t0: number; dur: number; from: Vec2; to: Vec2 }
  | { kind: 'wait'; t0: number; dur: number; at: Vec2 }
  | { kind: 'cardinal'; t0: number; dur: number; pts: Vec2[]; tension: number }
  | { kind: 'bezier'; t0: number; dur: number; a: Vec2; b: Vec2; c: Vec2; d: Vec2 };

/** wait 開始 / 結束的時間點（供 WaitAction：CheckTime == wait 時播動畫） */
export interface PathMarker {
  time: number;
  kind: 'waitStart' | 'waitEnd';
  wait: number;
}

/** cc.ccCardinalSplineAt */
export function cardinalSplineAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tension: number, t: number, out: Vec2): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const s = (1 - tension) / 2;
  const b1 = s * (-t3 + 2 * t2 - t);
  const b2 = s * (-t3 + t2) + (2 * t3 - 3 * t2 + 1);
  const b3 = s * (t3 - 2 * t2 + t) + (-2 * t3 + 3 * t2);
  const b4 = s * (t3 - t2);
  out.x = p0.x * b1 + p1.x * b2 + p2.x * b3 + p3.x * b4;
  out.y = p0.y * b1 + p1.y * b2 + p2.y * b3 + p3.y * b4;
  return out;
}

/** cc.CardinalSplineTo:update(time)，time ∈ [0,1] */
export function cardinalSplineEval(pts: readonly Vec2[], tension: number, time: number, out: Vec2): Vec2 {
  const n = pts.length;
  if (n === 1) {
    out.x = pts[0].x;
    out.y = pts[0].y;
    return out;
  }
  const deltaT = 1 / (n - 1);
  let p: number;
  let lt: number;
  if (time >= 1) {
    p = n - 1;
    lt = 1;
  } else {
    p = Math.floor(time / deltaT);
    lt = (time - deltaT * p) / deltaT;
  }
  const at = (i: number) => pts[Math.min(n - 1, Math.max(0, i))];
  return cardinalSplineAt(at(p - 1), at(p), at(p + 1), at(p + 2), tension, lt, out);
}

/** cc.BezierTo 的 bezierat（三次） */
function bezierAt(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * t * u * u * b + 3 * t * t * u * c + t * t * t * d;
}

export class PathTrack {
  readonly segments: PathSegment[] = [];
  readonly markers: PathMarker[] = [];
  readonly start: Vec2;
  readonly end: Vec2;
  readonly duration: number;

  constructor(path: PathDatum) {
    // Lua 空 table 會被序列化成 {}，不是陣列
    const wps = Array.isArray(path?.wp) ? path.wp : [];
    this.start = wps.length ? { x: wps[0].x, y: wps[0].y } : { x: 0, y: 0 };
    let t = 0;
    let cur: Vec2 = { ...this.start };

    const pushWait = (wait: number | undefined, at: Vec2) => {
      if (!wait || wait <= 0) return;
      this.markers.push({ time: t, kind: 'waitStart', wait });
      this.segments.push({ kind: 'wait', t0: t, dur: wait, at: { ...at } });
      t += wait;
      this.markers.push({ time: t, kind: 'waitEnd', wait });
    };

    for (const wp of wps) {
      // 1. MoveTo
      const to = { x: wp.x, y: wp.y };
      this.segments.push({ kind: 'move', t0: t, dur: Math.max(0, wp.duration ?? 0), from: { ...cur }, to });
      t += Math.max(0, wp.duration ?? 0);
      cur = to;
      // 2. wait
      pushWait(wp.wait, cur);
      // 3. spline
      const spline = wp.spline;
      if (spline && spline.pt && spline.pt.length) {
        const pts = spline.pt.map((p) => ({ x: p.x, y: p.y }));
        const tension = spline.tangent ?? 0;
        const hasSplineWait = spline.pt.slice(1).some((p) => (p.wait ?? 0) > 0);
        if (!hasSplineWait) {
          this.segments.push({ kind: 'cardinal', t0: t, dur: Math.max(0, spline.duration), pts, tension });
          t += Math.max(0, spline.duration);
          cur = { ...pts[pts.length - 1] };
        } else {
          const n = pts.length;
          const f = (1 - tension) / 6;
          for (let i = 1; i < n; i++) {
            // Lua 1-based：p0=pts[max(i-2,1)] p1=pts[i-1] p2=pts[i] p3=pts[min(i+1,n)] → 0-based 換算
            const p0 = pts[Math.max(i - 2, 0)];
            const p1 = pts[i - 1];
            const p2 = pts[i];
            const p3 = pts[Math.min(i + 1, n - 1)];
            const c1 = { x: p1.x + (p2.x - p0.x) * f, y: p1.y + (p2.y - p0.y) * f };
            const c2 = { x: p2.x - (p3.x - p1.x) * f, y: p2.y - (p3.y - p1.y) * f };
            const sp: PathSplinePoint = spline.pt[i];
            const dur = sp.duration ?? spline.duration / (n - 1);
            // BezierTo 以「實際目前位置」為起點
            this.segments.push({ kind: 'bezier', t0: t, dur: Math.max(0, dur), a: { ...cur }, b: c1, c: c2, d: { ...p2 } });
            t += Math.max(0, dur);
            cur = { ...p2 };
            pushWait(sp.wait, cur);
          }
        }
      }
    }
    this.duration = t;
    this.end = { ...cur };
  }

  /** 求 t 秒時的位置（t 超出範圍則夾在起點 / 終點） */
  evaluate(t: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
    if (this.segments.length === 0) {
      out.x = this.start.x;
      out.y = this.start.y;
      return out;
    }
    if (t >= this.duration) {
      out.x = this.end.x;
      out.y = this.end.y;
      return out;
    }
    const tt = Math.max(0, t);
    return this.evalSegment(this.findSegment(tt), tt, out);
  }

  /** 最後一個 t0 <= t 的段（同時間的零長度段取最後一個） */
  private findSegment(t: number): PathSegment {
    const segs = this.segments;
    let lo = 0;
    let hi = segs.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].t0 <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return segs[ans];
  }

  private evalSegment(seg: PathSegment, t: number, out: Vec2): Vec2 {
    const u = seg.dur <= 0 ? 1 : Math.min(1, Math.max(0, (t - seg.t0) / seg.dur));
    switch (seg.kind) {
      case 'move':
        out.x = seg.from.x + (seg.to.x - seg.from.x) * u;
        out.y = seg.from.y + (seg.to.y - seg.from.y) * u;
        return out;
      case 'wait':
        out.x = seg.at.x;
        out.y = seg.at.y;
        return out;
      case 'cardinal':
        return cardinalSplineEval(seg.pts, seg.tension, u, out);
      case 'bezier':
        out.x = bezierAt(seg.a.x, seg.b.x, seg.c.x, seg.d.x, u);
        out.y = bezierAt(seg.a.y, seg.b.y, seg.c.y, seg.d.y, u);
        return out;
    }
  }

  /** time 之前（含）最後一個符合條件的 marker，用於晚加入時還原 WaitAction 動畫狀態 */
  markersUntil(time: number): PathMarker[] {
    return this.markers.filter((m) => m.time <= time);
  }
}

/** 以 path id 快取編譯結果 */
export class PathLibrary {
  private cache = new Map<number, PathTrack>();
  constructor(private readonly data: Record<string, PathDatum>) {}

  get(pathId: number): PathTrack {
    let track = this.cache.get(pathId);
    if (!track) {
      const datum = this.data[String(pathId)] ?? this.data['1'];
      if (!this.data[String(pathId)]) console.error(`[PathLibrary] path ${pathId} not found, fallback to 1`);
      track = new PathTrack(datum);
      this.cache.set(pathId, track);
    }
    return track;
  }
}
