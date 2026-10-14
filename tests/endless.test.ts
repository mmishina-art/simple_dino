import { describe, expect, it } from 'vitest';
import { CHUNKS, MAX_SPEED, START_SPEED, THEME_SPAN, createEndless, endlessObstacles, endlessSpeed, endlessTheme, meters, tierAt, tierStartSpeed } from '../src/endless';
import { DT, newGame, progressPercent, step, type StageDef } from '../src/logic';
import { parseLayout } from '../src/stages';
import { findPlan } from './solver';


/** 距離 upTo までのコースを固定して、解けるかを調べる用の(終わりのある)ステージにする */
function fixedCourse(seed: number, upTo: number): StageDef {
  const stage = createEndless(seed);
  stage.extend?.(upTo + 2000);
  const obstacles = stage.obstacles.filter((o) => o.x < upTo);
  const last = obstacles[obstacles.length - 1];
  return { ...stage, obstacles, length: last.x + last.w + 1000, extend: undefined };
}

describe('エンドレスの速さと背景', () => {
  it('走るほど速くなり、MAX_SPEED を超えない', () => {
    expect(endlessSpeed(0)).toBe(START_SPEED);
    let prev = 0;
    for (let d = 0; d <= 100000; d += 500) {
      const v = endlessSpeed(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThan(MAX_SPEED);
      prev = v;
    }
    expect(endlessSpeed(30000)).toBeGreaterThan(MAX_SPEED - 10);
  });

  it('背景は一定の距離ごとに変わり、10 種類をぐるぐる回る', () => {
    expect(endlessTheme(0)).toBe(0);
    expect(endlessTheme(THEME_SPAN - 1)).toBe(0);
    expect(endlessTheme(THEME_SPAN)).toBe(1);
    expect(endlessTheme(THEME_SPAN * 10)).toBe(0);
  });

  it('スコアは、走った距離(10 px = 1 m)', () => {
    expect(meters(0)).toBe(0);
    expect(meters(999)).toBe(99);
    expect(meters(10000)).toBe(1000);
  });

  it('難しさの段階は、走るほど上がる', () => {
    expect([0, 2499, 2500, 5500, 9500, 50000].map(tierAt)).toEqual([0, 0, 1, 2, 3, 3]);
  });
});

describe('コースの作り方', () => {
  it('同じ種なら同じコース、種がちがえば別のコースになる', () => {
    const a = endlessObstacles(7, 12000);
    const b = endlessObstacles(7, 12000);
    const c = endlessObstacles(8, 12000);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.length).toBeGreaterThan(10);
  });

  it('足していっても、すでにある部分は変わらない', () => {
    const stage = createEndless(3);
    stage.extend?.(3000);
    const before = JSON.stringify(stage.obstacles.filter((o) => o.x < 2000));
    stage.extend?.(30000);
    expect(JSON.stringify(stage.obstacles.filter((o) => o.x < 2000))).toBe(before);
  });

  it('障害物は位置の順で、重ならず、最初の障害物までは 1 秒以上ある', () => {
    for (const seed of [1, 2, 3]) {
      const obs = endlessObstacles(seed, 20000);
      let end = 0;
      for (const o of obs) {
        expect(o.x).toBeGreaterThanOrEqual(end);
        end = o.x + o.w;
      }
      expect(obs[0].x / START_SPEED).toBeGreaterThanOrEqual(1);
    }
  });

  it('はじめのうちは易しい部品だけ(高い岩は、段階 1 から)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(endlessObstacles(seed, 2500).some((o) => o.kind === 'T')).toBe(false);
    }
  });

  it('部品の数が、段階ごとにそろっている(どの段階にも 4 個以上)', () => {
    for (let tier = 0; tier <= 3; tier++) expect(CHUNKS.filter((c) => c.tier === tier).length).toBeGreaterThanOrEqual(4);
  });

  it('newGame は、さきの障害物を用意する。走るにつれて、足される', () => {
    const stage = createEndless(5);
    newGame(stage);
    const n = stage.obstacles.length;
    expect(n).toBeGreaterThan(0);
    let s = newGame(stage);
    for (let i = 0; i < 600; i++) s = step(s, { pressed: false, held: false });
    expect(stage.obstacles.length).toBeGreaterThanOrEqual(n);
    expect(s.dist).toBeGreaterThan(0);
  });
});

describe('どの順番でつないでも、かならず越えられる', () => {
  const SPEEDS = [START_SPEED, 250, 320, MAX_SPEED];

  it('段階が上がる速さは、だんだん速くなる', () => {
    expect([0, 1, 2, 3].map(tierStartSpeed).every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true);
  });

  it.each(CHUNKS.map((c) => [c.layout, c] as const))('部品「%s」は、その部品が出る速さ(段階が上がる速さ以上)なら、判定を 6px 厳しくしても越えられる', (_name, chunk) => {
    // 速さが上がってから出る部品は、遅い速さでは、そもそも出ない(出ない速さでは、確かめない)
    const speeds = [...SPEEDS.filter((v) => v >= tierStartSpeed(chunk.tier)), tierStartSpeed(chunk.tier)];
    for (const speed of speeds) {
      const stage: StageDef = { id: 0, name: 'chunk', speed, ...parseLayout(speed, `1500 ${chunk.layout} 1500`), eggs: [] };
      expect(findPlan(stage, 6), `${speed}px/s`).not.toBeNull();
    }
  });

  it.each([1, 2, 3, 4, 5, 6])('種 %i のコースを、はじめから 25000px まで(だんだん速くなる)、判定を 4px 厳しくしても越えられる', (seed) => {
    expect(findPlan(fixedCourse(seed, 25000), 4)).not.toBeNull();
  }, 60_000);

  it('見つけた押し方で、本物のエンドレス(step)を、ずっと走りつづけられる', () => {
    const seed = 11;
    const plan = findPlan(fixedCourse(seed, 20000), 4);
    expect(plan).not.toBeNull();
    let s = newGame(createEndless(seed));
    const moves = [...(plan ?? [])];
    const lastFrame = Math.max(...moves.map((m) => m.frame)) + 60;
    // 確かめた範囲(20000px)の手前まで走る
    while (s.status === 'running' && s.frame < lastFrame && s.dist < 19000) {
      const m = moves.find((x) => s.frame >= x.frame && s.frame < x.frame + x.hold);
      s = step(s, { pressed: moves.some((x) => x.frame === s.frame), held: m !== undefined });
    }
    expect(s.status).toBe('running');
    expect(meters(s.dist)).toBeGreaterThan(1000);
    expect(progressPercent(s)).toBe(0);
  }, 60_000);
});

describe('速さが変わる走りの計算', () => {
  it('走った距離は、フレームごとの速さの合計', () => {
    const stage = createEndless(1);
    let s = newGame(stage);
    let expected = 0;
    for (let i = 0; i < 300; i++) {
      expected += endlessSpeed(expected) * DT;
      s = step(s, { pressed: false, held: false });
      if (s.status !== 'running') break;
    }
    if (s.status === 'running') expect(s.dist).toBeCloseTo(expected, 6);
  });

  it('何もしないと、最初の障害物にぶつかる(エンドレスにもゴールはない)', () => {
    let s = newGame(createEndless(2));
    while (s.status === 'running' && s.frame < 3000) s = step(s, { pressed: false, held: false });
    expect(s.status).toBe('dead');
  });
});
