import { describe, expect, it } from 'vitest';
import { FrameStats, InputStats, formatInput, formatPerf } from '../src/perf';

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
    const base = { fps: 119.6, worstMs: 21.4, jankPct: 2.6, workMs: 0.43, stallPct: 0.4, lateEverySec: 0.84, tapFrames: 5, lateWithTapPct: 40, lateNoTapPct: 1.2, workMaxMs: 3.26 };
    expect(formatPerf(base)).toBe('FPS 120 ｜ 最悪 21ms ｜ 遅れ 3% ｜ 処理 0.4ms(最大 3.3)\n長い停止 0% ｜ 遅れの間隔 0.8秒\nタップあり 5回で遅れ 40% ｜ なしで遅れ 1%');
    const none = formatPerf({ ...base, lateEverySec: null, tapFrames: 0, lateWithTapPct: null });
    expect(none).toContain('遅れの間隔 --');
    expect(none).toContain('タップあり 0回で遅れ --');
  });

  it('タップのあったフレームと、なかったフレームで、遅れの割合を分ける', () => {
    const s = new FrameStats(100);
    // タップなし 80 フレームは、すべて 16.7ms。タップあり 20 フレームのうち、10 フレームが 33ms(遅れ)
    for (let i = 0; i < 80; i++) s.record(16.7, 0.2, false);
    for (let i = 0; i < 20; i++) s.record(i % 2 === 0 ? 33 : 16.7, 0.2, true);
    const sum = s.summary();
    expect(sum?.tapFrames).toBe(20);
    expect(sum?.lateWithTapPct).toBeCloseTo(50, 5);
    expect(sum?.lateNoTapPct).toBeCloseTo(0, 5);
    // タップが 1 回もなければ、タップありの割合はなし
    const idle = new FrameStats(10);
    for (let i = 0; i < 10; i++) idle.record(16.7, 0.2);
    expect(idle.summary()?.lateWithTapPct).toBeNull();
    expect(idle.summary()?.lateNoTapPct).toBe(0);
  });

  it('処理の最大も、まとめる', () => {
    const s = new FrameStats(10);
    s.record(16.7, 0.2);
    s.record(16.7, 4.5);
    expect(s.summary()?.workMaxMs).toBe(4.5);
  });
});

describe('入力(タップ)の記録', () => {
  it('届くまでの遅れの平均と最大、受付の処理の最大をまとめる', () => {
    const s = new InputStats(30);
    expect(s.summary()).toBeNull();
    s.record(2, 0.1);
    s.record(6, 0.4);
    const sum = s.summary();
    expect(sum).toEqual({ count: 2, latencyAvgMs: 4, latencyMaxMs: 6, handlerMaxMs: 0.4 });
    expect(formatInput(sum, 'pointerdown')).toBe('入力 届くまで 平均 4.0ms 最大 6.0ms ｜ 受付の処理 最大 0.4ms ｜ 方式 pointerdown');
    expect(formatInput(null, 'touchstart')).toBe('入力 まだなし ｜ 方式 touchstart');
  });

  it('時計が合わない値は数えず、直近の size 回だけ持つ', () => {
    const s = new InputStats(3);
    s.record(-500, 0.1); // 負の数: 数えない
    s.record(99999, 0.1); // 極端に大きな数: 数えない
    expect(s.summary()).toBeNull();
    for (const v of [1, 2, 3, 4]) s.record(v, 0.1);
    expect(s.summary()?.count).toBe(3);
    expect(s.summary()?.latencyMaxMs).toBe(4);
    s.reset();
    expect(s.summary()).toBeNull();
  });
});
