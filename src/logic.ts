// ゲームのルール。DOM に触れない純関数にして、tests/ で単体テストする。
// 時間は 1/60 秒の固定ステップ(画面のリフレッシュレートに左右されない)。距離・高さの単位は論理 px。
// 恐竜は自動で右へ走り続け(距離は経過フレームから決まる)、ジャンプだけが操作。

export const FPS = 60;
export const DT = 1 / FPS;

/** 恐竜の当たり判定(見た目より少し小さくして、理不尽に感じにくくする) */
export const DINO_W = 20;
export const DINO_H = 24;

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

export interface StageDef {
  id: number;
  name: string;
  /** 走る速さ(px/秒) */
  speed: number;
  /** ゴールの位置(スタートからの距離) */
  length: number;
  obstacles: Obstacle[];
  eggs: Egg[];
  /** エンドレスモード(ゴールがなく、障害物をそのつど作り足す) */
  endless?: boolean;
  /** 走った距離に応じた速さ(px/秒)。なければ speed のまま。エンドレスは、だんだん速くなる */
  speedAt?: (dist: number) => number;
  /** 走った距離に応じた背景の番号(THEMES の何番目か)。なければ、ステージの番号で決まる */
  themeAt?: (dist: number) => number;
  /** 距離 upTo までの障害物が足りるように、obstacles の後ろに作り足す(足すだけで、すでにあるものは変えない) */
  extend?: (upTo: number) => void;
}

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
  return { stage, frame: 0, dist: 0, y: 0, vy: 0, grounded: true, buffer: 0, eggs: [], status: 'running' };
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

/**
 * 障害物を越えたとき、すきまがせまかったか調べる(演出用)。minClear は、いま重なっている障害物ごとの「いちばん近づいたときのすきま」で、
 * この関数が書き換える(呼ぶ側が持ち続ける)。ぎりぎりで越えた障害物の番号を返す。
 */
export function trackNearMiss(minClear: Map<number, number>, s: GameState): number[] {
  const dx = s.dist;
  const passed: number[] = [];
  s.stage.obstacles.forEach((o, i) => {
    if (o.x > dx + DINO_W + 4) return;
    if (dx >= o.x + o.w) {
      const gap = minClear.get(i);
      if (gap !== undefined) {
        minClear.delete(i);
        if (gap >= 0 && gap < NEAR_MISS_PX) passed.push(i);
      }
    } else if (dx + DINO_W > o.x) {
      minClear.set(i, Math.min(minClear.get(i) ?? Infinity, s.y - o.h));
    }
  });
  return passed;
}

/** ゴールに着くフレーム数 */
export function goalFrame(stage: StageDef): number {
  return Math.ceil(stage.length / (stage.speed * DT));
}

/** 恐竜(左端 dx・高さ y)が障害物に当たっているか。margin を正にすると判定が厳しくなる(テストで余裕を測るため) */
export function hits(obstacles: readonly Obstacle[], dx: number, y: number, margin = 0): boolean {
  for (const o of obstacles) {
    if (dx + DINO_W > o.x - margin && dx < o.x + o.w + margin && y < o.h + margin) return true;
  }
  return false;
}

/** 恐竜(左端 dx・高さ y)が、たまごを取れる位置か。shrink を正にすると取る範囲がせまくなる(テストで余裕を測るため) */
export function touchesEgg(egg: Egg, dx: number, y: number, shrink = 0): boolean {
  const pad = EGG_PICKUP - shrink;
  return dx + DINO_W > egg.x - pad && dx < egg.x + EGG_W + pad && y + DINO_H > egg.y - pad && y < egg.y + EGG_H + pad;
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

  const dx = s.stage.speedAt ? s.dist + s.stage.speedAt(s.dist) * DT : distanceAt(s.stage, frame);
  s.stage.extend?.(dx + EXTEND_AHEAD);
  let status: Status = 'running';
  if (hits(s.stage.obstacles, dx, y)) status = 'dead';
  else if (dx >= s.stage.length) status = 'cleared';
  let eggs = s.eggs;
  if (status !== 'dead') {
    const got = s.stage.eggs.flatMap((egg, i) => (!eggs.includes(i) && touchesEgg(egg, dx, y) ? [i] : []));
    if (got.length > 0) eggs = [...eggs, ...got];
  }
  return { stage: s.stage, frame, dist: dx, y, vy, grounded, buffer, eggs, status };
}
