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
  /** ステージごとの、いちばん進んだ場所(0〜100 %)。クリアしたら 100 */
  bestPercent: Record<string, number>;
  /** ステージごとの、クリアしたときに取っていたたまごの番号(何回かのクリアの合計) */
  eggs: Record<string, number[]>;
  /** 1 回のクリアで、たまごを全部取った(★3つ)ステージの番号 */
  perfect: number[];
  /** エンドレスモードの、ハイスコア(点。肉の倍率が入る)と、遊んだ回数。版 3 まではメートルだったが、倍率なしなら同じ値 */
  endlessBest: number;
  endlessRuns: number;
}

export function emptyProgress(): Progress {
  return { cleared: [], attempts: {}, firstClearTries: {}, endingSeen: false, bestPercent: {}, eggs: {}, perfect: [], endlessBest: 0, endlessRuns: 0 };
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
  // 版 2 で足した項目(古い記録にはない)
  if (r.bestPercent && typeof r.bestPercent === 'object') {
    for (const [k, v] of Object.entries(r.bestPercent)) if (validId(Number(k)) && isCount(v) && v <= 100) p.bestPercent[k] = v;
  }
  if (r.eggs && typeof r.eggs === 'object') {
    for (const [k, v] of Object.entries(r.eggs)) {
      if (validId(Number(k)) && Array.isArray(v)) p.eggs[k] = [...new Set(v.filter((i): i is number => isCount(i) && i < 20))].sort((a, b) => a - b);
    }
  }
  if (Array.isArray(r.perfect)) p.perfect = [...new Set(r.perfect.filter(validId))].sort((a, b) => a - b);
  // 版 3 で足した項目
  if (isCount(r.endlessBest)) p.endlessBest = r.endlessBest;
  if (isCount(r.endlessRuns)) p.endlessRuns = r.endlessRuns;
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

/** やられた。進んだ場所(percent)がベストなら記録する。newBest は、ベストを更新したか(はじめてのステージも更新) */
export function recordDeath(p: Progress, id: number, percent: number): { progress: Progress; newBest: boolean } {
  const pct = Math.max(0, Math.min(99, Math.floor(percent)));
  const prev = p.bestPercent[id];
  if (prev !== undefined && pct <= prev) return { progress: p, newBest: false };
  return { progress: { ...p, bestPercent: { ...p.bestPercent, [id]: pct } }, newBest: true };
}

/**
 * クリアした(collected: この回に取ったたまごの番号、eggTotal: そのステージのたまごの数)。
 * はじめてのクリアなら、そのときの挑戦回数を残す。たまごは、何回かのクリアの合計。
 */
export function recordClear(p: Progress, id: number, collected: readonly number[] = [], eggTotal = 0): Progress {
  const mine = [...new Set([...(p.eggs[id] ?? []), ...collected])].sort((a, b) => a - b);
  const perfect = eggTotal > 0 && new Set(collected).size >= eggTotal;
  return {
    ...p,
    cleared: isCleared(p, id) ? p.cleared : [...p.cleared, id].sort((a, b) => a - b),
    firstClearTries: isCleared(p, id) ? p.firstClearTries : { ...p.firstClearTries, [id]: Math.max(1, p.attempts[id] ?? 1) },
    bestPercent: { ...p.bestPercent, [id]: 100 },
    eggs: { ...p.eggs, [id]: mine },
    perfect: perfect && !p.perfect.includes(id) ? [...p.perfect, id].sort((a, b) => a - b) : p.perfect,
  };
}

/** いちばん進んだ場所(0〜100 %)。クリア済みなら 100(古い記録にも対応) */
export const bestOf = (p: Progress, id: number): number => (isCleared(p, id) ? 100 : (p.bestPercent[id] ?? 0));

/** ★の数(0〜3)。クリアで 1、たまごを全部取った(何回かの合計でよい)で 2、1 回のクリアで全部取って 3 */
export function starsOf(p: Progress, id: number, eggTotal: number): number {
  if (!isCleared(p, id)) return 0;
  const gotAll = eggTotal > 0 && (p.eggs[id]?.length ?? 0) >= eggTotal;
  return 1 + (gotAll ? 1 : 0) + (p.perfect.includes(id) ? 1 : 0);
}

export const totalStars = (p: Progress, eggTotals: readonly number[]): number => eggTotals.reduce((sum, total, i) => sum + starsOf(p, i + 1, total), 0);

/** エンドレスを 1 回遊んだ結果(score はスコア。点)。ハイスコアなら記録する。newBest は、ハイスコアを更新したか */
export function recordEndless(p: Progress, score: number): { progress: Progress; newBest: boolean } {
  const m = Math.max(0, Math.min(999_999, Math.floor(score)));
  const newBest = m > p.endlessBest;
  return { progress: { ...p, endlessRuns: p.endlessRuns + 1, endlessBest: newBest ? m : p.endlessBest }, newBest };
}

export const markEndingSeen = (p: Progress): Progress => ({ ...p, endingSeen: true });

export const totalAttempts = (p: Progress): number => Object.values(p.attempts).reduce((a, b) => a + b, 0);
