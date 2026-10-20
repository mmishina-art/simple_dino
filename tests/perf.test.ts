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

  it('長い停止と、遅れの間隔もまとめる', () => {
    const s = new FrameStats(120);
    // 120 フレーム: 10 フレームごとに 1 回、33ms(1 フレーム飛び)。1 回だけ 100ms(長い停止)
    for (let i = 0; i < 120; i++) s.record(i === 59 ? 100 : i % 10 === 9 ? 33 : 16.7, 0.3);
    const sum = s.summary();
    expect(sum?.jankPct).toBeCloseTo((12 / 120) * 100, 5);
    expect(sum?.stallPct).toBeCloseTo((1 / 120) * 100, 5);
    // 全体の時間 / 遅れの回数: 約 2 秒 / 12 回 = 約 0.18 秒ごと
    expect(sum?.lateEverySec).toBeGreaterThan(0.15);
    expect(sum?.lateEverySec).toBeLessThan(0.25);
    const none = new FrameStats(10);
    for (let i = 0; i < 10; i++) none.record(16.7, 0.2);
    expect(none.summary()?.lateEverySec).toBeNull();
  });

  it('表示用の文字にできる(2 行)', () => {
    expect(formatPerf({ fps: 119.6, worstMs: 21.4, jankPct: 2.6, workMs: 0.43, stallPct: 0.4, lateEverySec: 0.84 })).toBe(
      'FPS 120 ｜ 最悪 21ms ｜ 遅れ 3% ｜ 処理 0.4ms\n長い停止 0% ｜ 遅れの間隔 0.8秒',
    );
    expect(formatPerf({ fps: 60, worstMs: 17, jankPct: 0, workMs: 0.2, stallPct: 0, lateEverySec: null })).toContain('遅れの間隔 --');
  });
});
