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
}

/** 直近 size フレームの、間隔と処理時間を持つ(デバッグモードの表示は、走っているあいだの、直近の 3 秒ぶん) */
export class FrameStats {
  private readonly gaps: number[];
  private readonly works: number[];
  private count = 0;

  constructor(private readonly size = 120) {
    this.gaps = new Array<number>(size).fill(0);
    this.works = new Array<number>(size).fill(0);
  }

  /** gapMs: 前のフレームからの間隔、workMs: このフレームの処理にかかった時間 */
  record(gapMs: number, workMs: number): void {
    const i = this.count % this.size;
    this.gaps[i] = gapMs;
    this.works[i] = workMs;
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
    return {
      fps: mean > 0 ? 1000 / mean : 0,
      worstMs: sorted[n - 1],
      jankPct: (gaps.filter((g) => g > median * 1.5).length / n) * 100,
      workMs: work,
    };
  }
}

export const formatPerf = (s: PerfSummary): string =>
  `FPS ${Math.round(s.fps)} ｜ 最悪 ${Math.round(s.worstMs)}ms ｜ 遅れ ${Math.round(s.jankPct)}% ｜ 処理 ${s.workMs.toFixed(1)}ms`;
