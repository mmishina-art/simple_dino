// フレームの時間の記録(デバッグモードの表示用)。DOM に触れない純関数・クラスにして、tests/ で単体テストする。
// iPhone など実機で、カクつきの原因(画面の更新が遅れているのか、処理が重いのか)を数字で見るためのもの。

export interface PerfSummary {
  /** 1 秒あたりのフレーム数 */
  fps: number;
  /** いちばん長かったフレーム(ミリ秒) */
  worstMs: number;
  /** 「遅れ」: ふつうのフレームの 1.5 倍より長かったフレームの割合(%) */
  jankPct: number;
  /** ゲームの処理と描画にかかった時間の平均(ミリ秒) */
  workMs: number;
  /** 「長い停止」: ふつうのフレームの 3 倍より長かったフレームの割合(%) */
  stallPct: number;
  /** 「遅れ」が起きる間隔の目安(秒)。遅れがなければ null。いつも同じ間隔なら、決まった処理(タイマーなど)が怪しい */
  lateEverySec: number | null;
  /** 1 フレームの処理(ゲームの処理と描画)が、いちばん長かった時間(ミリ秒) */
  workMaxMs: number;
  /** タップがあったフレームの数と、そのうち遅れたフレームの割合(%)。タップがなければ null */
  tapFrames: number;
  lateWithTapPct: number | null;
  /** タップのなかったフレームのうち、遅れたフレームの割合(%)。なければ null */
  lateNoTapPct: number | null;
}

/** 直近 size フレームの、間隔と処理時間を持つ(デバッグモードの表示は、走っているあいだの、直近の 3 秒ぶん) */
export class FrameStats {
  private readonly gaps: number[];
  private readonly works: number[];
  private readonly taps: boolean[];
  private count = 0;

  constructor(private readonly size = 120) {
    this.gaps = new Array<number>(size).fill(0);
    this.works = new Array<number>(size).fill(0);
    this.taps = new Array<boolean>(size).fill(false);
  }

  /** gapMs: 前のフレームからの間隔、workMs: このフレームの処理にかかった時間、tapped: 前のフレームからこのフレームまでに、タップがあったか */
  record(gapMs: number, workMs: number, tapped = false): void {
    const i = this.count % this.size;
    this.gaps[i] = gapMs;
    this.works[i] = workMs;
    this.taps[i] = tapped;
    this.count += 1;
  }

  get recorded(): number {
    return Math.min(this.count, this.size);
  }

  reset(): void {
    this.count = 0;
  }

  summary(): PerfSummary | null {
    const n = this.recorded;
    if (n === 0) return null;
    const gaps = this.gaps.slice(0, n);
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];
    const mean = gaps.reduce((a, b) => a + b, 0) / n;
    const work = this.works.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const isLate = (g: number): boolean => g > median * 1.5;
    const late = gaps.filter(isLate).length;
    const tapped = this.taps.slice(0, n);
    const withTap = gaps.filter((_, i) => tapped[i]);
    const noTap = gaps.filter((_, i) => !tapped[i]);
    const pct = (xs: number[]): number | null => (xs.length === 0 ? null : (xs.filter(isLate).length / xs.length) * 100);
    const total = gaps.reduce((a, b) => a + b, 0);
    return {
      fps: mean > 0 ? 1000 / mean : 0,
      worstMs: sorted[n - 1],
      jankPct: (late / n) * 100,
      workMs: work,
      workMaxMs: Math.max(...this.works.slice(0, n)),
      stallPct: (gaps.filter((g) => g > median * 3).length / n) * 100,
      lateEverySec: late > 0 ? total / late / 1000 : null,
      tapFrames: withTap.length,
      lateWithTapPct: pct(withTap),
      lateNoTapPct: pct(noTap),
    };
  }
}

const pctText = (v: number | null): string => (v === null ? '--' : `${Math.round(v)}%`);

export const formatPerf = (s: PerfSummary): string =>
  `FPS ${Math.round(s.fps)} ｜ 最悪 ${Math.round(s.worstMs)}ms ｜ 遅れ ${Math.round(s.jankPct)}% ｜ 処理 ${s.workMs.toFixed(1)}ms(最大 ${s.workMaxMs.toFixed(1)})\n` +
  `長い停止 ${Math.round(s.stallPct)}% ｜ 遅れの間隔 ${s.lateEverySec === null ? '--' : `${s.lateEverySec.toFixed(1)}秒`}\n` +
  `タップあり ${s.tapFrames}回で遅れ ${pctText(s.lateWithTapPct)} ｜ なしで遅れ ${pctText(s.lateNoTapPct)}`;

/** タップ(入力)ごとの、届くまでの遅れと、受け付けの処理にかかった時間。直近の size 回 */
export class InputStats {
  private readonly latencies: number[] = [];
  private readonly handlers: number[] = [];

  constructor(private readonly size = 30) {}

  /** latencyMs: 画面をさわってから、アプリの処理が始まるまで。handlerMs: 受け付けの処理にかかった時間 */
  record(latencyMs: number, handlerMs: number): void {
    // 時計が合わない値(負の数・極端に大きな数)は、数えない
    if (!(latencyMs >= -5 && latencyMs < 2000)) return;
    this.latencies.push(Math.max(0, latencyMs));
    this.handlers.push(handlerMs);
    if (this.latencies.length > this.size) {
      this.latencies.shift();
      this.handlers.shift();
    }
  }

  reset(): void {
    this.latencies.length = 0;
    this.handlers.length = 0;
  }

  summary(): { count: number; latencyAvgMs: number; latencyMaxMs: number; handlerMaxMs: number } | null {
    const n = this.latencies.length;
    if (n === 0) return null;
    return {
      count: n,
      latencyAvgMs: this.latencies.reduce((a, b) => a + b, 0) / n,
      latencyMaxMs: Math.max(...this.latencies),
      handlerMaxMs: Math.max(...this.handlers),
    };
  }
}

export const formatInput = (s: ReturnType<InputStats['summary']>, method: string): string =>
  s === null
    ? `入力 まだなし ｜ 方式 ${method}`
    : `入力 届くまで 平均 ${s.latencyAvgMs.toFixed(1)}ms 最大 ${s.latencyMaxMs.toFixed(1)}ms ｜ 受付の処理 最大 ${s.handlerMaxMs.toFixed(1)}ms ｜ 方式 ${method}`;
