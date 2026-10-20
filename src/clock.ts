// ゲームの進め方(1/60 秒ずつ)と、画面に描く位置の補間。DOM に触れない純関数にして、tests/ で単体テストする。
// 画面の更新(60Hz・120Hz など)と、ゲームを進める間隔(1/60 秒)は、ぴったり合わない。そのまま描くと、
// 「進まないフレーム」と「2 歩進むフレーム」が混ざって、動きが不揃いに(カクついて)見える。
// そこで、描くときは「ひとつ前の位置」と「いまの位置」のあいだを、時間の割合(alpha)で補って描く。
import { DT } from './logic';

/** 1 フレームで進める時間の上限(秒)。タブを離れたあとなどに、一気に進めすぎない */
export const MAX_FRAME_SEC = 0.1;
/** 1 フレームで進めるステップ数の上限 */
export const MAX_STEPS_PER_FRAME = 6;
/** 浮動小数点の誤差で、ステップを 1 つ取りこぼさないための許容 */
const EPS = 1e-9;

/** 経過時間 dt(秒)を、たまっている時間 acc に足して、進めるステップ数と、残りの時間を返す */
export function tick(acc: number, dt: number): { steps: number; acc: number } {
  let rest = acc + Math.min(Math.max(dt, 0), MAX_FRAME_SEC);
  let steps = 0;
  while (rest >= DT - EPS && steps < MAX_STEPS_PER_FRAME) {
    rest -= DT;
    steps += 1;
  }
  // 上限で止めたときは、たまった分を捨てる(遅れを取り戻そうとして、さらに重くならないように)
  return { steps, acc: steps >= MAX_STEPS_PER_FRAME ? 0 : Math.max(0, rest) };
}

/** 次のステップまでの進み具合(0〜1)。描くときの補間に使う */
export const alphaOf = (acc: number): number => Math.min(1, Math.max(0, acc / DT));

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
