// ゲームのルール。DOM に触れない純関数にして、tests/ で単体テストする。
// 時間は 1/60 秒の固定ステップ(画面のリフレッシュレートに左右されない)。距離・高さの単位は論理 px。
// 恐竜は自動で右へ走り続け(距離は経過フレームから決まる)、ジャンプだけが操作。

import { SPRITES } from './sprites';

export const FPS = 60;
export const DT = 1 / FPS;

/** 恐竜の当たり判定(見た目より少し小さくして、理不尽に感じにくくする) */
export const DINO_W = 20;
export const DINO_H = 24;

/** 恐竜の当たり判定の大きさ(キャラによって変わる) */
export interface Body {
  w: number;
  h: number;
}
export const DINO_BODY: Body = { w: DINO_W, h: DINO_H };

/**
 * エンドレスでは、肉のレベル(0〜BOOST_MAX)で、恐竜の姿と体の大きさがいっしょに変わる:
 * 0 元のちびダイノ → 1 ちびダイノ → 2 ダイノ → 3 進化したダイノ。大きいほど、当たり判定も大きい(よけにくい)。
 */
export const BOOST_BODIES: readonly Body[] = [
  { w: 12, h: 13 },
  { w: 14, h: 16 },
  DINO_BODY,
  { w: 24, h: 28 },
];

/** ジャンプの初速。上昇中にボタンを押し続けると重力が弱まり、高く跳べる(離すと低く短いジャンプ) */
export const JUMP_V = 560;
export const GRAVITY_HOLD = 1400;
export const GRAVITY = 2600;
/** 着地の少し前に押したジャンプを、着地した瞬間に出す猶予(フレーム数) */
export const BUFFER_FRAMES = 6;

export type ObstacleKind = 'S' | 'B' | 'R' | 'T';

/** S: 小さいサボテン / B: 大きいサボテン / R: 岩 / T: 高い岩(しっかり押して高く跳ぶ) */
export const OBSTACLE_SIZES: Record<ObstacleKind, { w: number; h: number }> = {
  S: { w: 14, h: 26 },
  B: { w: 18, h: 44 },
  R: { w: 26, h: 20 },
  T: { w: 28, h: 64 },
};

/**
 * 障害物の当たり判定は、絵の輪郭(シルエット)に合わせる。絵の 1 マス(2px)ごとの列について「地面からその列のてっぺんまでの高さ」を持つ。
 * 角のとがった四角ではなく、丸い岩の肩やサボテンの腕の上は、実際に絵がある高さまでしか当たらない。
 */
const CELL_PX = 2;
const PROFILES: Record<ObstacleKind, readonly number[]> = (() => {
  const result = {} as Record<ObstacleKind, readonly number[]>;
  for (const kind of Object.keys(SPRITES) as ObstacleKind[]) {
    const rows = SPRITES[kind];
    result[kind] = Array.from({ length: rows[0].length }, (_, col) => {
      const top = rows.findIndex((row) => row[col] !== '.');
      return top < 0 ? 0 : (rows.length - top) * CELL_PX;
    });
  }
  return result;
})();

export interface Obstacle {
  kind: ObstacleKind;
  /** 左端の位置(スタートからの距離) */
  x: number;
  w: number;
  h: number;
}

/** たまご: ステージの途中に浮かんでいて、取ると★の評価に数えられる(取れなくてもクリアはできる) */
export const EGG_W = 14;
export const EGG_H = 16;
/** 取る判定は、見た目より少し広くして、取りやすくする */
export const EGG_PICKUP = 4;

export interface Egg {
  /** 左端の位置(スタートからの距離) */
  x: number;
  /** たまごの底の、地面からの高さ */
  y: number;
}

/**
 * 肉(エンドレスだけ): 取るとレベルが 1 上がる(最大 BOOST_MAX)。レベルが高いほど速くなり、スコアの倍率が上がる。
 * レベルは BOOST_FRAMES ごとに 1 つ下がる(肉を取ると、その時間がもどる)。
 */
export const MEAT_W = 18;
export const MEAT_H = 16;
export const MEAT_PICKUP = 4;
export const BOOST_MAX = 3;
/** 1 レベルあたりの、速さの上がり幅(0.08 = +8%)と、スコア倍率の上がり幅 */
export const BOOST_STEP = 0.08;
export const MULT_STEP = 0.5;
/** レベルが 1 つ下がるまでのフレーム数(約 8 秒) */
export const BOOST_FRAMES = 480;
/** 速さの倍率が、目標に向かって 1 フレームに変わる量(+8% に約 0.5 秒かけて近づく) */
export const BOOST_RAMP = 0.16 * DT;

export interface Meat {
  /** 左端の位置(スタートからの距離) */
  x: number;
  /** 肉の底の、地面からの高さ */
  y: number;
}

/** レベルに対する、速さの目標の倍率と、スコアの倍率 */
export const boostTarget = (level: number): number => 1 + BOOST_STEP * level;
export const scoreMultiplier = (level: number): number => 1 + MULT_STEP * level;

/** 速さの倍率 factor を、レベルの目標に向かって、ゆるやかに近づける(急に速くしない) */
export function approachFactor(factor: number, level: number): number {
  const target = boostTarget(level);
  if (Math.abs(target - factor) <= BOOST_RAMP) return target;
  return factor + Math.sign(target - factor) * BOOST_RAMP;
}

export interface StageDef {
  id: number;
  name: string;
  /** 走る速さ(px/秒) */
  speed: number;
  /** ゴールの位置(スタートからの距離) */
  length: number;
  obstacles: Obstacle[];
  eggs: Egg[];
  /** 肉(エンドレスだけ)。位置の順。extend で作り足される */
  meats?: Meat[];
  /** エンドレスモード(ゴールがなく、障害物をそのつど作り足す) */
  endless?: boolean;
  /** 恐竜の当たり判定の大きさ。なければ DINO_BODY(キャラによって変える: src/characters.ts) */
  body?: Body;
  /** 走った距離に応じた速さ(px/秒)。なければ speed のまま。エンドレスは、だんだん速くなる */
  speedAt?: (dist: number) => number;
  /** 走った距離に応じた背景の番号(THEMES の何番目か)。なければ、ステージの番号で決まる */
  themeAt?: (dist: number) => number;
  /** 距離 upTo までの障害物が足りるように、obstacles の後ろに作り足す(足すだけで、すでにあるものは変えない) */
  extend?: (upTo: number) => void;
}

/** そのステージの、恐竜の当たり判定の大きさ */
export const bodyOf = (stage: StageDef): Body => stage.body ?? DINO_BODY;

/** そのときの、恐竜の当たり判定の大きさ(エンドレスは、肉のレベルで変わる) */
export const bodyOfState = (s: Pick<GameState, 'stage' | 'boost'>): Body => (s.stage.endless ? BOOST_BODIES[s.boost] : bodyOf(s.stage));

/**
 * 体の左端が、走った距離(dist)から、どれだけずれているか。エンドレスは、体の中心をいつも同じ所に置く
 * (大きくなっても、前にはみ出して、急に障害物にぶつからないように)。ほかのステージは、ずれない。
 */
export const bodyOffset = (stage: StageDef, body: Body): number => (stage.endless ? (DINO_W - body.w) / 2 : 0);

/** 恐竜の前に、これだけ先(px)まで、障害物を用意しておく */
export const EXTEND_AHEAD = 1400;

export type Status = 'running' | 'dead' | 'cleared';

export interface GameState {
  stage: StageDef;
  frame: number;
  /** 走った距離(スタートからの px)。速さが一定のステージでは、frame から決まる値と同じ */
  dist: number;
  /** 地面からの高さ */
  y: number;
  vy: number;
  grounded: boolean;
  buffer: number;
  /** 取ったたまごの番号(stage.eggs の何番目か)。取った順 */
  eggs: number[];
  /** 肉のレベル(0〜BOOST_MAX)と、次にレベルが下がるまでのフレーム数 */
  boost: number;
  boostLeft: number;
  /** いまの速さの倍率(レベルに向かって、ゆるやかに変わる) */
  factor: number;
  /** スコア(走った距離 m × そのときの倍率)。小数のまま持ち、表示のときに切りすてる */
  score: number;
  /** 取った肉の番号(stage.meats の何番目か)と、いちばん高かったレベル */
  meats: number[];
  topBoost: number;
  status: Status;
}

export interface Input {
  /** このフレームでボタンを押した(押した瞬間だけ true) */
  pressed: boolean;
  /** ボタンを押し続けている */
  held: boolean;
}

export function newGame(stage: StageDef): GameState {
  stage.extend?.(EXTEND_AHEAD);
  return { stage, frame: 0, dist: 0, y: 0, vy: 0, grounded: true, buffer: 0, eggs: [], boost: 0, boostLeft: 0, factor: 1, score: 0, meats: [], topBoost: 0, status: 'running' };
}

/** 恐竜の位置(スタートからの距離)。経過フレームから決まるので、誤差がたまらない */
export function distanceAt(stage: StageDef, frame: number): number {
  return frame * stage.speed * DT;
}

/** 進み具合(0〜100 の整数)。ゴールしたら 100、それまでは最大 99 */
export function progressPercent(s: GameState): number {
  if (s.status === 'cleared') return 100;
  return Math.min(99, Math.floor((s.dist / s.stage.length) * 100));
}

/** 「ぎりぎり」と呼ぶ、障害物の上のすきま(px)。これより小さいすきまで越えたら、ぎりぎり */
export const NEAR_MISS_PX = 10;

const MAX_OBSTACLE_W = Math.max(...Object.values(OBSTACLE_SIZES).map((o) => o.w));

/**
 * 横の位置が lo〜hi に重なりうる障害物の、番号の範囲 [start, end)。障害物は、左から順に並んでいるので、二分探索で求める。
 * エンドレスは、走るほど障害物が増えつづけるので、毎フレーム全部を見ないようにするため。
 */
export function obstacleRange(obstacles: readonly Obstacle[], lo: number, hi: number): [number, number] {
  const firstAfter = (x: number): number => {
    let a = 0;
    let b = obstacles.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (obstacles[mid].x <= x) a = mid + 1;
      else b = mid;
    }
    return a;
  };
  return [firstAfter(lo - MAX_OBSTACLE_W - 1), firstAfter(hi)];
}

/**
 * 障害物を越えたとき、すきまがせまかったか調べる(演出用)。minClear は、いま重なっている障害物ごとの「いちばん近づいたときのすきま」で、
 * この関数が書き換える(呼ぶ側が持ち続ける)。ぎりぎりで越えた障害物の番号を返す。
 */
export function trackNearMiss(minClear: Map<number, number>, s: GameState): number[] {
  const body = bodyOfState(s);
  const dx = s.dist + bodyOffset(s.stage, body);
  const w = body.w;
  const passed: number[] = [];
  // 越えたばかり(1 フレームで進む距離より、じゅうぶん広く)から、すぐ先までの障害物だけを見る
  const [start, end] = obstacleRange(s.stage.obstacles, dx - 40, dx + w + 4);
  for (let i = start; i < end; i++) {
    const o = s.stage.obstacles[i];
    if (dx >= o.x + o.w) {
      const gap = minClear.get(i);
      if (gap !== undefined) {
        minClear.delete(i);
        if (gap >= 0 && gap < NEAR_MISS_PX) passed.push(i);
      }
    } else if (dx + w > o.x) {
      minClear.set(i, Math.min(minClear.get(i) ?? Infinity, s.y - o.h));
    }
  }
  return passed;
}

/** ゴールに着くフレーム数 */
export function goalFrame(stage: StageDef): number {
  return Math.ceil(stage.length / (stage.speed * DT));
}

/** 恐竜(左端 dx・高さ y)が障害物に当たっているか。margin を正にすると判定が厳しくなる(テストで余裕を測るため) */
export function hits(obstacles: readonly Obstacle[], dx: number, y: number, margin = 0, width = DINO_W): boolean {
  const left = dx;
  const right = dx + width;
  const [start, end] = obstacleRange(obstacles, left - margin, right + margin);
  for (let n = start; n < end; n++) {
    const o = obstacles[n];
    // まず、四角(外側)で大まかに判定する
    if (!(right > o.x - margin && left < o.x + o.w + margin && y < o.h + margin)) continue;
    const profile = PROFILES[o.kind];
    if (profile.length * CELL_PX !== o.w) return true;
    // 絵の列ごとに、その列のてっぺんより低ければ当たり
    for (let k = 0; k < profile.length; k++) {
      const h = profile[k];
      if (h === 0 || y >= h + margin) continue;
      const x0 = o.x + k * CELL_PX;
      if (right > x0 - margin && left < x0 + CELL_PX + margin) return true;
    }
  }
  return false;
}

/** 恐竜(左端 dx・高さ y)が、たまごを取れる位置か。shrink を正にすると取る範囲がせまくなる(テストで余裕を測るため) */
export function touchesEgg(egg: Egg, dx: number, y: number, shrink = 0, body: Body = DINO_BODY): boolean {
  const pad = EGG_PICKUP - shrink;
  return dx + body.w > egg.x - pad && dx < egg.x + EGG_W + pad && y + body.h > egg.y - pad && y < egg.y + EGG_H + pad;
}

/** 恐竜(左端 dx・高さ y)が、肉を取れる位置か(たまごと同じ考え方) */
export function touchesMeat(meat: Meat, dx: number, y: number, shrink = 0, body: Body = DINO_BODY): boolean {
  const pad = MEAT_PICKUP - shrink;
  return dx + body.w > meat.x - pad && dx < meat.x + MEAT_W + pad && y + body.h > meat.y - pad && y < meat.y + MEAT_H + pad;
}

/** 空中の動き 1 ステップ(縦方向だけ) */
export function stepBody(y: number, vy: number, held: boolean): { y: number; vy: number; landed: boolean } {
  const g = held && vy > 0 ? GRAVITY_HOLD : GRAVITY;
  const nvy = vy - g * DT;
  const ny = y + nvy * DT;
  if (ny <= 0) return { y: 0, vy: 0, landed: true };
  return { y: ny, vy: nvy, landed: false };
}

/** 1 フレーム進める。元の状態は書き換えない */
export function step(s: GameState, input: Input): GameState {
  if (s.status !== 'running') return s;
  let { y, vy, grounded, buffer } = s;
  const frame = s.frame + 1;

  if (input.pressed) {
    if (grounded) {
      vy = JUMP_V;
      grounded = false;
    } else {
      buffer = BUFFER_FRAMES;
    }
  } else if (buffer > 0) {
    buffer -= 1;
  }

  if (!grounded) {
    const b = stepBody(y, vy, input.held);
    y = b.y;
    vy = b.vy;
    if (b.landed) {
      grounded = true;
      if (buffer > 0) {
        // 着地の少し前に押していたジャンプを、すぐ出す
        buffer = 0;
        vy = JUMP_V;
        grounded = false;
      }
    }
  }

  // 速さ: エンドレスは、距離に応じた速さに、肉のレベルの倍率をかける
  const factor = s.stage.speedAt ? approachFactor(s.factor, s.boost) : 1;
  const dx = s.stage.speedAt ? s.dist + s.stage.speedAt(s.dist) * factor * DT : distanceAt(s.stage, frame);
  s.stage.extend?.(dx + EXTEND_AHEAD);
  let status: Status = 'running';
  // 当たり判定は、このステップのはじめの、肉のレベルの体で見る(体の左端は、レベルごとにずれる)
  const body = bodyOfState(s);
  const left = dx + bodyOffset(s.stage, body);
  if (hits(s.stage.obstacles, left, y, 0, body.w)) status = 'dead';
  else if (dx >= s.stage.length) status = 'cleared';
  let eggs = s.eggs;
  if (status !== 'dead') {
    const got = s.stage.eggs.flatMap((egg, i) => (!eggs.includes(i) && touchesEgg(egg, left, y, 0, body) ? [i] : []));
    if (got.length > 0) eggs = [...eggs, ...got];
  }

  // 肉: 取るとレベルが上がる。取らないと、時間でレベルが下がる
  let { boost, boostLeft, meats, topBoost } = s;
  const score = s.score + ((dx - s.dist) / 10) * scoreMultiplier(boost);
  if (boost > 0 && --boostLeft <= 0) {
    boost -= 1;
    boostLeft = boost > 0 ? BOOST_FRAMES : 0;
  }
  const allMeats = s.stage.meats;
  if (allMeats && status !== 'dead') {
    for (let i = 0; i < allMeats.length; i++) {
      const m = allMeats[i];
      if (m.x > left + body.w + MEAT_PICKUP) break;
      if (m.x + MEAT_W < left - MEAT_PICKUP || !touchesMeat(m, left, y, 0, body) || meats.includes(i)) continue;
      meats = [...meats, i];
      boost = Math.min(BOOST_MAX, boost + 1);
      boostLeft = BOOST_FRAMES;
      topBoost = Math.max(topBoost, boost);
    }
  }
  return { stage: s.stage, frame, dist: dx, y, vy, grounded, buffer, eggs, boost, boostLeft, factor, score, meats, topBoost, status };
}
