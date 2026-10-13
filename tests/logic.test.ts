import { describe, expect, it } from 'vitest';
import {
  BUFFER_FRAMES, DINO_W, FPS, JUMP_V, distanceAt, goalFrame, hits, newGame, step, stepBody, type GameState, type Input, type StageDef,
} from '../src/logic';

const NONE: Input = { pressed: false, held: false };
const PRESS: Input = { pressed: true, held: true };
const HOLD: Input = { pressed: false, held: true };

const flat: StageDef = { id: 0, name: 'test', speed: 240, length: 2000, obstacles: [] };
const withObstacle = (x: number, h = 26): StageDef => ({ ...flat, obstacles: [{ kind: 'S', x, w: 14, h }] });

function run(s: GameState, inputs: readonly Input[]): GameState {
  return inputs.reduce((state, input) => step(state, input), s);
}

describe('走る', () => {
  it('距離は経過フレームで決まる(速さ × 時間)', () => {
    const s = run(newGame(flat), Array(FPS).fill(NONE));
    expect(distanceAt(flat, s.frame)).toBeCloseTo(240, 5);
  });

  it('障害物がなければ、ゴールの位置でクリアになる', () => {
    let s = newGame(flat);
    while (s.status === 'running') s = step(s, NONE);
    expect(s.status).toBe('cleared');
    expect(s.frame).toBe(goalFrame(flat));
  });

  it('クリアや失敗のあとは、状態が変わらない', () => {
    let s = newGame(flat);
    while (s.status === 'running') s = step(s, NONE);
    expect(step(s, PRESS)).toBe(s);
  });

  it('元の状態を書き換えない', () => {
    const s = newGame(flat);
    step(s, PRESS);
    expect(s.frame).toBe(0);
    expect(s.grounded).toBe(true);
  });
});

describe('ジャンプ', () => {
  it('押すと地面から跳び上がり、そのうち着地する', () => {
    let s = step(newGame(flat), PRESS);
    expect(s.grounded).toBe(false);
    expect(s.y).toBeGreaterThan(0);
    for (let i = 0; i < 120 && !s.grounded; i++) s = step(s, NONE);
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(0);
  });

  it('空中で押しても、二段ジャンプはしない', () => {
    const s = run(newGame(flat), [PRESS, NONE, NONE, { pressed: true, held: true }]);
    expect(s.vy).toBeLessThan(JUMP_V);
  });

  it('押し続けると高く跳び、すぐ離すと低く跳ぶ', () => {
    const peak = (inputs: (i: number) => Input): number => {
      let s = newGame(flat);
      let max = 0;
      for (let i = 0; i < 90; i++) {
        s = step(s, inputs(i));
        max = Math.max(max, s.y);
      }
      return max;
    };
    const high = peak((i) => (i === 0 ? PRESS : HOLD));
    const low = peak((i) => (i === 0 ? { pressed: true, held: false } : NONE));
    expect(high).toBeGreaterThan(100);
    expect(low).toBeLessThan(high * 0.7);
    expect(low).toBeGreaterThan(40);
  });

  it('着地の直前に押したジャンプは、着地してすぐ出る', () => {
    let s = step(newGame(flat), { pressed: true, held: false });
    while (s.y > 5 || s.vy > 0) s = step(s, NONE);
    s = step(s, { pressed: true, held: false });
    for (let i = 0; i < BUFFER_FRAMES && s.grounded; i++) s = step(s, NONE);
    expect(s.grounded).toBe(false);
  });

  it('ずっと前に押したジャンプは、持ち越さない', () => {
    let s = step(newGame(flat), PRESS);
    s = step(s, PRESS);
    for (let i = 0; i < 60; i++) s = step(s, NONE);
    expect(s.grounded).toBe(true);
    expect(s.vy).toBe(0);
  });

  it('stepBody は押し続けている間、上昇の重力が弱い', () => {
    expect(stepBody(10, 300, true).vy).toBeGreaterThan(stepBody(10, 300, false).vy);
    // 下りでは、押していても同じ
    expect(stepBody(50, -100, true).vy).toBe(stepBody(50, -100, false).vy);
  });
});

describe('当たり判定', () => {
  it('地面を走って、障害物にぶつかるとゲームオーバー', () => {
    let s = newGame(withObstacle(300));
    while (s.status === 'running') s = step(s, NONE);
    expect(s.status).toBe('dead');
    // 恐竜の右端が障害物の左端に着いたあたり
    expect(distanceAt(s.stage, s.frame) + DINO_W).toBeGreaterThan(300);
    expect(distanceAt(s.stage, s.frame - 1) + DINO_W).toBeLessThanOrEqual(300 + 4);
  });

  it('ちょうどよく跳べば、越えられる', () => {
    // 障害物の手前でジャンプを押し続ける
    const stage = withObstacle(300);
    let s = newGame(stage);
    while (s.status === 'running') {
      const near = distanceAt(stage, s.frame) > 300 - 70;
      s = step(s, near ? { pressed: s.grounded, held: true } : NONE);
    }
    expect(s.status).toBe('cleared');
  });

  it('障害物より低い高さだと当たり、高ければ当たらない', () => {
    const o = [{ kind: 'S' as const, x: 100, w: 14, h: 26 }];
    expect(hits(o, 100, 10)).toBe(true);
    expect(hits(o, 100, 27)).toBe(false);
  });

  it('横に離れていれば当たらない', () => {
    const o = [{ kind: 'S' as const, x: 100, w: 14, h: 26 }];
    expect(hits(o, 100 - DINO_W - 1, 0)).toBe(false);
    expect(hits(o, 100 + 14 + 1, 0)).toBe(false);
  });

  it('margin を大きくすると、判定が厳しくなる', () => {
    const o = [{ kind: 'S' as const, x: 100, w: 14, h: 26 }];
    expect(hits(o, 100 - DINO_W - 2, 0, 0)).toBe(false);
    expect(hits(o, 100 - DINO_W - 2, 0, 3)).toBe(true);
  });
});
