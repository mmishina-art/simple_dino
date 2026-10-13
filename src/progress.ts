// どこまでクリアしたかの記録。DOM にも localStorage にも触れない純関数(保存は storage.ts 経由で main.ts が行う)。
// 保存の形を変えるときは、backup.ts の SCHEMA_VERSION を上げて storage.ts の migrate() に移行処理を書く。

export interface Progress {
  /** クリアしたステージの番号(小さい順) */
  cleared: number[];
  /** ステージごとの、挑戦した回数 */
  attempts: Record<string, number>;
  /** ステージごとの、はじめてクリアしたときの挑戦回数(「N 回目でクリア」の表示用) */
  firstClearTries: Record<string, number>;
  /** 全ステージクリアのエンディングを見たか */
  endingSeen: boolean;
}

export function emptyProgress(): Progress {
  return { cleared: [], attempts: {}, firstClearTries: {}, endingSeen: false };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1_000_000;

/** 保存されていたもの(壊れていたり、バックアップから読み込んだりした値)を、安全な形に直す */
export function sanitizeProgress(raw: unknown, stageCount: number): Progress {
  const p = emptyProgress();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  const validId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= stageCount;
  if (Array.isArray(r.cleared)) p.cleared = [...new Set(r.cleared.filter(validId))].sort((a, b) => a - b);
  for (const key of ['attempts', 'firstClearTries'] as const) {
    const src = r[key];
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src)) if (validId(Number(k)) && isCount(v)) p[key][k] = v;
  }
  p.endingSeen = r.endingSeen === true;
  return p;
}

export const isCleared = (p: Progress, id: number): boolean => p.cleared.includes(id);

/** ステージ 1 は最初から遊べる。ほかは、ひとつ前のステージをクリアすると遊べる */
export const isUnlocked = (p: Progress, id: number): boolean => id === 1 || isCleared(p, id - 1);

export const allCleared = (p: Progress, stageCount: number): boolean => p.cleared.length >= stageCount;

/** 挑戦を始めた(元の記録は書き換えない) */
export function recordAttempt(p: Progress, id: number): Progress {
  return { ...p, attempts: { ...p.attempts, [id]: (p.attempts[id] ?? 0) + 1 } };
}

/** クリアした。はじめてのクリアなら、そのときの挑戦回数を残す */
export function recordClear(p: Progress, id: number): Progress {
  if (isCleared(p, id)) return p;
  return {
    ...p,
    cleared: [...p.cleared, id].sort((a, b) => a - b),
    firstClearTries: { ...p.firstClearTries, [id]: Math.max(1, p.attempts[id] ?? 1) },
  };
}

export const markEndingSeen = (p: Progress): Progress => ({ ...p, endingSeen: true });

export const totalAttempts = (p: Progress): number => Object.values(p.attempts).reduce((a, b) => a + b, 0);
