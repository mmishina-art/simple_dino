import { describe, expect, it } from 'vitest';
import { UPDATE_CHECK_GAP_MS, UPDATE_CHECK_INTERVAL_MS, shouldCheck } from '../src/updatecheck';

describe('新版の確認の間隔', () => {
  it('まだ確認していなければ、確認する', () => {
    expect(shouldCheck(1000, null)).toBe(true);
  });

  it('前回から 1 分たっていなければ見送り、たてば確認する', () => {
    expect(shouldCheck(10_000, 0)).toBe(false);
    expect(shouldCheck(UPDATE_CHECK_GAP_MS - 1, 0)).toBe(false);
    expect(shouldCheck(UPDATE_CHECK_GAP_MS, 0)).toBe(true);
  });

  it('開いたままのときの間隔(1 時間)は、最小の間隔より長い', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThan(UPDATE_CHECK_GAP_MS);
  });
});
