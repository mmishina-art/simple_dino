// 演出の粒(土ぼこり、キラキラ、紙ふぶき)と、ふきだしの文字。見た目だけで、ゲームのルールには関係しない。
// 位置は論理 px(render.ts の VIEW_W × VIEW_H)。乱数は rand を渡す(テストでは固定の乱数を渡せる)。

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 残りの時間(秒) */
  life: number;
  /** 最初の時間(秒)。薄くなる具合の計算に使う */
  max: number;
  size: number;
  color: string;
  /** 下向きの加速(px/秒²)。マイナスなら上へ */
  gravity: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
}

type Rand = () => number;

const range = (rand: Rand, a: number, b: number): number => a + rand() * (b - a);

/** 土ぼこり: 足もとから、後ろ上へふわっと */
export function dust(x: number, y: number, count: number, color: string, rand: Rand): Particle[] {
  return Array.from({ length: count }, () => ({
    x: x + range(rand, -3, 3), y, vx: range(rand, -50, -10), vy: range(rand, -35, -8),
    life: range(rand, 0.25, 0.45), max: 0.45, size: rand() < 0.5 ? 2 : 3, color, gravity: 20,
  }));
}

/** キラキラ: まわりに広がる */
export function sparkle(x: number, y: number, count: number, color: string, rand: Rand, speed = 90): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + range(rand, -0.3, 0.3);
    const v = range(rand, speed * 0.5, speed);
    return { x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: range(rand, 0.3, 0.55), max: 0.55, size: 2, color, gravity: 60 };
  });
}

/** やられたとき: 体の色の粒が、はじけて落ちる */
export function crash(x: number, y: number, color: string, rand: Rand): Particle[] {
  return Array.from({ length: 16 }, () => ({
    x: x + range(rand, -8, 8), y: y + range(rand, -8, 8), vx: range(rand, -110, 110), vy: range(rand, -160, -30),
    life: range(rand, 0.5, 0.9), max: 0.9, size: rand() < 0.5 ? 2 : 3, color, gravity: 520,
  }));
}

const CONFETTI = ['#ffd25a', '#ff8fb0', '#7fd18a', '#7ab8ff', '#ffffff'];

/** 紙ふぶき: 画面の上から降ってくる */
export function confetti(count: number, width: number, rand: Rand): Particle[] {
  return Array.from({ length: count }, () => ({
    x: range(rand, 0, width), y: range(rand, -20, 0), vx: range(rand, -25, 25), vy: range(rand, 40, 110),
    life: range(rand, 1.2, 2.2), max: 2.2, size: rand() < 0.5 ? 2 : 3, color: CONFETTI[Math.floor(rand() * CONFETTI.length)], gravity: 30,
  }));
}

/** dt 秒すすめる。時間が切れた粒は消す */
export function advanceParticles(list: readonly Particle[], dt: number): Particle[] {
  const out: Particle[] = [];
  for (const p of list) {
    const life = p.life - dt;
    if (life <= 0) continue;
    const vy = p.vy + p.gravity * dt;
    out.push({ ...p, life, vy, x: p.x + p.vx * dt, y: p.y + vy * dt });
  }
  return out;
}

/** ふきだしの文字を、すこし上へ動かしながら、dt 秒すすめる */
export function advancePopups(list: readonly Popup[], dt: number): Popup[] {
  return list.flatMap((p) => (p.life - dt > 0 ? [{ ...p, life: p.life - dt, y: p.y - 24 * dt }] : []));
}

/** 画面のゆれ(論理 px)。frames が残りのフレーム数で、だんだん小さくなる */
export function shakeOffset(frames: number, total: number, amplitude: number, tick: number): { x: number; y: number } {
  if (frames <= 0 || total <= 0) return { x: 0, y: 0 };
  const power = amplitude * (frames / total);
  return { x: Math.round(Math.sin(tick * 2.7) * power), y: Math.round(Math.cos(tick * 3.9) * power * 0.6) };
}
