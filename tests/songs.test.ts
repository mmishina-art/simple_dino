import { describe, expect, it } from 'vitest';
import { SONGS, STEPS_PER_BAR, buildEvents, freqOfMidi, midiOf, parseBar, parseChord, pitchClassOf, songById, songSteps, stageSongId } from '../src/songs';
import { STAGES } from '../src/stages';

describe('音名とコード', () => {
  it('A4 は 440Hz、C4 は約 261.6Hz', () => {
    expect(freqOfMidi(midiOf('A4'))).toBeCloseTo(440, 5);
    expect(freqOfMidi(midiOf('C4'))).toBeCloseTo(261.63, 1);
  });

  it('シャープとフラットを読める', () => {
    expect(midiOf('F#5')).toBe(midiOf('Gb5'));
    expect(midiOf('C#4')).toBe(midiOf('C4') + 1);
  });

  it('おかしい音名はエラーにする', () => {
    expect(() => midiOf('H4')).toThrow();
    expect(() => midiOf('C')).toThrow();
  });

  it('長調・短調のコードの音を作る', () => {
    expect(parseChord('C').tones).toEqual([0, 4, 7]);
    expect(parseChord('Am').tones).toEqual([0, 3, 7]);
    expect(parseChord('Bb').root % 12).toBe(10);
    expect(() => parseChord('X')).toThrow();
  });

  it('メロディーの 1 小節を、位置と長さに分けて読む', () => {
    const notes = parseBar('E5:2 r:2 G5:4');
    expect(notes.map((n) => [n.at, n.len, n.midi === null])).toEqual([[0, 2, false], [2, 2, true], [4, 4, false]]);
    expect(() => parseBar('E5')).toThrow();
  });
});

describe('曲のデータ', () => {
  it('タイトル・エンディング・全ステージ分の曲がそろっている', () => {
    const ids = SONGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('title');
    expect(ids).toContain('ending');
    for (const stage of STAGES) expect(ids, `ステージ${stage.id}`).toContain(stageSongId(stage.id));
    expect(SONGS).toHaveLength(STAGES.length + 2);
  });

  it.each(SONGS.map((s) => [s.id, s] as const))('%s: 小節の数・長さ・音の高さが正しい', (_id, song) => {
    expect(song.melody).toHaveLength(8);
    expect(song.chords).toHaveLength(song.melody.length);
    song.melody.forEach((bar, i) => {
      const notes = parseBar(bar);
      expect(notes.reduce((n, x) => n + x.len, 0), `${i + 1} 小節目の長さ`).toBe(STEPS_PER_BAR);
      for (const token of bar.split(/\s+/)) {
        if (token.startsWith('r:')) continue;
        const name = token.split(':')[0];
        expect(song.scale, `${i + 1} 小節目の ${name}`).toContain(pitchClassOf(name));
        const midi = midiOf(name);
        expect(midi, `${name} が低すぎ`).toBeGreaterThanOrEqual(midiOf('C4'));
        expect(midi, `${name} が高すぎ`).toBeLessThanOrEqual(midiOf('C7'));
      }
    });
    for (const c of song.chords) parseChord(c);
    expect(song.bpm).toBeGreaterThanOrEqual(90);
    expect(song.bpm).toBeLessThanOrEqual(160);
  });

  it('曲ごとにメロディーが違う', () => {
    const melodies = SONGS.map((s) => s.melody.join('|'));
    expect(new Set(melodies).size).toBe(melodies.length);
  });

  it('曲の最後の音は、最後のコードの音で終わる(終わりがすわる)', () => {
    for (const song of SONGS) {
      const notes = parseBar(song.melody[song.melody.length - 1]).filter((n) => n.midi !== null);
      const chord = parseChord(song.chords[song.chords.length - 1]);
      const tones = new Set(chord.tones.map((t) => (chord.root + t) % 12));
      expect(tones.has((notes[notes.length - 1].midi ?? 0) % 12), `${song.id} の最後の音`).toBe(true);
    }
  });

  it('後半のステージほど、テンポが速くなる傾向(ステージ 10 はステージ 1 より 25 以上速い)', () => {
    expect(songById('stage10').bpm - songById('stage1').bpm).toBeGreaterThanOrEqual(25);
  });

  it('ステージの雰囲気に合わせて、暗いステージ(洞窟・夜・宇宙)は、ドラムなしか控えめ', () => {
    expect(songById('stage5').drums).toBe('none');
    expect(songById('stage9').drums).toBe('none');
    expect(songById('stage10').drums).toBe('drive');
  });
});

describe('演奏イベントの作成', () => {
  it.each(SONGS.map((s) => [s.id, s] as const))('%s: イベントが位置の順で、曲の長さにおさまっている', (_id, song) => {
    const events = buildEvents(song);
    expect(events.length).toBeGreaterThan(20);
    const total = songSteps(song);
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (i > 0) expect(e.step).toBeGreaterThanOrEqual(events[i - 1].step);
      // やまびこは、曲の最後の小節から次の周の頭にはみ出してよい(その分は無視される)
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step).toBeLessThan(total + 8);
      expect(e.gain).toBeGreaterThan(0);
      expect(e.gain).toBeLessThanOrEqual(1);
      expect(e.len).toBeGreaterThanOrEqual(1);
      if (e.voice === 'kick' || e.voice === 'snare' || e.voice === 'hat') expect(e.freq).toBe(0);
      else expect(e.freq).toBeGreaterThan(30);
    }
    expect(events.some((e) => e.voice === 'lead')).toBe(true);
    expect(events.some((e) => e.voice === 'bass')).toBe(true);
  });

  it.each(SONGS.map((s) => [s.id, s] as const))('%s: 音域がマイルド(メロディーは 1.1kHz 以下、ベースは小さいスピーカーでも聞こえる 60Hz 以上)', (_id, song) => {
    for (const e of buildEvents(song)) {
      if (e.voice === 'lead') {
        expect(e.freq).toBeLessThanOrEqual(1100);
        expect(e.freq).toBeGreaterThanOrEqual(180);
      }
      if (e.voice === 'bass') expect(e.freq).toBeGreaterThanOrEqual(60);
      if (e.voice === 'arp') expect(e.freq).toBeLessThanOrEqual(1100);
    }
  });

  it('伴奏・ドラム・やまびこは、曲の指定どおりに入る', () => {
    const has = (id: Parameters<typeof songById>[0], voice: string) => buildEvents(songById(id)).some((e) => e.voice === voice);
    expect(has('stage1', 'arp')).toBe(false);
    expect(has('stage9', 'arp')).toBe(true);
    expect(has('stage5', 'kick')).toBe(false);
    expect(has('stage7', 'kick')).toBe(true);
    const echoes = (id: Parameters<typeof songById>[0]) => buildEvents(songById(id)).filter((e) => e.voice === 'lead' && e.gain < 0.1).length;
    expect(echoes('stage5')).toBeGreaterThan(0);
    expect(echoes('stage1')).toBe(0);
  });
});
