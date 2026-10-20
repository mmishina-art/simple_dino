import { describe, expect, it } from 'vitest';
import { writeAll } from '../src/storage';

/** localStorage のかわり。failAt 回目の書き込みだけ失敗する */
function fakeStore(initial: Record<string, string>, failAt = Infinity) {
  const map = new Map(Object.entries(initial));
  let writes = 0;
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (++writes === failAt) throw new Error('quota');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('writeAll', () => {
  it('すべて書く', () => {
    const store = fakeStore({ a: '1' });
    writeAll(store, { a: '2', b: '3' });
    expect(Object.fromEntries(store.map)).toEqual({ a: '2', b: '3' });
  });

  it('途中で失敗したら、書いた分を元にもどして、例外を投げる', () => {
    const store = fakeStore({ a: '1' }, 3);
    expect(() => writeAll(store, { a: '2', b: '3', c: '4' })).toThrow('quota');
    // a は元の値、b と c は、もともとなかったので、ない
    expect(Object.fromEntries(store.map)).toEqual({ a: '1' });
  });
});
