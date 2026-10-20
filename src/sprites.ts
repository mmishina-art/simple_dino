// ドット絵のデータ(画像ファイルは持たず、文字の並びで自作する)。
// '#' はメインの色、'o' はアクセントの色、'.' は透明。1 マスは描画時に CELL 論理 px になる。
// 障害物の絵の大きさは、当たり判定(src/logic.ts の OBSTACLE_SIZES)と同じになるようにしてある。

export type Sprite = readonly string[];

const DINO_BODY: Sprite = [
  '........#####.',
  '.......#######',
  '.......##.####',
  '.......#######',
  '.......###....',
  '.......######.',
  '#.....####....',
  '##...#####.#..',
  '.#########....',
  '..########....',
];

/** やられた顔: 目が × になる */
const DINO_DEAD_BODY: Sprite = DINO_BODY.map((row, i) => (i === 1 || i === 3 ? '.......#.#.###' : row));

const LEGS = {
  stand: ['...##..##.....', '...##..##.....'],
  runA: ['...##..##.....', '...##.........'],
  runB: ['...##..##.....', '.......##.....'],
} as const;

export const DINO = {
  stand: [...DINO_BODY, ...LEGS.stand],
  runA: [...DINO_BODY, ...LEGS.runA],
  runB: [...DINO_BODY, ...LEGS.runB],
  dead: [...DINO_DEAD_BODY, ...LEGS.stand],
} as const satisfies Record<string, Sprite>;

/**
 * ちびダイノ(小さくて速い): ダイノを縮めて、頭を大きく(7 マス幅)し、口(あいたくち)をつけた絵。11 × 10 マス(22 × 20 px)。
 * 色はダイノと同じ 1 色。目と口は、穴で表す。絵は当たり判定(14 × 16)より少し大きいが、判定は絵の足もとの中央にあり、絵とは別。
 */
const CHIBI_BODY: Sprite = [
  '.....#####.',
  '....#######',
  '....##.####',
  '....####...',
  '....#######',
  '#...#####..',
  '##.#######.',
  '.########..',
];
/** やられた顔: 目が × のようになる */
const CHIBI_DEAD_BODY: Sprite = CHIBI_BODY.map((row, i) => (i === 2 ? '....#.#.###' : row));
const CHIBI_LEGS = {
  stand: ['..##..##...', '..##..##...'],
  runA: ['..##..##...', '..##.......'],
  runB: ['..##..##...', '......##...'],
} as const;

export const DINO_CHIBI = {
  stand: [...CHIBI_BODY, ...CHIBI_LEGS.stand],
  runA: [...CHIBI_BODY, ...CHIBI_LEGS.runA],
  runB: [...CHIBI_BODY, ...CHIBI_LEGS.runB],
  dead: [...CHIBI_DEAD_BODY, ...CHIBI_LEGS.stand],
} as const satisfies Record<string, Sprite>;

/**
 * 元のちびダイノ(エンドレスで、肉をまだ取っていないときの姿): ダイノを縮めただけの、いちばん小さい絵。10 × 8 マス(20 × 16 px)。
 */
const CHIBI_ORIG_BODY: Sprite = [
  '......###.',
  '.....#####',
  '.....#.###',
  '#...######',
  '##.#####..',
  '.#######..',
];
const CHIBI_ORIG_DEAD_BODY: Sprite = CHIBI_ORIG_BODY.map((row, i) => (i === 1 ? '.....#.#.#' : i === 2 ? '.....#####' : row));
const CHIBI_ORIG_LEGS = {
  stand: ['..##.##...', '..##.##...'],
  runA: ['..##.##...', '..##......'],
  runB: ['..##.##...', '.....##...'],
} as const;

export const DINO_CHIBI_ORIG = {
  stand: [...CHIBI_ORIG_BODY, ...CHIBI_ORIG_LEGS.stand],
  runA: [...CHIBI_ORIG_BODY, ...CHIBI_ORIG_LEGS.runA],
  runB: [...CHIBI_ORIG_BODY, ...CHIBI_ORIG_LEGS.runB],
  dead: [...CHIBI_ORIG_DEAD_BODY, ...CHIBI_ORIG_LEGS.stand],
} as const satisfies Record<string, Sprite>;

/**
 * 進化したダイノ(エンドレスで、肉のレベルが最大のときの姿): ダイノを大きくして、頭に角、背中にとげ('o' はアクセントの色)をつけた絵。
 * 16 × 15 マス(32 × 30 px)。
 */
const EVO_BODY: Sprite = [
  '..........o..o..',
  '.........######.',
  '........########',
  '........##.#####',
  '........########',
  '........###.....',
  '........###.....',
  '.......o#######.',
  '#.....o####.....',
  '##....#####..#..',
  '##o.o.#####..#..',
  '.##########.....',
  '..#########.....',
];
/** やられた顔: 目が × のようになる */
const EVO_DEAD_BODY: Sprite = EVO_BODY.map((row, i) => (i === 2 || i === 4 ? '........#.#.####' : row));
const EVO_LEGS = {
  stand: ['...###..##......', '...###..##......'],
  runA: ['...###..##......', '...###..........'],
  runB: ['...###..##......', '........###.....'],
} as const;

export const DINO_EVO = {
  stand: [...EVO_BODY, ...EVO_LEGS.stand],
  runA: [...EVO_BODY, ...EVO_LEGS.runA],
  runB: [...EVO_BODY, ...EVO_LEGS.runB],
  dead: [...EVO_DEAD_BODY, ...EVO_LEGS.stand],
} as const satisfies Record<string, Sprite>;

/** 着地でつぶれた姿: 体の 1 行(row 行め)を抜いて、1 マス低くする */
export function squashed(sprite: Sprite, row = 9): Sprite {
  return sprite.filter((_, i) => i !== row);
}

interface Arm {
  /** 腕の上端の行 */
  top: number;
  /** 幹とつなぐ行 */
  join: number;
}

/** サボテン: 幹は 3 マス幅、左右に 1 本ずつ腕 */
function cactus(w: number, h: number, left: Arm, right: Arm): Sprite {
  const mid = (w - 1) / 2;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  for (let y = 0; y < h; y++) {
    for (let x = mid - 1; x <= mid + 1; x++) grid[y][x] = y === 0 && x !== mid ? '.' : '#';
  }
  for (let y = left.top; y <= left.join; y++) grid[y][0] = '#';
  for (let x = 0; x <= mid - 1; x++) grid[left.join][x] = '#';
  for (let y = right.top; y <= right.join; y++) grid[y][w - 1] = '#';
  for (let x = mid + 1; x < w; x++) grid[right.join][x] = '#';
  return grid.map((r) => r.join(''));
}

/** 高い岩: 上が丸く、ところどころにひびと明るい面 */
function pillar(w: number, h: number): Sprite {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const inset = y < 4 ? 4 - y : 0;
    const n = w - inset * 2;
    let row = '#'.repeat(n);
    if (y > 5 && y % 7 === 1) row = row.slice(0, 3) + 'oo' + row.slice(5);
    if (y > 8 && y % 9 === 4) row = row.slice(0, n - 5) + 'oo' + row.slice(n - 3);
    rows.push('.'.repeat(inset) + row + '.'.repeat(inset));
  }
  return rows;
}

/** たまご: k はふち、# は白い殻、o は影(つや)。大きさは当たり判定(EGG_W × EGG_H)と同じ */
export const EGG: Sprite = [
  '..kkk..',
  '.k###k.',
  'k#o###k',
  'k#o###k',
  'k#####k',
  'k#####k',
  '.k###k.',
  '..kkk..',
];

/** 骨つきの肉: k はふち、# は肉、o はつやと骨。大きさは当たり判定(MEAT_W × MEAT_H)と同じ */
export const MEAT: Sprite = [
  '..kkkk...',
  '.k####k..',
  'k#oo###k.',
  'k######k.',
  '.k####kk.',
  '..kkkoook',
  '.....kook',
  '......kk.',
];

export const SPRITES = {
  S: cactus(7, 13, { top: 3, join: 6 }, { top: 4, join: 7 }),
  B: cactus(9, 22, { top: 6, join: 12 }, { top: 3, join: 9 }),
  R: [
    '....#####....',
    '..#########..',
    '.###oo######.',
    '.###oo######.',
    '#############',
    '#########oo##',
    '#############',
    '##oo#########',
    '#############',
    '#############',
  ],
  T: pillar(14, 32),
} as const satisfies Record<string, Sprite>;
