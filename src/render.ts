// Canvas への描画。ゲームの状態(GameState)を絵にするだけで、ルールには触れない。
// 座標は論理 px(横 VIEW_W × 縦 VIEW_H)。実際の画面の大きさに合わせて、scale 倍で描く。
// ドット絵がにじまないよう、四角は端末の px にそろえて塗る。
import { DINO_W, distanceAt, type GameState, type ObstacleKind } from './logic';
import { DINO, SPRITES, squashed, type Sprite } from './sprites';
import { THEMES, type Theme } from './themes';

export const VIEW_W = 400;
export const VIEW_H = 260;
export const GROUND_Y = 220;
/** 地面が低くなった分、空の飾りを下げる */
const SKY_SHIFT = 30;
/** 恐竜の当たり判定の左端が、画面のどこにあるか */
export const DINO_SCREEN_X = 72;
/** ドット絵の 1 マスの大きさ */
const CELL = 2;
const SKY_BANDS = 8;

interface Pen {
  c: CanvasRenderingContext2D;
  s: number;
}

function rect(p: Pen, x: number, y: number, w: number, h: number, color: string): void {
  const x0 = Math.round(x * p.s);
  const y0 = Math.round(y * p.s);
  p.c.fillStyle = color;
  p.c.fillRect(x0, y0, Math.round((x + w) * p.s) - x0, Math.round((y + h) * p.s) - y0);
}

function sprite(p: Pen, sp: Sprite, x: number, y: number, main: string, accent = main): void {
  for (let r = 0; r < sp.length; r++) {
    const row = sp[r];
    for (let k = 0; k < row.length; k++) {
      const ch = row[k];
      if (ch === '#') rect(p, x + k * CELL, y + r * CELL, CELL, CELL, main);
      else if (ch === 'o') rect(p, x + k * CELL, y + r * CELL, CELL, CELL, accent);
    }
  }
}

function mix(a: string, b: string, t: number): string {
  const n = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i: number): string => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** 流れていく位置: 距離 d に対して factor 倍の速さで左へ動き、画面の幅 + margin で一周する */
function scroll(base: number, d: number, factor: number, margin = 80): number {
  const period = VIEW_W + margin * 2;
  return ((((base - d * factor) % period) + period) % period) - margin;
}

function drawDecor(p: Pen, theme: Theme, d: number): void {
  const { decor: a, decor2: b } = theme;
  for (const kind of theme.decors) {
    switch (kind) {
      case 'sun':
        rect(p, 316, 24 + SKY_SHIFT, 28, 28, a);
        rect(p, 312, 28 + SKY_SHIFT, 36, 20, a);
        break;
      case 'bigSun':
        rect(p, 150, GROUND_Y - 82, 100, 82, b);
        rect(p, 166, GROUND_Y - 98, 68, 98, a);
        rect(p, 150, GROUND_Y - 70, 100, 70, a);
        break;
      case 'moon':
        // 三日月(「C」の形)
        rect(p, 324, 24 + SKY_SHIFT, 14, 4, a);
        rect(p, 320, 28 + SKY_SHIFT, 10, 18, a);
        rect(p, 324, 46 + SKY_SHIFT, 14, 4, a);
        break;
      case 'cloud':
        for (const [bx, by] of [[40, 30 + SKY_SHIFT], [220, 50 + SKY_SHIFT], [330, 22 + SKY_SHIFT]]) {
          const x = scroll(bx, d, 0.08);
          rect(p, x + 6, by, 24, 8, b);
          rect(p, x, by + 6, 40, 8, b);
        }
        break;
      case 'dunes':
        for (const bx of [20, 200, 340]) {
          const x = scroll(bx, d, 0.15);
          rect(p, x, GROUND_Y - 14, 90, 14, b);
          rect(p, x + 14, GROUND_Y - 24, 52, 10, b);
        }
        break;
      case 'trees':
        for (const bx of [10, 120, 230, 330]) {
          const x = scroll(bx, d, 0.2);
          rect(p, x + 10, GROUND_Y - 60, 24, 14, b);
          rect(p, x + 4, GROUND_Y - 48, 36, 16, b);
          rect(p, x + 16, GROUND_Y - 34, 12, 34, theme.rock);
        }
        break;
      case 'stalactite':
        for (let i = 0; i < 10; i++) {
          const x = scroll(i * 46, d, 0.3);
          const h = 20 + ((i * 37) % 28);
          rect(p, x, 0, 22, h, b);
          rect(p, x + 5, h, 12, 8, b);
          rect(p, x + 8, h + 8, 6, 6, b);
          rect(p, x + 2, 0, 4, h - 6, a);
        }
        break;
      case 'mountains':
        for (const bx of [0, 150, 290]) {
          const x = scroll(bx, d, 0.12);
          rect(p, x + 50, GROUND_Y - 66, 20, 66, b);
          rect(p, x + 30, GROUND_Y - 48, 60, 48, b);
          rect(p, x + 8, GROUND_Y - 26, 104, 26, b);
          rect(p, x + 50, GROUND_Y - 66, 20, 14, a);
        }
        break;
      case 'snow':
        for (let i = 0; i < 16; i++) {
          const x = scroll(i * 29 + ((i * 7) % 11), d, 0.5 + (i % 3) * 0.1);
          rect(p, x, (i * 41 + d * 0.6) % (GROUND_Y - 10), 2, 2, a);
        }
        break;
      case 'volcano':
        {
          const x = scroll(150, d, 0.1, 140);
          rect(p, x + 40, GROUND_Y - 80, 40, 80, b);
          rect(p, x + 24, GROUND_Y - 60, 72, 60, b);
          rect(p, x, GROUND_Y - 30, 120, 30, b);
          rect(p, x + 48, GROUND_Y - 84, 24, 6, a);
          rect(p, x + 54, GROUND_Y - 100, 12, 18, a);
        }
        break;
      case 'stars':
        for (let i = 0; i < 22; i++) {
          const x = scroll(i * 19 + ((i * 13) % 17), d, 0.05 + (i % 3) * 0.02);
          const y = 8 + ((i * 47) % (GROUND_Y - 50));
          rect(p, x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2, a);
        }
        break;
      case 'planet':
        {
          const x = scroll(250, d, 0.06, 100);
          rect(p, x + 8, 28 + SKY_SHIFT, 36, 36, b);
          rect(p, x, 36 + SKY_SHIFT, 52, 20, b);
          rect(p, x - 14, 44 + SKY_SHIFT, 80, 4, a);
        }
        break;
    }
  }
}

function drawGround(p: Pen, theme: Theme, d: number): void {
  rect(p, 0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y, theme.ground);
  rect(p, 0, GROUND_Y, VIEW_W, 2, theme.groundLine);
  for (let i = 0; i < 18; i++) {
    const x = scroll(i * 31 + ((i * 11) % 13), d, 1, 20);
    const y = GROUND_Y + 8 + ((i * 29) % 26);
    rect(p, x, y, i % 3 === 0 ? 6 : 3, 2, theme.groundLine);
  }
}

function drawGoal(p: Pen, theme: Theme, x: number): void {
  const top = GROUND_Y - 78;
  rect(p, x, top, 4, 78, theme.dino);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      rect(p, x + 4 + k * 8, top + r * 8, 8, 8, (r + k) % 2 === 0 ? theme.dino : theme.ground);
    }
  }
}

function obstacleColors(kind: ObstacleKind, theme: Theme): [string, string] {
  return kind === 'S' || kind === 'B' ? [theme.cactus, theme.cactus] : [theme.rock, theme.rockLight];
}

export interface DrawOptions {
  /** 着地してすぐ(つぶれた姿にする) */
  squash: boolean;
}

export function drawScene(c: CanvasRenderingContext2D, width: number, state: GameState, theme: Theme, opts: DrawOptions): void {
  const p: Pen = { c, s: width / VIEW_W };
  const { stage } = state;
  const d = distanceAt(stage, state.frame);

  // 空(横じまの段で、ドット絵らしくする)
  const bandH = GROUND_Y / SKY_BANDS;
  for (let i = 0; i < SKY_BANDS; i++) rect(p, 0, i * bandH, VIEW_W, bandH + 1, mix(theme.skyTop, theme.skyBottom, i / (SKY_BANDS - 1)));
  drawDecor(p, theme, d);
  drawGround(p, theme, d);

  // ゴール
  const gx = DINO_SCREEN_X + (stage.length - d);
  if (gx < VIEW_W + 40) drawGoal(p, theme, gx);

  // 障害物
  for (const o of stage.obstacles) {
    const x = DINO_SCREEN_X + (o.x - d);
    if (x > VIEW_W || x + o.w < -4) continue;
    const [main, accent] = obstacleColors(o.kind, theme);
    sprite(p, SPRITES[o.kind], x, GROUND_Y - o.h, main, accent);
  }

  // 恐竜(当たり判定は絵より少し小さく、絵の中央にある)
  let dino: Sprite = DINO.stand;
  if (state.status === 'dead') dino = DINO.dead;
  else if (state.grounded) dino = Math.floor(state.frame / 5) % 2 === 0 ? DINO.runA : DINO.runB;
  const drawn = opts.squash && state.grounded && state.status === 'running' ? squashed(dino) : dino;
  const x = DINO_SCREEN_X - (dino[0].length * CELL - DINO_W) / 2;
  sprite(p, drawn, x, GROUND_Y - state.y - drawn.length * CELL, theme.dino);
}

// ---- エンディング ----

const CONFETTI = ['#ffd25a', '#ff8fb0', '#7fd18a', '#7ab8ff'];

/** 全ステージクリアのエンディング。夜があけて、恐竜が旗の前でよろこぶ。t は経過秒 */
export function drawEnding(c: CanvasRenderingContext2D, width: number, t: number): void {
  const p: Pen = { c, s: width / VIEW_W };
  const theme = THEMES[0];
  const k = Math.min(1, t / 5);

  // 空: 夜から朝へ
  const bandH = GROUND_Y / SKY_BANDS;
  for (let i = 0; i < SKY_BANDS; i++) {
    const f = i / (SKY_BANDS - 1);
    rect(p, 0, i * bandH, VIEW_W, bandH + 1, mix(mix('#101a3a', theme.skyTop, k), mix('#2a3a6a', '#fff1d0', k), f));
  }
  if (k < 0.8) {
    for (let i = 0; i < 24; i++) rect(p, (i * 53) % VIEW_W, 8 + ((i * 41) % 120), 2, 2, '#ffffff');
  }
  // 朝日
  const sunY = GROUND_Y - 24 - k * 120;
  rect(p, 180, sunY, 40, 40, '#ffe27a');
  rect(p, 174, sunY + 6, 52, 28, '#ffe27a');

  // 地面と、流れていく景色
  const d = t * 90;
  drawGround(p, theme, d);
  for (let i = 0; i < 4; i++) {
    const x = scroll(i * 130 + 30, d, 0.6, 60);
    sprite(p, i % 2 === 0 ? SPRITES.S : SPRITES.R, x, GROUND_Y - (i % 2 === 0 ? 26 : 20), theme.cactus, theme.rockLight);
  }
  drawGoal(p, theme, 300);

  // 恐竜: 走りながら、ときどきはずむ
  const hop = Math.max(0, Math.sin(t * 5)) * 18;
  const run = Math.floor(t * 10) % 2 === 0 ? DINO.runA : DINO.runB;
  sprite(p, hop > 0.5 ? DINO.stand : run, 160, GROUND_Y - hop - 24, theme.dino);

  // 紙ふぶき
  if (t > 3) {
    for (let i = 0; i < 40; i++) {
      const y = (((t - 3) * 40 + i * 29) % (GROUND_Y + 20)) - 10;
      rect(p, (i * 37) % VIEW_W, y, 3, 3, CONFETTI[i % CONFETTI.length]);
    }
  }
}
