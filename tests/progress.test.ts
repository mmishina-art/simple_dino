import { describe, expect, it } from 'vitest';
import {
  allCleared, emptyProgress, isUnlocked, markEndingSeen, recordAttempt, recordClear, sanitizeProgress, totalAttempts,
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
    const p = { cleared: [1, 2, 3], attempts: { '1': 2, '3': 5 }, firstClearTries: { '1': 2 }, endingSeen: true };
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
});
