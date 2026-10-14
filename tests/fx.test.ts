import { describe, expect, it } from 'vitest';
import { advanceParticles, advancePopups, confetti, crash, dust, shakeOffset, sparkle } from '../src/fx';

/** 固定の乱数(テストが毎回同じになるように) */
function seeded(seed = 7): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

describe('演出の粒', () => {
  it('それぞれ、指定した数が出る', () => {
    expect(dust(10, 100, 4, '#888', seeded())).toHaveLength(4);
    expect(sparkle(10, 10, 8, '#ff0', seeded())).toHaveLength(8);
    expect(crash(10, 10, '#000', seeded())).toHaveLength(16);
    expect(confetti(30, 400, seeded())).toHaveLength(30);
  });

  it('土ぼこりは、後ろ(左)上へ向かう', () => {
    for (const p of dust(50, 100, 10, '#888', seeded())) {
      expect(p.vx).toBeLessThan(0);
      expect(p.vy).toBeLessThan(0);
    }
  });

  it('紙ふぶきは、画面の上から出て、下へ降りる', () => {
    for (const p of confetti(20, 400, seeded())) {
      expect(p.y).toBeLessThanOrEqual(0);
      expect(p.vy).toBeGreaterThan(0);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
    }
  });

  it('時間がたつと動き、切れた粒は消える。元の配列は書き換えない', () => {
    const list = sparkle(100, 100, 6, '#ff0', seeded());
    const first = list[0];
    const next = advanceParticles(list, 0.1);
    expect(next).toHaveLength(6);
    expect(next[0].x).not.toBe(first.x);
    expect(list[0]).toBe(first);
    expect(first.life).toBeCloseTo(first.life, 5);
    expect(advanceParticles(list, 5)).toEqual([]);
  });

  it('重力で、だんだん下へ加速する', () => {
    const [p] = crash(0, 0, '#000', seeded());
    const a = advanceParticles([p], 0.05)[0];
    const b = advanceParticles([a], 0.05)[0];
    expect(b.vy).toBeGreaterThan(p.vy);
  });
});

describe('ふきだしの文字とゆれ', () => {
  it('文字は、すこし上へ動いて、時間が切れたら消える', () => {
    const popup = { text: 'ぎりぎり!', x: 80, y: 100, life: 0.8, max: 0.8, color: '#fff' };
    const [moved] = advancePopups([popup], 0.2);
    expect(moved.y).toBeLessThan(100);
    expect(advancePopups([popup], 1)).toEqual([]);
  });

  it('ゆれは、だんだん小さくなり、0 フレームで止まる', () => {
    const big = Math.max(...Array.from({ length: 20 }, (_, t) => Math.abs(shakeOffset(14, 14, 6, t).x)));
    const small = Math.max(...Array.from({ length: 20 }, (_, t) => Math.abs(shakeOffset(2, 14, 6, t).x)));
    expect(big).toBeGreaterThan(small);
    expect(shakeOffset(0, 14, 6, 3)).toEqual({ x: 0, y: 0 });
  });
});
