import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, forCharacter, isCharacterUnlocked, sanitizeCharacterId } from '../src/characters';
import { DINO_BODY, bodyOf, distanceAt, goalFrame, hits, touchesEgg, FPS } from '../src/logic';
import { STAGES } from '../src/stages';
import { DINO, DINO_CHIBI } from '../src/sprites';
import { findPlan, maxMargin } from './solver';

const chibi = characterById('chibi');

describe('キャラ', () => {
  it('ダイノは今までどおり(ステージをそのまま使う)、ちびダイノは小さくて速い', () => {
    expect(forCharacter(STAGES[0], characterById('dino'))).toBe(STAGES[0]);
    const s = forCharacter(STAGES[0], chibi);
    expect(s.speed).toBeCloseTo(STAGES[0].speed * 1.4, 9);
    expect(bodyOf(s).w).toBeLessThan(DINO_BODY.w);
    expect(bodyOf(s).h).toBeLessThan(DINO_BODY.h);
    // コース(障害物・たまごの位置と長さ)は同じ
    expect(s.obstacles).toBe(STAGES[0].obstacles);
    expect(s.eggs).toBe(STAGES[0].eggs);
    expect(s.length).toBe(STAGES[0].length);
    expect(STAGES[0].speed).toBe(180);
  });

  it('ちびダイノは、同じコースを速く走り抜ける(ゴールまでの時間が短い)', () => {
    for (const stage of STAGES) {
      const s = forCharacter(stage, chibi);
      expect(goalFrame(s) / FPS).toBeLessThan(goalFrame(stage) / FPS);
      expect(distanceAt(s, goalFrame(s))).toBeGreaterThanOrEqual(s.length);
    }
  });

  it('ちびダイノが遊べるのは、ダイノで全ステージをクリアしたあと', () => {
    expect(isCharacterUnlocked('dino', 0, STAGES.length)).toBe(true);
    expect(isCharacterUnlocked('chibi', STAGES.length - 1, STAGES.length)).toBe(false);
    expect(isCharacterUnlocked('chibi', STAGES.length, STAGES.length)).toBe(true);
  });

  it('保存されていたキャラの値が変でも、ダイノにもどる', () => {
    expect(sanitizeCharacterId('chibi')).toBe('chibi');
    expect(sanitizeCharacterId('x')).toBe('dino');
    expect(sanitizeCharacterId(null)).toBe('dino');
    expect(CHARACTERS.map((c) => c.id)).toEqual(['dino', 'chibi']);
  });

  it('当たり判定の幅・高さが、キャラの大きさで変わる', () => {
    const o = [{ kind: 'S' as const, x: 100, w: 14, h: 26 }];
    // 幅 20 のダイノは当たるが、幅 14 のちびは当たらない位置
    expect(hits(o, 100 - DINO_BODY.w + 3, 0, 0, DINO_BODY.w)).toBe(true);
    expect(hits(o, 100 - DINO_BODY.w + 3, 0, 0, chibi.body.w)).toBe(false);
    // たまご: 高さ 16 のちびは、ダイノより低い位置では届かない
    const egg = { x: 100, y: 120 };
    expect(touchesEgg(egg, 100, 100)).toBe(true);
    expect(touchesEgg(egg, 100, 100, 0, chibi.body)).toBe(false);
  });

  it('ちびダイノの絵は、判定(14×16)より少し大きくてよい。判定は足もとの中央にあり、絵の大きさとは別', () => {
    for (const k of ['stand', 'runA', 'runB', 'dead'] as const) {
      const rows = DINO_CHIBI[k];
      expect(rows.length * 2).toBeGreaterThanOrEqual(chibi.body.h);
      expect(rows[0].length * 2).toBeGreaterThanOrEqual(chibi.body.w);
      expect(rows[0].length).toBeLessThanOrEqual(DINO[k][0].length);
      expect(new Set(rows.map((r) => r.length)).size).toBe(1);
      // 足が地面につく(いちばん下の行に、足のふちがある)
      expect(rows[rows.length - 1]).toMatch(/[k#]/);
    }
  });
});

describe('ちびダイノでクリアできるか(ソルバー)', () => {
  it.each(STAGES.map((s) => [s.id, s] as const))('ステージ %i: 判定を 4px 厳しくしても、たまごを全部取りながらクリアできる', (_id, stage) => {
    expect(findPlan(forCharacter(stage, chibi), 4, 2)).not.toBeNull();
  }, 60_000);

  it('どのステージもクリアできて、後半ほど、ダイノより時間のゆとりが小さい(難しい)', () => {
    // 時間でみたゆとり(判定を何 px 厳しくしても解けるか ÷ 速さ)を、ダイノと比べる。前半は、判定が小さいぶん同じくらい。後半は、速さのぶん難しい
    const ratios = STAGES.map((stage) => {
      const c = forCharacter(stage, chibi);
      const m = maxMargin(c, 80);
      expect(m, `ステージ${stage.id}`).toBeGreaterThanOrEqual(5);
      return m / c.speed / (maxMargin(stage, 80) / stage.speed);
    });
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(ratios.slice(5))).toBeLessThan(0.85);
    expect(mean(ratios)).toBeLessThan(1.05);
  }, 240_000);
});
