// テスト用の「解けるか調べる」仕組み。ジャンプの押し方(いつ押して、何フレーム押し続けるか)を総当たりして、
// 障害物に当たらずゴールできるかを調べる。ゲームと同じ物理(src/game.ts)を使う。
import { JUMP_V, distanceAt, goalFrame, hits, stepBody, type StageDef } from '../src/logic';

const MAX_HOLD = 40;

/** ジャンプを pressed した次のフレームから、着地までの高さ。hold は押し続けるフレーム数 */
export function jumpTrajectory(hold: number): number[] {
  const ys: number[] = [];
  let y = 0;
  let vy = JUMP_V;
  for (let k = 1; ; k++) {
    const b = stepBody(y, vy, k <= hold);
    ys.push(b.y);
    if (b.landed) return ys;
    y = b.y;
    vy = b.vy;
  }
}

const TRAJECTORIES = Array.from({ length: MAX_HOLD }, (_, i) => jumpTrajectory(i + 1));

export interface Move {
  /** ジャンプを押すフレーム(押した次のフレームから跳び始める) */
  frame: number;
  /** 押し続けるフレーム数 */
  hold: number;
}

/** margin だけ判定を厳しくしても、ゴールできる押し方。できなければ null */
export function findPlan(stage: StageDef, margin: number): Move[] | null {
  const total = goalFrame(stage);
  const safe = (f: number, y: number): boolean => !hits(stage.obstacles, distanceAt(stage, f), y, margin);
  const reach = new Uint8Array(total + 1);
  // どこから(from)、何フレーム押して(hold)着地したか。hold が 0 なら、走って進んだだけ
  const from = new Int32Array(total + 1);
  const holdOf = new Uint8Array(total + 1);
  const plan = (last: number, extra?: Move): Move[] => {
    const moves: Move[] = extra ? [extra] : [];
    for (let f = last; f > 0; f = from[f]) if (holdOf[f] > 0) moves.push({ frame: from[f], hold: holdOf[f] });
    return moves.reverse();
  };
  if (safe(0, 0)) reach[0] = 1;
  for (let f = 0; f <= total; f++) {
    if (!reach[f]) continue;
    if (f === total) return plan(f);
    if (!reach[f + 1] && safe(f + 1, 0)) {
      reach[f + 1] = 1;
      from[f + 1] = f;
      holdOf[f + 1] = 0;
    }
    for (let i = 0; i < TRAJECTORIES.length; i++) {
      const ys = TRAJECTORIES[i];
      const end = f + ys.length;
      if (end > total) {
        // 着地する前にゴールを越えるなら、そこまでの安全だけ見る
        let ok = true;
        for (let k = 1; f + k <= total; k++) if (!safe(f + k, ys[k - 1])) { ok = false; break; }
        if (ok) return plan(f, { frame: f, hold: i + 1 });
        continue;
      }
      if (reach[end]) continue;
      let ok = true;
      for (let k = 1; k <= ys.length; k++) if (!safe(f + k, ys[k - 1])) { ok = false; break; }
      if (ok) {
        reach[end] = 1;
        from[end] = f;
        holdOf[end] = i + 1;
      }
    }
  }
  return null;
}

/** margin だけ判定を厳しくしても、ゴールできるか */
export function canClear(stage: StageDef, margin: number): boolean {
  return findPlan(stage, margin) !== null;
}

/** 判定を何 px 厳しくしても解けるか(大きいほど、ゆとりがあって易しい)。0 でも解けなければ -1 */
export function maxMargin(stage: StageDef, limit = 40): number {
  if (!canClear(stage, 0)) return -1;
  let m = 0;
  while (m < limit && canClear(stage, m + 1)) m++;
  return m;
}
