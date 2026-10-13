// プレイ中の進行。固定ステップ(1/60 秒)で logic.ts の step を進め、render.ts で描く。
// 画面のリフレッシュレートが違っても(60Hz / 120Hz)、ゲームの速さは変わらない。
import { DT, newGame, step, type GameState, type StageDef } from './logic';
import { VIEW_H, VIEW_W, drawScene } from './render';
import { THEMES } from './themes';

export type Phase = 'ready' | 'playing' | 'paused' | 'dead' | 'cleared';

export interface PlayHandlers {
  onJump(): void;
  onLand(): void;
  /** やられた(少し間をおいて呼ばれる) */
  onDead(): void;
  /** ゴールした(少し間をおいて呼ばれる) */
  onCleared(): void;
  /** 0〜1。進み具合 */
  onProgress(ratio: number): void;
}

/** やられた・ゴールしたあと、結果を出すまでの間(フレーム数) */
const RESULT_DELAY = 24;
/** 着地のつぶれ表示の長さ(フレーム数) */
const SQUASH_FRAMES = 5;

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
    this.handlers.onProgress(0);
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
      this.draw();
      if (this.phase === 'playing' || this.phase === 'dead' || this.phase === 'cleared') this.loop();
    });
  };

  private advance(dt: number): void {
    this.acc += dt;
    while (this.acc >= DT && this.state.status === 'running') {
      const prev = this.state;
      this.state = step(prev, { pressed: this.pendingPress, held: this.held || this.pendingPress });
      this.pendingPress = false;
      this.acc -= DT;
      const s = this.state;
      if (!s.grounded && (prev.grounded || s.vy > prev.vy)) this.handlers.onJump();
      if (!prev.grounded && s.grounded) {
        this.landedAt = s.frame;
        this.handlers.onLand();
      }
    }
    this.handlers.onProgress(Math.min(1, (this.state.frame * this.state.stage.speed * DT) / this.state.stage.length));
    if (this.state.status !== 'running') {
      this.phase = this.state.status;
      this.endedFrames = 0;
    }
  }

  /** やられた・ゴールのあと、少し間をおいて結果を出す */
  private settle(): void {
    this.endedFrames += 1;
    if (this.endedFrames !== RESULT_DELAY) return;
    if (this.phase === 'dead') this.handlers.onDead();
    else this.handlers.onCleared();
  }

  private draw(): void {
    const s = this.state;
    const theme = THEMES[(s.stage.id - 1) % THEMES.length];
    drawScene(this.ctx, this.canvas.width, s, theme, { squash: s.frame - this.landedAt < SQUASH_FRAMES });
  }
}
