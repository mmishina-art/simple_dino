import { describe, expect, it } from 'vitest';
import { CHUNKS, MAX_SPEED, mulberry32, START_SPEED, THEME_SPAN, createEndless, endlessObstacles, endlessSpeed, endlessTheme, meters, tierAt, tierStartSpeed } from '../src/endless';
import { BOOST_MAX, DINO_H, DT, GRAVITY_HOLD, JUMP_V, MEAT_PICKUP, MEAT_W, approachFactor, boostTarget, newGame, progressPercent, step, type StageDef } from '../src/logic';
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
    // 途中の肉を取ると、速さが変わって、押し方がずれる。ここでは、走りの計算がソルバーと一致するか見たいので、肉は置かない
    const real = createEndless(seed);
    real.meats = [];
    let s = newGame(real);
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

// ---- 肉(速さが途中で変わっても、かならず越えられる) ----

/** 押し続けたジャンプの、いちばん高いところ(px)。JUMP_V² / (2 × 上昇中の重力) */
const JUMP_PEAK = (JUMP_V * JUMP_V) / (2 * GRAVITY_HOLD);

/** レベルの予定(フレーム → レベル)から、速さの倍率を、本物と同じ近づき方(approachFactor)で作る */
function factorsFor(levelAt: (frame: number) => number, frames: number): (frame: number) => number {
  const list = [1];
  for (let f = 1; f <= frames; f++) list.push(approachFactor(list[f - 1], levelAt(f)));
  return (frame) => list[Math.min(frame, frames)];
}

describe('肉で速くなっても、かならず越えられる', () => {
  const TOP = boostTarget(BOOST_MAX);

  it.each(CHUNKS.map((c) => [c.layout, c] as const))('部品「%s」は、いちばん速い肉のレベルでも、判定を 6px 厳しくしても越えられる', (_name, chunk) => {
    // 部品は、肉なしの速さ(base)で並べてある。肉で TOP 倍になると、時間で見たすきまは、1/TOP にちぢむ
    for (const base of [tierStartSpeed(chunk.tier), 320, MAX_SPEED].filter((v) => v >= tierStartSpeed(chunk.tier))) {
      const stage: StageDef = { id: 0, name: 'chunk', speed: base * TOP, ...parseLayout(base, `1500 ${chunk.layout} 1500`), eggs: [] };
      expect(findPlan(stage, 6), `base ${base}px/s × ${TOP}`).not.toBeNull();
    }
  });

  it.each([
    ['ずっとレベル 3', () => BOOST_MAX],
    ['3 秒ごとにレベル 0 と 3 を行き来', (f: number) => (Math.floor(f / 180) % 2 === 0 ? 0 : BOOST_MAX)],
    ['1.5 秒ごとに 0→1→2→3→2→1 をくり返す', (f: number) => [0, 1, 2, 3, 2, 1][Math.floor(f / 90) % 6]],
  ] as const)('コース全体を、肉のレベルが「%s」でも、判定を 4px 厳しくしても越えられる', (_name, levelAt) => {
    for (const seed of [1, 2, 3, 4]) {
      const stage = fixedCourse(seed, 20000);
      expect(findPlan(stage, 4, undefined, factorsFor(levelAt, 6000)), `種 ${seed}`).not.toBeNull();
    }
  }, 120_000);
});

describe('肉のレベルが、でたらめに上がり下がりしても、かならず越えられる', () => {
  it.each([11, 12, 13, 14, 15, 16])('種 %i: 0.5〜5 秒ごとに、レベルを 0〜3 のどれかに変える', (seed) => {
    const rand = mulberry32(seed * 977);
    // フレームごとのレベルの予定
    const levels: number[] = [];
    while (levels.length < 6000) {
      const level = Math.floor(rand() * (BOOST_MAX + 1));
      const len = 30 + Math.floor(rand() * 270);
      for (let i = 0; i < len; i++) levels.push(level);
    }
    const factor = factorsFor((f) => levels[Math.min(f, levels.length - 1)], 6000);
    expect(findPlan(fixedCourse(seed, 20000), 4, undefined, factor)).not.toBeNull();
  }, 120_000);
});

describe('肉の置き方', () => {
  const meatsOf = (seed: number, upTo: number) => {
    const stage = createEndless(seed);
    stage.extend?.(upTo + 2000);
    return { meats: (stage.meats ?? []).filter((m) => m.x < upTo), obstacles: stage.obstacles };
  };

  it('同じ種なら同じ場所。障害物のコースは、肉があっても変わらない', () => {
    expect(meatsOf(3, 15000).meats).toEqual(meatsOf(3, 15000).meats);
    expect(meatsOf(3, 15000).meats).not.toEqual(meatsOf(4, 15000).meats);
    const stage = createEndless(3);
    stage.extend?.(15000);
    const plain = createEndless(3);
    plain.meats = [];
    plain.extend?.(15000);
    expect(stage.obstacles).toEqual(plain.obstacles);
  });

  it('位置の順に並び、ほかの肉と重ならない(60px 以上離れている)。低い所(0)から、とどく高さ(104 以下)まで', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { meats } = meatsOf(seed, 30000);
      expect(meats.length, `種 ${seed}`).toBeGreaterThan(10);
      meats.forEach((m, i) => {
        if (i > 0) expect(m.x - meats[i - 1].x, `種 ${seed}`).toBeGreaterThanOrEqual(60);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeLessThanOrEqual(104);
      });
    }
  });

  it('肉は障害物と重ならない。地面の肉は、前後の障害物から 50px 以上離れている(取りに行って、ぶつからない)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { meats, obstacles } = meatsOf(seed, 30000);
      for (const m of meats) {
        for (const o of obstacles) {
          const overlapX = m.x < o.x + o.w && m.x + MEAT_W > o.x;
          if (overlapX) expect(m.y, `種 ${seed} x=${m.x}`).toBeGreaterThan(o.h);
          if (m.y === 0) expect(Math.min(Math.abs(m.x - (o.x + o.w)), Math.abs(o.x - (m.x + MEAT_W))), `種 ${seed} x=${m.x}`).toBeGreaterThanOrEqual(50);
        }
      }
    }
  });

  it('空中の肉は、最高のジャンプでとどく(体の高さと、取る範囲の広さを入れて、頂点より 20px 以上ひくい)', () => {
    for (const seed of [1, 2, 3]) {
      for (const m of meatsOf(seed, 30000).meats) expect(m.y - MEAT_PICKUP).toBeLessThan(JUMP_PEAK + DINO_H - 20);
    }
  });

  it('どの肉も、障害物をよけながら取れる(取りながら越えられる経路がある。判定は 4px 厳しく、取る範囲は 2px せまく)', () => {
    for (const seed of [1, 2, 3]) {
      const stage = fixedCourse(seed, 16000);
      const all = meatsOf(seed, 15000).meats;
      expect(all.length, `種 ${seed}`).toBeGreaterThan(5);
      for (const m of all) {
        // 肉を「かならず取るたまご」として扱って、取りながら越えられる経路があるか調べる
        const withMeat: StageDef = { ...stage, eggs: [{ x: m.x, y: m.y }] };
        expect(findPlan(withMeat, 4, 2), `種 ${seed} x=${m.x} y=${m.y}`).not.toBeNull();
      }
    }
  }, 300_000);
});
