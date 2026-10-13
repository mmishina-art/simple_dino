// アイコンを生成する（標準ライブラリのみ）: npm run icons
// 色・形はここを書き換えて再実行する。PNG を直接編集しない。
// maskable は端末が外側を円や角丸で切り抜くため、図柄を中央 60% に収める。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0xf7, 0xf1, 0xde];
const FG = [0x3b, 0x3a, 0x30];

// 図柄: ドット絵の恐竜（# が体、. が空き）。目は穴になっている。
const SPRITE = [
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
  '...#####......',
  '...##..##.....',
];
const SW = SPRITE[0].length;
const SH = SPRITE.length;

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// size: 一辺(px) / figure: 図柄の大きさ(一辺に対する割合) / fullBleed: 背景を全面に塗る
function png(size, figure, fullBleed) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2;
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      // 角丸の背景（fullBleed のときは全面）
      const dx = Math.max(Math.abs(x - c) - (c - radius), 0);
      const dy = Math.max(Math.abs(y - c) - (c - radius), 0);
      const inBg = fullBleed || dx * dx + dy * dy <= radius * radius;
      // 図柄: 中央のドット絵（横幅が figure の割合になる）
      const cell = (size * figure) / SW;
      const sx = Math.floor((x - (c - (SW * cell) / 2)) / cell);
      const sy = Math.floor((y - (c - (SH * cell) / 2)) / cell);
      const inFg = sx >= 0 && sx < SW && sy >= 0 && sy < SH && SPRITE[sy][sx] === '#';
      const px = inFg ? FG : BG;
      const o = row + 1 + x * 4;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
      raw[o + 3] = inBg ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// SVG 用: 同じドット絵を、小さな四角の集まりとして書く（横幅は 512 の 70%）
function svgPath() {
  const cell = (512 * 0.7) / SW;
  const x0 = 256 - (SW * cell) / 2;
  const y0 = 256 - (SH * cell) / 2;
  let d = '';
  SPRITE.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') d += `M${(x0 + x * cell).toFixed(1)} ${(y0 + y * cell).toFixed(1)}h${cell.toFixed(1)}v${cell.toFixed(1)}h-${cell.toFixed(1)}z`;
    });
  });
  return d;
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  'icon-192.png': png(192, 0.7, false),
  'icon-512.png': png(512, 0.7, false),
  'icon-maskable-512.png': png(512, 0.6, true),
  // apple-touch-icon は iOS が角を丸めるので全面塗りにする
  'apple-touch-icon.png': png(180, 0.7, true),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, out), data);

writeFileSync(
  new URL('icon.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#f7f1de"/><path fill="#3b3a30" d="${svgPath()}"/></svg>\n`,
);
console.log('icons generated:', [...Object.keys(files), 'icon.svg'].join(', '));
