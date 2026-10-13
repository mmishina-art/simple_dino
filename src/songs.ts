// BGM の曲のデータと、曲を「いつ・どの高さの音を鳴らすか」の一覧に変える純関数(音を出す部分は music.ts)。
// 曲はすべてこのアプリのために作った自作のメロディーで、音声ファイルは持たない。
//
// メロディーの書き方: 1 小節 = 空白で区切った音の並び。「音名:長さ」で、長さは 16 分音符の数(1 小節は合計 16)。
//   例: "E5:2 G5:2 C6:4"(8 分・8 分・4 分)。「r:4」は休み。音名は C4、F#5、Bb4 のように書く(C4 = ド)。
// コードは 1 小節に 1 つ(C、Am、G7 のように。m は短調、7 はドミナント 7th)。ベース・伴奏・ドラムは、コードから自動で作る。

export type SongId = 'title' | 'ending' | `stage${number}`;

export type BassStyle = 'long' | 'quarters' | 'pulse' | 'bounce';
export type ArpStyle = 'none' | 'eighths' | 'sixteenths';
export type DrumStyle = 'none' | 'soft' | 'beat' | 'drive';

export interface Song {
  id: SongId;
  /** 曲名(画面には出さないが、データの見分け用) */
  name: string;
  bpm: number;
  /** 1 小節に 1 つのコード */
  chords: readonly string[];
  /** 1 小節に 1 行のメロディー */
  melody: readonly string[];
  /** メロディーに使ってよい音の高さ(C、F# など)。外れた音を置いてしまう間違いをテストで見つける */
  scale: readonly string[];
  lead: OscillatorType;
  bass: BassStyle;
  arp: ArpStyle;
  drums: DrumStyle;
  /** メロディーを短く切る(はずむ感じ) */
  staccato?: boolean;
  /** やまびこ(同じ音を、少し遅れて小さく重ねる) */
  echo?: boolean;
  /** メロディーを下げる幅(半音)。省くと LEAD_SHIFT。やわらかい音色の曲は、小さくして高めにできる */
  leadShift?: number;
}

const MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const SONGS: readonly Song[] = [
  {
    id: 'title', name: 'ぼうけんのはじまり', bpm: 108,
    chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'G', 'G'],
    melody: [
      'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4',
      'D5:2 G5:2 B5:4 A5:2 G5:2 D5:4',
      'C5:2 E5:2 A5:4 G5:2 E5:2 C5:4',
      'B4:2 E5:2 G5:4 F#5:2 E5:2 B4:4',
      'A4:2 C5:2 F5:4 E5:2 C5:2 A4:4',
      'G4:2 C5:2 E5:4 D5:2 C5:2 G4:4',
      'D5:4 G5:4 B5:4 D6:4',
      'B5:2 A5:2 G5:2 F5:2 D5:4 r:4',
    ],
    scale: [...MAJOR, 'F#'], lead: 'square', bass: 'bounce', arp: 'none', drums: 'beat',
  },
  {
    id: 'stage1', name: 'そうげん', bpm: 120,
    chords: ['C', 'F', 'C', 'G', 'C', 'F', 'G', 'C'],
    melody: [
      'G5:2 E5:2 G5:2 C6:2 B5:2 G5:2 E5:2 G5:2',
      'A5:2 F5:2 A5:2 C6:2 A5:4 F5:4',
      'E5:2 G5:2 C6:2 E6:2 D6:2 C6:2 G5:2 E5:2',
      'D5:2 G5:2 B5:2 D6:2 C6:2 B5:2 A5:2 G5:2',
      'G5:2 E5:2 G5:2 C6:2 B5:2 G5:2 E5:2 C5:2',
      'A5:2 F5:2 A5:2 C6:2 F6:4 C6:4',
      'B5:2 D6:2 G6:2 D6:2 B5:2 G5:2 D5:2 B4:2',
      'C6:4 G5:4 E5:4 C5:4',
    ],
    scale: MAJOR, lead: 'square', bass: 'bounce', arp: 'none', drums: 'soft',
  },
  {
    id: 'stage2', name: 'さばく', bpm: 124,
    chords: ['Am', 'Am', 'G', 'E', 'Am', 'Dm', 'E', 'E'],
    melody: [
      'A5:3 B5:1 C6:2 B5:2 A5:2 G#5:2 A5:4',
      'E5:2 A5:2 C6:4 B5:2 A5:2 E5:4',
      'G5:3 A5:1 B5:2 A5:2 G5:2 F5:2 G5:4',
      'E5:2 G#5:2 B5:4 A5:2 G#5:2 E5:4',
      'C6:2 B5:2 A5:2 G#5:2 A5:4 C6:4',
      'D6:3 C6:1 A5:2 F5:2 A5:2 F5:2 D5:4',
      'E5:2 G#5:2 B5:2 E6:2 D6:2 C6:2 B5:2 G#5:2',
      'A5:4 G#5:2 F5:2 E5:8',
    ],
    scale: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'G#'], lead: 'square', bass: 'pulse', arp: 'none', drums: 'beat',
  },
  {
    id: 'stage3', name: 'ゆうやけ', bpm: 104,
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C'],
    melody: [
      'C5:4 F5:4 A5:6 G5:2',
      'F5:4 A5:4 D6:6 C6:2',
      'Bb5:4 A5:4 G5:4 F5:4',
      'E5:4 G5:4 C6:8',
      'A5:4 C6:4 F6:6 E6:2',
      'D6:4 C6:4 A5:4 F5:4',
      'D6:4 C6:2 Bb5:2 A5:4 G5:4',
      'G5:4 E5:4 C5:8',
    ],
    scale: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'], lead: 'triangle', bass: 'quarters', arp: 'eighths', drums: 'soft', leadShift: 5,
  },
  {
    id: 'stage4', name: 'もり', bpm: 116,
    chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'D'],
    melody: [
      'G5:2 r:2 B5:2 r:2 D6:2 r:2 B5:2 G5:2',
      'E5:2 r:2 G5:2 r:2 B5:2 r:2 G5:2 E5:2',
      'C5:2 E5:2 G5:2 C6:2 E6:4 D6:2 C6:2',
      'D6:2 C6:2 B5:2 A5:2 F#5:4 A5:4',
      'G5:2 B5:2 D6:2 G6:2 F#6:2 D6:2 B5:2 G5:2',
      'E5:2 G5:2 B5:2 E6:2 D6:2 B5:2 G5:2 E5:2',
      'C6:4 G5:2 E5:2 G5:4 C6:4',
      'A5:2 B5:2 C6:2 B5:2 A5:4 D5:4',
    ],
    scale: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'], lead: 'square', bass: 'bounce', arp: 'none', drums: 'beat', staccato: true,
  },
  {
    id: 'stage5', name: 'どうくつ', bpm: 96,
    chords: ['Em', 'C', 'Am', 'B', 'Em', 'C', 'Am', 'B'],
    melody: [
      'E5:6 r:2 B5:4 r:4',
      'G5:6 r:2 E5:4 r:4',
      'A5:4 C6:4 B5:4 r:4',
      'D#5:4 F#5:4 B5:8',
      'E5:2 G5:2 B5:4 E6:6 r:2',
      'G5:2 C6:2 E6:4 D6:6 r:2',
      'C6:4 B5:4 A5:4 G5:4',
      'F#5:4 D#5:4 B4:8',
    ],
    scale: ['E', 'F#', 'G', 'A', 'B', 'C', 'D', 'D#'], lead: 'triangle', bass: 'long', arp: 'none', drums: 'none', echo: true,
  },
  {
    id: 'stage6', name: 'ゆきぐに', bpm: 112,
    chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G', 'A'],
    melody: [
      'F#6:2 A6:2 F#6:2 D6:2 A5:4 r:4',
      'D6:2 F#6:2 D6:2 B5:2 F#5:4 r:4',
      'B5:2 D6:2 G6:2 D6:2 B5:4 G5:4',
      'A5:2 C#6:2 E6:2 A6:2 E6:4 C#6:4',
      'A6:2 F#6:2 D6:2 F#6:2 A6:8',
      'B5:2 D6:2 F#6:2 D6:2 B5:2 D6:2 F#6:2 B6:2',
      'G6:4 F#6:2 E6:2 D6:4 B5:4',
      'C#6:4 E6:4 A5:8',
    ],
    scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'], lead: 'sine', bass: 'long', arp: 'eighths', drums: 'soft', echo: true,
  },
  {
    id: 'stage7', name: 'かざん', bpm: 140,
    chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A'],
    melody: [
      'D5:2 D5:2 F5:2 D5:2 A5:2 D5:2 G5:2 F5:2',
      'D5:2 D5:2 F5:2 D5:2 A5:2 D6:2 C6:2 A5:2',
      'Bb4:2 Bb4:2 D5:2 Bb4:2 F5:2 Bb4:2 D5:2 F5:2',
      'C5:2 C5:2 E5:2 C5:2 G5:2 C5:2 E5:2 G5:2',
      'D5:2 D5:2 F5:2 D5:2 A5:2 D5:2 G5:2 F5:2',
      'A5:2 D6:2 F6:4 E6:2 D6:2 C6:2 A5:2',
      'Bb5:2 A5:2 G5:2 F5:2 D5:4 F5:4',
      'E5:2 A5:2 C#6:2 E6:2 C#6:2 A5:2 E5:4',
    ],
    scale: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C', 'C#'], lead: 'square', bass: 'pulse', arp: 'none', drums: 'drive',
  },
  {
    id: 'stage8', name: 'よる', bpm: 112,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Em'],
    melody: [
      'E5:4 A5:4 C6:4 B5:4',
      'A5:4 C6:4 F6:6 E6:2',
      'G5:4 E6:4 D6:4 C6:4',
      'B5:4 D6:4 G6:8',
      'C6:4 B5:2 A5:2 E5:8',
      'F5:4 A5:4 C6:4 A5:4',
      'D6:4 B5:4 G5:4 D5:4',
      'E5:4 G5:4 B5:8',
    ],
    scale: MAJOR, lead: 'triangle', bass: 'quarters', arp: 'sixteenths', drums: 'soft',
  },
  {
    id: 'stage9', name: 'うちゅう', bpm: 108,
    chords: ['C', 'D', 'Em', 'D', 'C', 'D', 'G', 'D'],
    melody: [
      'G5:4 E6:4 G6:6 F#6:2',
      'A5:4 D6:4 F#6:6 E6:2',
      'G5:4 B5:4 E6:8',
      'F#6:4 D6:4 A5:8',
      'E6:4 G6:4 B6:4 G6:4',
      'F#6:4 A6:4 F#6:4 D6:4',
      'B5:4 D6:4 G6:8',
      'A5:4 F#5:4 D5:8',
    ],
    scale: ['C', 'D', 'E', 'F#', 'G', 'A', 'B'], lead: 'sine', bass: 'long', arp: 'sixteenths', drums: 'none', echo: true,
  },
  {
    id: 'stage10', name: 'ラスト', bpm: 152,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'],
    melody: [
      'E5:1 E5:1 G5:2 E5:1 E5:1 B5:2 E5:1 E5:1 G5:2 B5:2 E6:2',
      'E6:2 D6:2 B5:2 G5:2 B5:2 D6:2 E6:4',
      'C5:1 C5:1 E5:2 C5:1 C5:1 G5:2 C5:1 C5:1 E5:2 G5:2 C6:2',
      'D5:1 D5:1 F#5:2 D5:1 D5:1 A5:2 D6:2 C6:2 A5:2 F#5:2',
      'B5:2 E6:2 G6:4 F#6:2 E6:2 D6:2 B5:2',
      'E6:2 G6:2 B6:4 A6:2 G6:2 F#6:2 E6:2',
      'C6:2 G5:2 E5:2 G5:2 C6:2 E6:2 G6:2 E6:2',
      'F#6:2 D#6:2 B5:2 F#5:2 D#5:2 F#5:2 B5:4',
    ],
    scale: ['E', 'F#', 'G', 'A', 'B', 'C', 'D', 'D#'], lead: 'square', bass: 'pulse', arp: 'none', drums: 'drive',
  },
  {
    id: 'ending', name: 'あさやけ', bpm: 96,
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C'],
    melody: [
      'E5:4 G5:4 C6:8',
      'B5:4 D6:4 G6:8',
      'C6:4 E6:4 A6:6 G6:2',
      'A5:4 C6:4 F6:8',
      'G6:4 E6:4 C6:4 E6:4',
      'D6:4 B5:4 G5:4 B5:4',
      'A5:4 C6:4 F6:4 A6:4',
      'G6:6 E6:2 C6:8',
    ],
    scale: MAJOR, lead: 'triangle', bass: 'quarters', arp: 'eighths', drums: 'soft',
  },
];

/** 鳴らすときの、メロディーの高さの下げ幅(半音)。楽譜(melody)は読みやすい高さで書き、実際は 1 オクターブ下で鳴らす。
 *  高い音域の四角波は、耳に刺さる(キンキンする)ので。 */
export const LEAD_SHIFT = 12;

export const songById = (id: SongId): Song => {
  const song = SONGS.find((s) => s.id === id);
  if (!song) throw new Error(`曲がありません: ${id}`);
  return song;
};

export const stageSongId = (stageId: number): SongId => `stage${stageId}`;

// ---- 音名・コード ----

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" "F#5" "Bb4" を MIDI 番号(A4 = 69)にする */
export function midiOf(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`音名がおかしい: ${name}`);
  return SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

export const freqOfMidi = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** 音の高さの名前(オクターブなし)。C、F#、Bb */
export const pitchClassOf = (name: string): string => name.replace(/\d$/, '');

export interface Chord {
  /** 根音(低いほうのド = 36 のあたり)の MIDI 番号 */
  root: number;
  /** 根音からの、コードの音(半音の数)。3 和音 */
  tones: readonly [number, number, number];
}

export function parseChord(name: string): Chord {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(name);
  if (!m) throw new Error(`コードがおかしい: ${name}`);
  const root = (midiOf(`${m[1]}1`) % 12) + 36;
  return { root, tones: [0, m[2] ? 3 : 4, 7] };
}

// ---- 曲 → 演奏イベント ----

export type Voice = 'lead' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  /** 曲の頭からの位置(16 分音符の数) */
  step: number;
  /** 長さ(16 分音符の数) */
  len: number;
  voice: Voice;
  /** 周波数(ドラムは 0) */
  freq: number;
  /** 音量(0〜1) */
  gain: number;
}

export interface MelodyNote {
  midi: number | null;
  len: number;
  /** 小節の中の位置 */
  at: number;
}

export function parseBar(bar: string): MelodyNote[] {
  const notes: MelodyNote[] = [];
  let at = 0;
  for (const token of bar.trim().split(/\s+/)) {
    const m = /^([A-G][#b]?\d|r):(\d+)$/.exec(token);
    if (!m) throw new Error(`メロディーの書き方がおかしい: ${token}`);
    const len = Number(m[2]);
    notes.push({ midi: m[1] === 'r' ? null : midiOf(m[1]), len, at });
    at += len;
  }
  return notes;
}

export const STEPS_PER_BAR = 16;

export const songSteps = (song: Song): number => song.melody.length * STEPS_PER_BAR;

/** 1 ステップ(16 分音符)の秒数 */
export const stepSeconds = (song: Song): number => 60 / song.bpm / 4;

function bassBar(style: BassStyle, root: number, base: number): { at: number; len: number; midi: number }[] {
  // 根音の高さ(C2〜B2)。小さいスピーカーでも聞こえるよう、これより低くしない
  const low = root;
  const fifth = low + 7;
  switch (style) {
    case 'long':
      return [{ at: 0, len: 16, midi: low }];
    case 'quarters':
      return [0, 4, 8, 12].map((at, i) => ({ at, len: 4, midi: i % 2 === 0 ? low : fifth }));
    case 'pulse':
      return Array.from({ length: 8 }, (_, i) => ({ at: i * 2, len: 2, midi: i % 4 === 2 ? low + 12 : low }));
    case 'bounce':
      return [0, 4, 8, 12].map((at, i) => ({ at, len: 2, midi: i % 2 === 0 ? low : fifth })).concat([{ at: 2, len: 2, midi: low + base }]).slice(0, 4);
  }
}

function drumBar(style: DrumStyle): { at: number; voice: Voice; gain: number }[] {
  switch (style) {
    case 'none':
      return [];
    case 'soft':
      return [
        { at: 0, voice: 'kick', gain: 0.5 }, { at: 8, voice: 'kick', gain: 0.4 },
        ...[2, 6, 10, 14].map((at) => ({ at, voice: 'hat' as const, gain: 0.25 })),
      ];
    case 'beat':
      return [
        { at: 0, voice: 'kick', gain: 0.6 }, { at: 8, voice: 'kick', gain: 0.5 },
        { at: 4, voice: 'snare', gain: 0.4 }, { at: 12, voice: 'snare', gain: 0.4 },
        ...[0, 2, 4, 6, 8, 10, 12, 14].map((at) => ({ at, voice: 'hat' as const, gain: 0.2 })),
      ];
    case 'drive':
      return [
        ...[0, 4, 8, 12].map((at) => ({ at, voice: 'kick' as const, gain: 0.7 })),
        { at: 4, voice: 'snare', gain: 0.5 }, { at: 12, voice: 'snare', gain: 0.5 },
        ...Array.from({ length: 16 }, (_, at) => ({ at, voice: 'hat' as const, gain: at % 2 === 0 ? 0.18 : 0.28 })),
      ];
  }
}

/** 1 周ぶんの演奏イベントを、位置の順に返す */
export function buildEvents(song: Song): NoteEvent[] {
  const events: NoteEvent[] = [];
  song.melody.forEach((bar, b) => {
    const origin = b * STEPS_PER_BAR;
    const chord = parseChord(song.chords[b]);

    // メロディー
    for (const n of parseBar(bar)) {
      if (n.midi === null) continue;
      const len = song.staccato ? Math.max(1, Math.ceil(n.len / 2)) : n.len;
      const freq = freqOfMidi(n.midi - (song.leadShift ?? LEAD_SHIFT));
      events.push({ step: origin + n.at, len, voice: 'lead', freq, gain: 0.14 });
      if (song.echo) events.push({ step: origin + n.at + 3, len: Math.min(len, 3), voice: 'lead', freq, gain: 0.045 });
    }

    // ベース
    for (const n of bassBar(song.bass, chord.root, 0)) {
      events.push({ step: origin + n.at, len: n.len, voice: 'bass', freq: freqOfMidi(n.midi), gain: 0.26 });
    }

    // 伴奏(コードの音を 1 つずつ順に鳴らす)
    if (song.arp !== 'none') {
      const unit = song.arp === 'eighths' ? 2 : 1;
      const pattern = [0, 1, 2, 1];
      for (let i = 0; i < STEPS_PER_BAR / unit; i++) {
        const tone = chord.tones[pattern[i % pattern.length]];
        events.push({ step: origin + i * unit, len: unit, voice: 'arp', freq: freqOfMidi(chord.root + 24 + tone), gain: 0.07 });
      }
    }

    // ドラム
    for (const d of drumBar(song.drums)) events.push({ step: origin + d.at, len: 1, voice: d.voice, freq: 0, gain: d.gain });
  });
  return events.sort((a, b) => a.step - b.step);
}
