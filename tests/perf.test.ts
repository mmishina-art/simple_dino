import { describe, expect, it } from 'vitest';
import { FrameStats, formatPerf } from '../src/perf';

describe('フレームの時間の記録', () => {
  it('記録がなければ null', () => {
    expect(new FrameStats().summary()).toBeNull();
  });

  it('FPS・最悪・遅れ・処理時間をまとめる', () => {
    const s = new FrameStats(100);
    for (let i = 0; i < 99; i++) s.record(8.33, 0.4); // 120Hz
    s.record(40, 2); // 1 回だけ、大きく遅れた
    const sum = s.summary();
    expect(sum).not.toBeNull();
    expect(sum?.worstMs).toBe(40);
    expect(sum?.jankPct).toBeCloseTo(1, 5); // 1 / 100
    expect(sum?.fps).toBeGreaterThan(110);
    expect(sum?.fps).toBeLessThan(120);
    expect(sum?.workMs).toBeCloseTo(0.416, 3);
  });

  it('直近の size 個だけを見る(古い記録は押し出される)', () => {
    const s = new FrameStats(10);
    for (let i = 0; i < 10; i++) s.record(100, 1);
    for (let i = 0; i < 10; i++) s.record(10, 1);
    expect(s.summary()?.worstMs).toBe(10);
    expect(s.recorded).toBe(10);
    s.reset();
    expect(s.summary()).toBeNull();
  });

  it('表示用の文字にできる', () => {
    expect(formatPerf({ fps: 119.6, worstMs: 21.4, jankPct: 2.6, workMs: 0.43 })).toBe('FPS 120 ｜ 最悪 21ms ｜ 遅れ 3% ｜ 処理 0.4ms');
  });
});
