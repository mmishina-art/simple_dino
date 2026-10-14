import { describe, expect, it } from 'vitest';
import {
  allCleared, bestOf, emptyProgress, isUnlocked, markEndingSeen, recordAttempt, recordClear, recordDeath, sanitizeProgress, starsOf, totalAttempts, totalStars,
} from '../src/progress';

describe('ステージの解放', () => {
  it('最初は、ステージ 1 だけ遊べる', () => {
    const p = emptyProgress();
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('ステージをクリアすると、つぎのステージが遊べる', () => {
    const p = recordClear(emptyProgress(), 1);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
  });

  it('クリア済みのステージは、何度でも遊べる', () => {
    const p = recordClear(recordClear(emptyProgress(), 1), 2);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(true);
  });
});

describe('記録', () => {
  it('挑戦回数を数える(元の記録は書き換えない)', () => {
    const p0 = emptyProgress();
    const p2 = recordAttempt(recordAttempt(p0, 1), 1);
    expect(p2.attempts[1]).toBe(2);
    expect(p0.attempts[1]).toBeUndefined();
    expect(totalAttempts(recordAttempt(p2, 3))).toBe(3);
  });

  it('はじめてクリアしたときの挑戦回数を残し、2 回目以降のクリアでは変えない', () => {
    let p = emptyProgress();
    for (let i = 0; i < 4; i++) p = recordAttempt(p, 2);
    p = recordClear(p, 2);
    expect(p.firstClearTries[2]).toBe(4);
    p = recordClear(recordAttempt(p, 2), 2);
    expect(p.firstClearTries[2]).toBe(4);
    expect(p.cleared).toEqual([2]);
  });

  it('全ステージクリアを判定する', () => {
    let p = emptyProgress();
    for (let id = 1; id <= 10; id++) {
      expect(allCleared(p, 10)).toBe(false);
      p = recordClear(p, id);
    }
    expect(allCleared(p, 10)).toBe(true);
  });

  it('エンディングを見た印を付ける', () => {
    expect(markEndingSeen(emptyProgress()).endingSeen).toBe(true);
  });
});

describe('保存されていた値の検査', () => {
  it('正しい記録は、そのまま読み込める', () => {
    const p = {
      cleared: [1, 2, 3], attempts: { '1': 2, '3': 5 }, firstClearTries: { '1': 2 }, endingSeen: true,
      bestPercent: { '4': 62, '1': 100 }, eggs: { '1': [0, 2], '2': [0] }, perfect: [1],
    };
    expect(sanitizeProgress(JSON.parse(JSON.stringify(p)), 10)).toEqual(p);
  });

  it('壊れた値は、空の記録にする', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) expect(sanitizeProgress(bad, 10)).toEqual(emptyProgress());
  });

  it('範囲外・重複・型違いの値は捨てる', () => {
    const p = sanitizeProgress({ cleared: [3, 1, 1, 0, 11, 2.5, '4', null], attempts: { '1': -1, '2': 'x', '99': 3, '3': 4 }, firstClearTries: { '2': 1.5 }, endingSeen: 'yes' }, 10);
    expect(p.cleared).toEqual([1, 3]);
    expect(p.attempts).toEqual({ '3': 4 });
    expect(p.firstClearTries).toEqual({});
    expect(p.endingSeen).toBe(false);
  });

  it('版 1 の古い記録(新しい項目がない)も読み込める。新しい項目は空になる', () => {
    const old = { cleared: [1, 2], attempts: { '1': 3 }, firstClearTries: { '1': 3 }, endingSeen: false };
    const p = sanitizeProgress(old, 10);
    expect(p.cleared).toEqual([1, 2]);
    expect(p.bestPercent).toEqual({});
    expect(p.eggs).toEqual({});
    expect(p.perfect).toEqual([]);
  });

  it('新しい項目の、範囲外・型違いの値は捨てる', () => {
    const p = sanitizeProgress({
      bestPercent: { '1': 101, '2': -3, '3': 40, '99': 50, '4': 'x' }, eggs: { '1': [0, 0, 2, -1, 99, 'a'], '77': [1], '2': 'x' }, perfect: [1, 1, 0, 11, 'a'],
    }, 10);
    expect(p.bestPercent).toEqual({ '3': 40 });
    expect(p.eggs).toEqual({ '1': [0, 2] });
    expect(p.perfect).toEqual([1]);
  });
});

describe('ベストの進み具合', () => {
  it('はじめてやられた場所はベストになる。それより手前なら、ベストは変わらない', () => {
    const first = recordDeath(emptyProgress(), 1, 40.7);
    expect(first.newBest).toBe(true);
    expect(first.progress.bestPercent[1]).toBe(40);
    const worse = recordDeath(first.progress, 1, 25);
    expect(worse.newBest).toBe(false);
    expect(worse.progress).toBe(first.progress);
    const equal = recordDeath(first.progress, 1, 40);
    expect(equal.newBest).toBe(false);
    const better = recordDeath(first.progress, 1, 73);
    expect(better.newBest).toBe(true);
    expect(better.progress.bestPercent[1]).toBe(73);
  });

  it('やられたときの値は 0〜99 におさめる(100 はクリアだけ)', () => {
    expect(recordDeath(emptyProgress(), 1, 150).progress.bestPercent[1]).toBe(99);
    expect(recordDeath(emptyProgress(), 1, -5).progress.bestPercent[1]).toBe(0);
  });

  it('クリアすると 100 %。クリア済みのステージは、古い記録でも 100 と読む', () => {
    expect(recordClear(emptyProgress(), 3).bestPercent[3]).toBe(100);
    expect(bestOf({ ...emptyProgress(), cleared: [3] }, 3)).toBe(100);
    expect(bestOf(emptyProgress(), 3)).toBe(0);
    expect(bestOf(recordDeath(emptyProgress(), 3, 55).progress, 3)).toBe(55);
  });
});

describe('たまごと★', () => {
  it('クリアしていないと、★は 0', () => {
    expect(starsOf(emptyProgress(), 1, 3)).toBe(0);
  });

  it('クリアだけで ★1', () => {
    expect(starsOf(recordClear(emptyProgress(), 1, [0], 3), 1, 3)).toBe(1);
  });

  it('たまごを全部取ると ★2(何回かのクリアの合計でよい)。1 回で全部取ると ★3', () => {
    let p = recordClear(emptyProgress(), 1, [0, 2], 3);
    expect(p.eggs[1]).toEqual([0, 2]);
    expect(starsOf(p, 1, 3)).toBe(1);
    p = recordClear(p, 1, [1], 3);
    expect(p.eggs[1]).toEqual([0, 1, 2]);
    expect(starsOf(p, 1, 3)).toBe(2);
    expect(p.perfect).toEqual([]);
    p = recordClear(p, 1, [2, 1, 0], 3);
    expect(starsOf(p, 1, 3)).toBe(3);
    expect(p.perfect).toEqual([1]);
  });

  it('取ったたまごは、あとのクリアで減らない。クリア済みのまま、挑戦回数も変わらない', () => {
    let p = recordAttempt(recordAttempt(emptyProgress(), 2), 2);
    p = recordClear(p, 2, [0, 1], 3);
    expect(p.firstClearTries[2]).toBe(2);
    p = recordClear(recordAttempt(p, 2), 2, [], 3);
    expect(p.eggs[2]).toEqual([0, 1]);
    expect(p.firstClearTries[2]).toBe(2);
    expect(p.cleared).toEqual([2]);
  });

  it('★の合計', () => {
    let p = recordClear(emptyProgress(), 1, [0, 1, 2], 3);
    p = recordClear(p, 2, [0], 3);
    expect(totalStars(p, [3, 3, 3])).toBe(3 + 1);
  });
});
