import { describe, expect, it } from 'vitest';
import {
  BUFFER_FRAMES, DINO_W, FPS, JUMP_V, distanceAt, goalFrame, hits, newGame, step, stepBody, touchesEgg, trackNearMiss, progressPercent, NEAR_MISS_PX, type GameState, type Input, type StageDef,
} from '../src/logic';

const NONE: Input = { pressed: false, held: false };
const PRESS: Input = { pressed: true, held: true };
const HOLD: Input = { pressed: false, held: true };

const flat: StageDef = { id: 0, name: 'test', speed: 240, length: 2000, obstacles: [], eggs: [] };
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

describe('たまご', () => {
  const withEgg = (x: number, y: number): StageDef => ({ ...flat, eggs: [{ x, y }] });

  it('地面のたまごは、走って通りぬけると取れる', () => {
    let s = newGame(withEgg(300, 0));
    while (s.status === 'running') s = step(s, NONE);
    expect(s.eggs).toEqual([0]);
  });

  it('高いたまごは、走っているだけでは取れず、ジャンプでふれると取れる', () => {
    const stage = withEgg(300, 90);
    let s = newGame(stage);
    while (s.status === 'running') s = step(s, NONE);
    expect(s.eggs).toEqual([]);
    s = newGame(stage);
    while (s.status === 'running') {
      const near = distanceAt(stage, s.frame) > 300 - 50;
      s = step(s, near ? { pressed: s.grounded, held: true } : NONE);
    }
    expect(s.eggs).toEqual([0]);
  });

  it('同じたまごを 2 回数えない', () => {
    const stage = withEgg(300, 0);
    let s = newGame(stage);
    let max = 0;
    while (s.status === 'running') {
      s = step(s, NONE);
      max = Math.max(max, s.eggs.length);
    }
    expect(max).toBe(1);
  });

  it('shrink を大きくすると、取る範囲がせまくなる', () => {
    const egg = { x: 100, y: 0 };
    expect(touchesEgg(egg, 100 - DINO_W - 3, 0)).toBe(true);
    expect(touchesEgg(egg, 100 - DINO_W - 3, 0, 2)).toBe(false);
    expect(touchesEgg(egg, 100 - DINO_W - 5, 0)).toBe(false);
  });
});

describe('ぎりぎり判定と進み具合', () => {
  const obstacleStage = withObstacle(400);

  /** ジャンプを frame フレーム目に押して hold フレーム押し続けたとき、生き残ったか・ぎりぎりで越えた数 */
  function tryJump(frame: number, hold: number): { alive: boolean; near: number } {
    let s = newGame(obstacleStage);
    const minClear = new Map<number, number>();
    let near = 0;
    while (s.status === 'running') {
      const pressed = s.frame === frame;
      s = step(s, { pressed, held: s.frame >= frame && s.frame < frame + hold });
      near += trackNearMiss(minClear, s).length;
    }
    return { alive: s.status === 'cleared', near };
  }

  it('すきまがせまいまま越えたときだけ、ぎりぎり。ぶつかったときと、余裕で越えたときは、ぎりぎりではない', () => {
    const results = [];
    for (let frame = 30; frame <= 80; frame++) for (const hold of [1, 3, 6, 10, 25]) results.push(tryJump(frame, hold));
    const survived = results.filter((r) => r.alive);
    expect(survived.some((r) => r.near > 0), 'ぎりぎりで越える跳び方がある').toBe(true);
    expect(survived.some((r) => r.near === 0), '余裕で越える跳び方もある').toBe(true);
    expect(results.filter((r) => !r.alive).every((r) => r.near === 0), 'ぶつかったら、ぎりぎりとは数えない').toBe(true);
    expect(Math.max(...survived.map((r) => r.near))).toBe(1);
  });

  it('障害物の上を通らない(地面を走るだけの)ときは、何も起きない', () => {
    const stage = { ...flat, obstacles: [{ kind: 'S' as const, x: 5000, w: 14, h: 26 }] };
    let s = newGame(stage);
    const minClear = new Map<number, number>();
    let near = 0;
    for (let i = 0; i < 100; i++) {
      s = step(s, NONE);
      near += trackNearMiss(minClear, s).length;
    }
    expect(near).toBe(0);
    expect(minClear.size).toBe(0);
    expect(NEAR_MISS_PX).toBeGreaterThan(0);
  });

  it('進み具合は 0〜99 %(ゴールしたら 100)', () => {
    let s = newGame(flat);
    expect(progressPercent(s)).toBe(0);
    for (let i = 0; i < goalFrame(flat) / 2; i++) s = step(s, NONE);
    expect(progressPercent(s)).toBeGreaterThanOrEqual(49);
    expect(progressPercent(s)).toBeLessThanOrEqual(50);
    while (s.status === 'running') s = step(s, NONE);
    expect(s.status).toBe('cleared');
    expect(progressPercent(s)).toBe(100);
    // やられたときは 99 を超えない
    const dead = { ...s, status: 'dead' as const, frame: goalFrame(flat) };
    expect(progressPercent(dead)).toBeLessThanOrEqual(99);
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
