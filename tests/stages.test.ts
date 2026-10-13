import { describe, expect, it } from 'vitest';
import { goalFrame, step, newGame, FPS, JUMP_V, OBSTACLE_SIZES, distanceAt } from '../src/game';
import { STAGES, parseLayout } from '../src/stages';
import { canClear, jumpTrajectory, maxMargin } from './solver';

describe('ステージの配置の読み取り', () => {
  it('数字は時間(ミリ秒)として距離に変え、障害物は幅の分だけ進む', () => {
    const { obstacles, length } = parseLayout(200, '1000 S 500 R 1000');
    expect(obstacles.map((o) => [o.kind, o.x])).toEqual([['S', 200], ['R', 200 + OBSTACLE_SIZES.S.w + 100]]);
    expect(length).toBeCloseTo(200 + OBSTACLE_SIZES.S.w + 100 + OBSTACLE_SIZES.R.w + 200, 5);
  });

  it('知らない記号はエラーにする', () => {
    expect(() => parseLayout(200, '1000 X')).toThrow('知らない記号');
  });
});

describe('ステージのデータ', () => {
  it('全10ステージで、番号が 1〜10 の順に並ぶ', () => {
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('名前が空でなく、重複しない', () => {
    const names = STAGES.map((s) => s.name);
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('進むほど速くなる', () => {
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].speed).toBeGreaterThan(STAGES[i - 1].speed);
  });

  it('障害物は位置の順に並び、重ならず、スタートの直後とゴールの直前には置かない', () => {
    for (const s of STAGES) {
      let end = 0;
      for (const o of s.obstacles) {
        expect(o.x, `ステージ${s.id}`).toBeGreaterThanOrEqual(end);
        end = o.x + o.w;
      }
      expect(s.obstacles[0].x / s.speed, `ステージ${s.id}: 最初の障害物まで(秒)`).toBeGreaterThanOrEqual(0.9);
      expect((s.length - end) / s.speed, `ステージ${s.id}: 最後の障害物からゴールまで(秒)`).toBeGreaterThanOrEqual(1);
    }
  });

  it('1 ステージは 20〜45 秒', () => {
    for (const s of STAGES) {
      const sec = goalFrame(s) / FPS;
      expect(sec, `ステージ${s.id}`).toBeGreaterThanOrEqual(20);
      expect(sec, `ステージ${s.id}`).toBeLessThanOrEqual(45);
    }
  });

  it('後半は、障害物が増える(最後は最初の 3 倍以上)', () => {
    expect(STAGES[9].obstacles.length).toBeGreaterThanOrEqual(STAGES[0].obstacles.length * 3);
  });

  it('高い岩(T)は、ステージ 6 から出る', () => {
    for (const s of STAGES) {
      const hasT = s.obstacles.some((o) => o.kind === 'T');
      expect(hasT, `ステージ${s.id}`).toBe(s.id >= 6);
    }
  });
});

describe('クリアできるか(ジャンプの押し方を総当たりして確かめる)', () => {
  it('ソルバーの跳び方が、ゲーム本体(step)と同じ動きをする', () => {
    for (const hold of [1, 8, 20, 40]) {
      const ys = jumpTrajectory(hold);
      let s = newGame(STAGES[0]);
      for (let k = 0; k < ys.length; k++) {
        s = step(s, { pressed: k === 0, held: k < hold });
        expect(s.y).toBeCloseTo(ys[k], 9);
      }
      expect(s.grounded).toBe(true);
    }
    expect(JUMP_V).toBeGreaterThan(0);
  });

  it.each(STAGES.map((s) => [s.id, s] as const))('ステージ %i: 当たり判定どおりでクリアできる', (_id, stage) => {
    expect(canClear(stage, 0)).toBe(true);
  });

  it('ソルバーは、跳べない配置を「無理」と判定する', () => {
    // 高い岩のすぐ後ろに高い岩を、間隔なしで並べても跳べるが、壁のように並べると跳べない
    const wall = { ...STAGES[0], obstacles: Array.from({ length: 12 }, (_, i) => ({ kind: 'T' as const, x: 400 + i * 28, w: 28, h: 64 })) };
    wall.length = 400 + 12 * 28 + 400;
    expect(canClear(wall, 0)).toBe(false);
  });

  it('余裕(判定を何 px 厳しくしても解けるか)は、後半ほど小さい', () => {
    const margins = STAGES.map((s) => maxMargin(s));
    // 前半は易しい: 20px 以上の余裕
    for (const m of margins.slice(0, 2)) expect(m).toBeGreaterThanOrEqual(20);
    // 最終ステージは「かなり難しい」けれど、人間の操作で可能な範囲(約 2 フレーム以上の幅)
    expect(margins[9]).toBeGreaterThanOrEqual(8);
    expect(margins[9]).toBeLessThanOrEqual(12);
    // 最終は、最初のステージよりずっと厳しい
    expect(margins[9]).toBeLessThan(margins[0] / 2);
    // 途中で急に易しくなりすぎない(1 つ前より 6px を超えて増えない)
    for (let i = 1; i < margins.length; i++) expect(margins[i], `ステージ${i + 1}`).toBeLessThanOrEqual(margins[i - 1] + 6);
  }, 60_000);

  it('distanceAt はステージの長さに達する', () => {
    for (const s of STAGES) expect(distanceAt(s, goalFrame(s))).toBeGreaterThanOrEqual(s.length);
  });
});
