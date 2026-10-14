// テスト用の「解けるか調べる」仕組み。ジャンプの押し方(いつ押して、何フレーム押し続けるか)を総当たりして、
// 障害物に当たらずゴールできるかを調べる。ゲームと同じ物理(src/game.ts)を使う。
import { DT, JUMP_V, distanceAt, goalFrame, hits, stepBody, touchesEgg, type StageDef } from '../src/logic';

const MAX_HOLD = 40;

/** フレームごとの、走った距離(ゴールに着くフレームまで)。速さが変わるコース(エンドレス)にも対応 */
export function frameDistances(stage: StageDef): Float64Array {
  if (!stage.speedAt) {
    const n = goalFrame(stage);
    return Float64Array.from({ length: n + 1 }, (_, f) => distanceAt(stage, f));
  }
  const list = [0];
  while (list[list.length - 1] < stage.length) list.push(list[list.length - 1] + stage.speedAt(list[list.length - 1]) * DT);
  return Float64Array.from(list);
}

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

/**
 * margin だけ判定を厳しくしても、ゴールできる押し方。できなければ null。
 * eggShrink を渡すと、たまごを全部取る(取る範囲を eggShrink px せまくしても)押し方だけを探す。
 */
export function findPlan(stage: StageDef, margin: number, eggShrink?: number): Move[] | null {
  const dists = frameDistances(stage);
  const total = dists.length - 1;
  const withEggs = eggShrink !== undefined;
  const eggs = withEggs ? stage.eggs : [];
  const shrink = eggShrink ?? 0;
  const safe = (f: number, y: number): boolean => !hits(stage.obstacles, dists[f], y, margin);

  // フレームごとに、恐竜が横にかさなっているたまごの番号(なければ -1)。たまごどうしは離れているので、同時に 1 つだけ
  const eggAt = new Int16Array(total + 1).fill(-1);
  if (withEggs) {
    for (let f = 0; f <= total; f++) {
      const dx = dists[f];
      eggs.forEach((e, i) => {
        if (touchesEgg(e, dx, e.y, shrink)) eggAt[f] = i;
      });
    }
  }
  /** この区間(f から ys の高さで進む)を通ったあとの、「かさなっているたまごを取ったか」。たまごを取りそこねて通りすぎたら -1 */
  const segment = (f: number, flag: number, ys: readonly number[]): number => {
    if (!withEggs) return 0;
    let cur = eggAt[f];
    let got = flag;
    for (let k = 1; k <= ys.length && f + k <= total; k++) {
      const e = eggAt[f + k];
      if (e !== cur) {
        if (cur >= 0 && !got) return -1;
        cur = e;
        got = 0;
      }
      if (e >= 0 && touchesEgg(eggs[e], dists[f + k], ys[k - 1], shrink)) got = 1;
    }
    return cur >= 0 ? got : 0;
  };

  // 状態 = (フレーム, いまかさなっているたまごを取ったか)
  const idx = (f: number, flag: number): number => f * 2 + flag;
  const reach = new Uint8Array((total + 1) * 2);
  const from = new Int32Array((total + 1) * 2);
  const holdOf = new Uint8Array((total + 1) * 2);
  const plan = (last: number, extra?: Move): Move[] => {
    const moves: Move[] = extra ? [extra] : [];
    for (let i = last; i > 0; i = from[i]) if (holdOf[i] > 0) moves.push({ frame: Math.floor(from[i] / 2), hold: holdOf[i] });
    return moves.reverse();
  };
  const mark = (f: number, flag: number, fromIdx: number, hold: number): void => {
    const i = idx(f, flag);
    if (reach[i]) return;
    reach[i] = 1;
    from[i] = fromIdx;
    holdOf[i] = hold;
  };
  if (safe(0, 0)) reach[idx(0, 0)] = 1;
  for (let f = 0; f <= total; f++) {
    for (let flag = 0; flag < 2; flag++) {
      const here = idx(f, flag);
      if (!reach[here]) continue;
      if (f === total) return plan(here);
      if (safe(f + 1, 0)) {
        const next = segment(f, flag, [0]);
        if (next >= 0) mark(f + 1, next, here, 0);
      }
      for (let i = 0; i < TRAJECTORIES.length; i++) {
        const ys = TRAJECTORIES[i];
        const end = f + ys.length;
        // たまごを数えないときは、着地先にすでに着いていれば、調べなおさない(速くするため)
        if (!withEggs && end <= total && reach[idx(end, 0)]) continue;
        let ok = true;
        for (let k = 1; f + k <= total && k <= ys.length; k++) if (!safe(f + k, ys[k - 1])) { ok = false; break; }
        if (!ok) continue;
        const next = segment(f, flag, ys);
        if (next < 0) continue;
        // 着地する前にゴールを越えるなら、そこまでの安全だけ見る
        if (end > total) return plan(here, { frame: f, hold: i + 1 });
        mark(end, next, here, i + 1);
      }
    }
  }
  return null;
}

/** margin だけ判定を厳しくしても、ゴールできるか */
export function canClear(stage: StageDef, margin: number, eggShrink?: number): boolean {
  return findPlan(stage, margin, eggShrink) !== null;
}

/** 判定を何 px 厳しくしても解けるか(大きいほど、ゆとりがあって易しい)。0 でも解けなければ -1 */
export function maxMargin(stage: StageDef, limit = 40, eggShrink?: number): number {
  if (!canClear(stage, 0, eggShrink)) return -1;
  let m = 0;
  while (m < limit && canClear(stage, m + 1, eggShrink)) m++;
  return m;
}
