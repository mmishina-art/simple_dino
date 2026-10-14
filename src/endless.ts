// エンドレスモード: 障害物の「部品」(パターン)を、すきまをあけながらつないで、終わりのないコースを作る。
// 部品は src/stages.ts と同じ書き方(障害物の記号と、ミリ秒のすきま)。部品ごとに、どの速さでもクリアできることを
// tests/endless.test.ts がソルバーで確かめている(だから、どの順番でつないでも、かならず越えられる)。
// コースは乱数の種(seed)で決まる。同じ種なら、同じコースになる。
import { MEAT_W, type Meat, type Obstacle, type StageDef } from './logic';
import { parseLayout } from './stages';

/** 走り出しの速さと、いくら走っても超えない速さ(px/秒) */
export const START_SPEED = 180;
export const MAX_SPEED = 400;

/** 距離に応じた速さ。はじめは速く上がり、だんだん上がり方がゆるやかになる */
export function endlessSpeed(dist: number): number {
  return START_SPEED + (MAX_SPEED - START_SPEED) * (1 - Math.exp(-dist / 9000));
}

/** 背景が変わる間隔(px)。ステージ 1 から順に、10 種類をぐるぐる */
export const THEME_SPAN = 2500;
export const endlessTheme = (dist: number): number => Math.floor(dist / THEME_SPAN) % 10;

/** 1 m = 10 px。スコアは、走った距離(m) */
export const meters = (dist: number): number => Math.floor(dist / 10);

export interface Chunk {
  /** この部品が出はじめる難しさの段階(0〜3)。段階は、走った距離で上がる */
  tier: number;
  /** 障害物の記号と、ミリ秒のすきま(stages.ts の書き方。はじめと終わりの数字はなし) */
  layout: string;
}

export const CHUNKS: readonly Chunk[] = [
  // 段階 0: ひとつずつ
  { tier: 0, layout: 'S' },
  { tier: 0, layout: 'R' },
  { tier: 0, layout: 'B' },
  { tier: 0, layout: 'S 90 S' },
  // 段階 1: 2 つつづき、高い岩
  { tier: 1, layout: 'R 100 S' },
  { tier: 1, layout: 'B 90 B' },
  { tier: 1, layout: 'S 450 S' },
  { tier: 1, layout: 'T' },
  // 段階 2: 3 つ、すばやい 2 回
  { tier: 2, layout: 'S 90 S 90 S' },
  { tier: 2, layout: 'T 90 S' },
  { tier: 2, layout: 'B 400 S' },
  { tier: 2, layout: 'S 380 T' },
  { tier: 2, layout: 'S 330 S' },
  // 段階 3: 連続ジャンプ
  { tier: 3, layout: 'T 400 S' },
  { tier: 3, layout: 'S 330 S 330 S' },
  { tier: 3, layout: 'B 90 B 90 B' },
  { tier: 3, layout: 'R 350 T' },
  { tier: 3, layout: 'T 440 B' },
];

/** 走った距離ごとの、難しさの段階と、部品どうしのすきま(ミリ秒の幅) */
const TIER_START: readonly number[] = [0, 2500, 5500, 9500];
const REST_MS: readonly (readonly [number, number])[] = [[1200, 1800], [1000, 1500], [900, 1300], [800, 1100]];
/** 部品のあとに肉を置く確率(段階ごと)。ほぼ 7 秒に 1 個。取ると効き目が約 8 秒続くので、続けて取ると高いレベルになる */
const MEAT_CHANCE: readonly number[] = [0.2, 0.22, 0.25, 0.28];
/** 最初の障害物までの時間(ミリ秒) */
const FIRST_MS = 1500;

/** その段階の部品が出はじめるときの、走る速さ(px/秒)。それより遅い速さでは、その段階の部品は出ない */
export const tierStartSpeed = (tier: number): number => endlessSpeed(TIER_START[tier]);

export const tierAt = (dist: number): number => TIER_START.reduce<number>((t, start, i) => (dist >= start ? i : t), 0);

/** 乱数(種から、毎回同じ並びを作る) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 種 seed のエンドレスのコース。obstacles は、extend() で、走るにつれて後ろに足されていく */
export function createEndless(seed: number): StageDef {
  const rand = mulberry32(seed);
  const obstacles: Obstacle[] = [];
  const meats: Meat[] = [];
  // 肉の乱数は、障害物の乱数とは別にする(肉を足しても、障害物のコースは変わらない)
  const meatRand = mulberry32(seed ^ 0x9e3779b9);
  let cursor = (FIRST_MS * START_SPEED) / 1000;

  const pick = (dist: number): Chunk => {
    const tier = tierAt(dist);
    // いまの段階の部品を、ほかより出やすくする
    const pool = CHUNKS.filter((c) => c.tier <= tier).flatMap((c) => (c.tier === tier ? [c, c, c] : [c]));
    return pool[Math.floor(rand() * pool.length)];
  };

  /**
   * 部品のあとに、肉を置くことがある。取るのは、障害物をよけるジャンプの途中でできるように置く:
   * - すきまの地面(ジャンプしなくても取れる)
   * - 障害物が 1 つだけの部品: その真上(少し高い所と、高い所)
   * - 障害物が 2 つ以上の部品: 越える直前(ジャンプの上り)か、越えた直後(下り)の、まだ低い所。
   *   真上は、長いジャンプのいちばん高い所を通るので、肉の高さにとどかない
   */
  const placeMeat = (chunk: Obstacle[], chunkEnd: number, restPx: number, tier: number): void => {
    if (meatRand() >= MEAT_CHANCE[tier]) return;
    const kind = meatRand();
    const tallest = Math.max(...chunk.map((o) => o.h));
    const first = chunk[0].x;
    const last = chunk[chunk.length - 1].x + chunk[chunk.length - 1].w;
    if (kind < 0.3) {
      meats.push({ x: Math.round(chunkEnd + restPx / 2 - MEAT_W / 2), y: 0 });
    } else if (chunk.length === 1) {
      const y = kind < 0.65 ? tallest + 14 : tallest + 44;
      meats.push({ x: Math.round((first + last) / 2 - MEAT_W / 2), y: Math.min(y, 104) });
    } else if (kind < 0.65) {
      meats.push({ x: Math.round(first - 40 - MEAT_W), y: 34 });
    } else {
      meats.push({ x: Math.round(last + 26), y: 34 });
    }
  };

  return {
    id: 0,
    name: 'エンドレス',
    speed: START_SPEED,
    length: Infinity,
    obstacles,
    eggs: [],
    meats,
    endless: true,
    speedAt: endlessSpeed,
    themeAt: endlessTheme,
    extend(upTo) {
      while (cursor < upTo) {
        const speed = endlessSpeed(cursor);
        const chunk = pick(cursor);
        const { obstacles: placed, length } = parseLayout(speed, chunk.layout);
        for (const o of placed) obstacles.push({ ...o, x: cursor + o.x });
        const tier = tierAt(cursor);
        const [lo, hi] = REST_MS[tier];
        // すきまは 10ms 単位の乱数
        const rest = lo + Math.floor((rand() * (hi - lo)) / 10) * 10;
        const restPx = (rest * endlessSpeed(cursor + length)) / 1000;
        placeMeat(placed.map((o) => ({ ...o, x: cursor + o.x })), cursor + length, restPx, tier);
        cursor += length + restPx;
      }
    },
  };
}

/** テスト用: 距離 upTo までのコースを、固定の形(障害物の並び)で取り出す */
export function endlessObstacles(seed: number, upTo: number): Obstacle[] {
  const stage = createEndless(seed);
  stage.extend?.(upTo);
  return stage.obstacles.filter((o) => o.x < upTo);
}
