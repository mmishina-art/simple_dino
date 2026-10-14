// プレイ中の進行。固定ステップ(1/60 秒)で logic.ts の step を進め、render.ts で描く。
// 画面のリフレッシュレートが違っても(60Hz / 120Hz)、ゲームの速さは変わらない。
// 演出(土ぼこり・キラキラ・画面のゆれ・紙ふぶき)は、見た目だけ。動きを減らす設定のときは出さない。
import {
  BOOST_FRAMES, DT, DINO_H, DINO_W, newGame, progressPercent, scoreMultiplier, step, trackNearMiss, type GameState, type StageDef,
} from './logic';
import {
  advanceParticles, advancePopups, confetti, crash, dust, shakeOffset, sparkle, type Particle, type Popup,
} from './fx';
import { DINO_SCREEN_X, GROUND_Y, VIEW_H, VIEW_W, drawScene } from './render';
import { meters } from './endless';
import { themeOf } from './themes';

export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'cleared';

/** プレイ中の状況(画面の表示に使う) */
export interface RunInfo {
  /** 0〜1 の進み具合(エンドレスは常に 0) */
  ratio: number;
  /** 走った距離(m) */
  meters: number;
  /** スコア(点) */
  score: number;
  /** 肉のレベルと、効き目の残り(0〜1) */
  boost: number;
  boostRatio: number;
  /** スコアの倍率 */
  mult: number;
}

export interface PlayHandlers {
  onJump(): void;
  onLand(): void;
  /** たまごを取った。count はこの回に取った数、total はそのステージの数 */
  onEgg(count: number, total: number): void;
  /** 障害物をぎりぎりで越えた */
  onNearMiss(): void;
  /** やられた(少し間をおいて呼ばれる)。percent は進んだ場所(0〜99 %)、eggs はこの回に取ったたまごの数 */
  onDead(result: { percent: number; eggs: number; meters: number; score: number; meats: number; topBoost: number }): void;
  /** ゴールした(少し間をおいて呼ばれる)。eggs はこの回に取ったたまごの番号 */
  onCleared(result: { eggs: number[] }): void;
  /** 肉を取った。level は取ったあとのレベル */
  onMeat(level: number): void;
  onProgress(info: RunInfo): void;
}

/** やられた・ゴールしたあと、結果を出すまでの間(フレーム数) */
const RESULT_DELAY = 24;
/** 着地のつぶれ表示の長さ(フレーム数) */
const SQUASH_FRAMES = 5;
/** やられたときの、画面のゆれの長さ(フレーム数)と大きさ(論理 px) */
const SHAKE_FRAMES = 16;
const SHAKE_PX = 5;

export class Player {
  private state: GameState;
  phase: Phase = 'ready';
  private held = false;
  private pendingPress = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private landedAt = -99;
  private endedFrames = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shakeLeft = 0;
  private readonly minClear = new Map<number, number>();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: PlayHandlers, stage: StageDef) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas が使えません');
    this.ctx = ctx;
    this.state = newGame(stage);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.pause();
    });
  }

  get stage(): StageDef {
    return this.state.stage;
  }

  /** ステージを読み込んで、スタート前の状態にする */
  load(stage: StageDef): void {
    this.state = newGame(stage);
    this.phase = 'ready';
    this.held = false;
    this.pendingPress = false;
    this.acc = 0;
    this.landedAt = -99;
    this.endedFrames = 0;
    this.particles = [];
    this.popups = [];
    this.shakeLeft = 0;
    this.minClear.clear();
    this.report();
    this.handlers.onEgg(0, stage.eggs.length);
    this.draw();
  }

  begin(): void {
    if (this.phase !== 'ready' && this.phase !== 'paused') return;
    this.phase = 'playing';
    this.last = performance.now();
    this.acc = 0;
    this.loop();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.held = false;
    cancelAnimationFrame(this.raf);
    this.draw();
  }

  /** ステージを離れる(ループを止める) */
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.phase = 'ready';
  }

  press(): void {
    if (this.phase !== 'playing') return;
    this.pendingPress = true;
    this.held = true;
  }

  release(): void {
    this.held = false;
  }

  private resize(): void {
    const css = this.canvas.clientWidth || VIEW_W;
    const width = Math.max(1, Math.round(css * (window.devicePixelRatio || 1)));
    this.canvas.width = width;
    this.canvas.height = Math.round((width * VIEW_H) / VIEW_W);
    this.draw();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame((t) => {
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      if (this.phase === 'playing') this.advance(dt);
      else if (this.phase === 'dead' || this.phase === 'cleared') this.settle();
      this.animate(dt);
      this.draw();
      const resting = (this.phase === 'dead' || this.phase === 'cleared') && this.endedFrames > RESULT_DELAY && this.particles.length === 0;
      if (this.phase === 'playing' || ((this.phase === 'dead' || this.phase === 'cleared') && !resting)) this.loop();
    });
  };

  private advance(dt: number): void {
    this.acc += dt;
    while (this.acc >= DT && this.state.status === 'running') {
      const prev = this.state;
      this.state = step(prev, { pressed: this.pendingPress, held: this.held || this.pendingPress });
      this.pendingPress = false;
      this.acc -= DT;
      this.onStep(prev, this.state);
    }
    this.report();
    if (this.state.status !== 'running') {
      this.phase = this.state.status;
      this.endedFrames = 0;
      this.onEnd();
    }
  }

  /** 1 ステップごとの出来事(音と演出) */
  private onStep(prev: GameState, s: GameState): void {
    const theme = themeOf(s);
    const feet = { x: DINO_SCREEN_X + DINO_W / 2, y: GROUND_Y - 1 };
    if (!s.grounded && (prev.grounded || s.vy > prev.vy)) {
      this.handlers.onJump();
      this.spawn(dust(feet.x - 4, feet.y, 4, theme.groundLine, Math.random));
    }
    if (!prev.grounded && s.grounded) {
      this.landedAt = s.frame;
      this.handlers.onLand();
      this.spawn(dust(feet.x, feet.y, 6, theme.groundLine, Math.random));
    }
    // 走っている間の、小さな土ぼこり
    if (s.grounded && s.frame % 8 === 0) this.spawn(dust(feet.x - 8, feet.y, 1, theme.groundLine, Math.random));
    // 肉
    if (s.meats.length > prev.meats.length) {
      this.spawn(sparkle(DINO_SCREEN_X + DINO_W / 2, GROUND_Y - s.y - DINO_H / 2, 12, '#e8704a', Math.random, 120));
      this.handlers.onMeat(s.boost);
    }
    // たまご
    if (s.eggs.length > prev.eggs.length) {
      this.spawn(sparkle(DINO_SCREEN_X + DINO_W / 2, GROUND_Y - s.y - DINO_H / 2, 10, '#f4b942', Math.random, 110));
      this.handlers.onEgg(s.eggs.length, s.stage.eggs.length);
    }
    // ぎりぎりで越えた
    if (trackNearMiss(this.minClear, s).length > 0) {
      this.spawn(sparkle(DINO_SCREEN_X + DINO_W / 2, GROUND_Y - s.y + 4, 8, '#ffffff', Math.random, 80));
      if (!this.reduced) this.popups.push({ text: 'ぎりぎり!', x: DINO_SCREEN_X + 36, y: GROUND_Y - s.y - 34, life: 0.8, max: 0.8, color: '#ffe27a' });
      this.handlers.onNearMiss();
    }
  }

  /** やられた・ゴールした瞬間の演出 */
  private onEnd(): void {
    const s = this.state;
    const theme = themeOf(s);
    if (s.status === 'dead') {
      this.shakeLeft = SHAKE_FRAMES;
      this.spawn(crash(DINO_SCREEN_X + DINO_W / 2, GROUND_Y - s.y - DINO_H / 2, theme.dino, Math.random));
    } else {
      this.spawn(confetti(70, VIEW_W, Math.random));
    }
  }

  /** やられた・ゴールのあと、少し間をおいて結果を出す */
  private settle(): void {
    this.endedFrames += 1;
    if (this.endedFrames !== RESULT_DELAY) return;
    if (this.phase === 'dead') this.handlers.onDead({
        percent: progressPercent(this.state), eggs: this.state.eggs.length, meters: meters(this.state.dist),
        score: Math.floor(this.state.score), meats: this.state.meats.length, topBoost: this.state.topBoost,
      });
    else this.handlers.onCleared({ eggs: [...this.state.eggs] });
  }

  /** 演出を dt 秒すすめる(ゲームのルールとは別) */
  private animate(dt: number): void {
    this.particles = advanceParticles(this.particles, dt);
    this.popups = advancePopups(this.popups, dt);
    if (this.shakeLeft > 0) this.shakeLeft -= 1;
    // ゴールの紙ふぶきは、結果が出るまで降り続ける
    if (this.phase === 'cleared' && this.endedFrames < RESULT_DELAY + 50) this.spawn(confetti(2, VIEW_W, Math.random));
  }

  /** 画面の表示のために、いまの状況を知らせる */
  private report(): void {
    const s = this.state;
    this.handlers.onProgress({
      ratio: s.stage.endless ? 0 : Math.min(1, s.dist / s.stage.length),
      meters: meters(s.dist),
      score: Math.floor(s.score),
      boost: s.boost,
      boostRatio: s.boost > 0 ? s.boostLeft / BOOST_FRAMES : 0,
      mult: scoreMultiplier(s.boost),
    });
  }

  private spawn(list: Particle[]): void {
    if (!this.reduced) this.particles.push(...list);
  }

  private draw(): void {
    const s = this.state;
    const theme = themeOf(s);
    const shake = this.reduced ? { x: 0, y: 0 } : shakeOffset(this.shakeLeft, SHAKE_FRAMES, SHAKE_PX, s.frame + this.shakeLeft);
    drawScene(this.ctx, this.canvas.width, s, theme, {
      squash: s.frame - this.landedAt < SQUASH_FRAMES,
      particles: this.particles,
      popups: this.popups,
      shake,
      speedLines: this.reduced ? 0 : s.boost,
    });
  }
}
