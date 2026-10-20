import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_FRAME, alphaOf, lerp, tick } from '../src/clock';
import { DT } from '../src/logic';

/** 画面の更新が hz で、時刻に jitterMs のゆらぎがあるときの、各フレームの時刻(ミリ秒)。乱数は固定 */
function frames(hz: number, jitterMs: number, seconds: number): number[] {
  let s = 12345;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: number[] = [];
  for (let f = 0; f < seconds * hz; f++) out.push(f * (1000 / hz) + (rnd() - 0.5) * 2 * jitterMs);
  return out;
}

describe('ゲームの進め方(tick)', () => {
  it('たまった時間が 1 ステップに足りなければ進まず、足りれば進む', () => {
    expect(tick(0, DT / 2)).toEqual({ steps: 0, acc: DT / 2 });
    const t = tick(DT / 2, DT * 0.75);
    expect(t.steps).toBe(1);
    expect(t.acc).toBeCloseTo(DT / 4, 9);
  });

  it('長い時間(タブを離れたあとなど)でも、一気に進めすぎない', () => {
    const t = tick(0, 5);
    expect(t.steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(tick(0, 5).steps).toBe(6); // 0.1 秒ぶん = 6 ステップ
    expect(tick(0, -1).steps).toBe(0);
  });

  it('時間のたまり方に誤差がたまらない: 60 秒走ると、ちょうど 3600 ステップ進む', () => {
    for (const hz of [60, 120, 90]) {
      let acc = 0;
      let steps = 0;
      const times = frames(hz, 0, 60);
      let last = times[0];
      for (const t of times.slice(1)) {
        const r = tick(acc, (t - last) / 1000);
        acc = r.acc;
        steps += r.steps;
        last = t;
      }
      expect(Math.abs(steps - 3600), `${hz}Hz`).toBeLessThanOrEqual(2);
    }
  });

  it('alphaOf は 0〜1 に収まり、lerp は間を補う', () => {
    expect(alphaOf(-1)).toBe(0);
    expect(alphaOf(DT * 3)).toBe(1);
    expect(alphaOf(DT / 2)).toBeCloseTo(0.5, 9);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('補間して描くと、動きが揃う(カクつかない)', () => {
  /** 各フレームで画面に出る位置(速さ 1 の距離。1 ステップで DT 進む)を、補間あり・なしで出す */
  function shown(hz: number, jitterMs: number, interpolate: boolean): number[] {
    const times = frames(hz, jitterMs, 20);
    let acc = 0;
    let steps = 0;
    let last = times[0];
    const out: number[] = [];
    for (const t of times.slice(1)) {
      const r = tick(acc, (t - last) / 1000);
      acc = r.acc;
      steps += r.steps;
      last = t;
      const dist = steps * DT; // いまのステップの位置
      out.push(interpolate ? dist - DT + DT * alphaOf(acc) : dist);
    }
    return out;
  }
  const spread = (xs: number[]): number => {
    const gaps = xs.slice(1).map((v, i) => v - xs[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return Math.max(...gaps.map((g) => Math.abs(g - mean))) / mean;
  };

  it('補間なしだと、フレームごとの動く量が大きくばらつく(0 のフレームや 2 倍のフレーム)', () => {
    expect(spread(shown(120, 0.4, false))).toBeGreaterThan(0.9);
    expect(spread(shown(60, 0.4, false))).toBeGreaterThan(0.9);
  });

  it('補間ありだと、60Hz でも 120Hz でも、動く量がほぼ一定で、後ろにもどらない', () => {
    for (const hz of [60, 90, 120]) {
      const xs = shown(hz, 0.4, true);
      // ゆらぎ(±0.4ms)のぶんだけの、小さなばらつきに収まる
      expect(spread(xs), `${hz}Hz`).toBeLessThan(0.25);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${hz}Hz ${i}`).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
