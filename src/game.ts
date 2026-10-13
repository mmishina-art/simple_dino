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

export interface StageDef {
  id: number;
  name: string;
  /** 走る速さ(px/秒) */
  speed: number;
  /** ゴールの位置(スタートからの距離) */
  length: number;
  obstacles: Obstacle[];
}

export type Status = 'running' | 'dead' | 'cleared';

export interface GameState {
  stage: StageDef;
  frame: number;
  /** 地面からの高さ */
  y: number;
  vy: number;
  grounded: boolean;
  buffer: number;
  status: Status;
}

export interface Input {
  /** このフレームでボタンを押した(押した瞬間だけ true) */
  pressed: boolean;
  /** ボタンを押し続けている */
  held: boolean;
}

export function newGame(stage: StageDef): GameState {
  return { stage, frame: 0, y: 0, vy: 0, grounded: true, buffer: 0, status: 'running' };
}

/** 恐竜の位置(スタートからの距離)。経過フレームから決まるので、誤差がたまらない */
export function distanceAt(stage: StageDef, frame: number): number {
  return frame * stage.speed * DT;
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

  const dx = distanceAt(s.stage, frame);
  let status: Status = 'running';
  if (hits(s.stage.obstacles, dx, y)) status = 'dead';
  else if (dx >= s.stage.length) status = 'cleared';
  return { stage: s.stage, frame, y, vy, grounded, buffer, status };
}
