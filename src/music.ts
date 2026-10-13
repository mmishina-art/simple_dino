// BGM を鳴らす。曲のデータ(songs.ts)を、Web Audio の音(四角波・三角波・ノイズ)で演奏する。音声ファイルは持たない。
// 画面の側は「いまの場面の曲」(setScene)だけを伝える。BGM のオン/オフは効果音とは別の設定。
// ブラウザは、利用者が操作するまで音を出せない。操作があったときに unlockMusic() で始める。
import { audioContext } from './sound';
import { buildEvents, songById, songSteps, stepSeconds, type NoteEvent, type Song, type SongId } from './songs';
import { load, save } from './storage';

let enabled = load('music', true);
/** 利用者が操作した(音を出してよい)か */
let unlocked = false;
/** いま鳴らしたい曲(null なら無音) */
let desired: SongId | null = null;

interface Running {
  id: SongId;
  song: Song;
  bus: GainNode;
  byStep: Map<number, NoteEvent[]>;
  steps: number;
  stepSec: number;
  /** 0 ステップ目を鳴らす時刻 */
  t0: number;
  next: number;
  timer: number;
}
let running: Running | undefined;
let noise: AudioBuffer | undefined;

/** 先読みする長さ(秒)と、確認の間隔(ミリ秒) */
const LOOKAHEAD = 0.2;
const TICK_MS = 40;
const MASTER_GAIN = 0.55;

export const isMusicOn = (): boolean => enabled;

/** バックアップを読み込んだあとなど、保存されている設定を読み直す */
export function syncMusic(): void {
  setMusicOn(load('music', true), false);
}

export function setMusicOn(on: boolean, persist = true): void {
  enabled = on;
  if (persist) save('music', on);
  if (on) startDesired();
  else stopRunning();
}

/** いまの場面の曲を伝える。restart が true なら、同じ曲でも頭から。delay は鳴らし始めるまでの秒数 */
export function setScene(id: SongId | null, opts: { restart?: boolean; delay?: number } = {}): void {
  const same = desired === id && running?.id === id;
  desired = id;
  if (same && !opts.restart) return;
  stopRunning();
  startDesired(opts.delay ?? 0);
}

/** 利用者が操作したときに呼ぶ(音を出してよくなる)。止まっていた曲があれば始める */
export function unlockMusic(): void {
  unlocked = true;
  if (!enabled) return;
  try {
    void audioContext().resume();
  } catch {
    return;
  }
  if (!running) startDesired();
}

function startDesired(delay = 0): void {
  if (!enabled || !unlocked || desired === null || running) return;
  let ctx: AudioContext;
  try {
    ctx = audioContext();
  } catch {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
    if (ctx.state === 'suspended') return;
  }
  const song = songById(desired);
  const byStep = new Map<number, NoteEvent[]>();
  for (const e of buildEvents(song)) byStep.set(e.step, [...(byStep.get(e.step) ?? []), e]);
  const bus = ctx.createGain();
  bus.gain.value = MASTER_GAIN;
  bus.connect(ctx.destination);
  const r: Running = { id: song.id, song, bus, byStep, steps: songSteps(song), stepSec: stepSeconds(song), t0: ctx.currentTime + 0.06 + delay, next: 0, timer: 0 };
  r.timer = window.setInterval(() => tick(ctx, r), TICK_MS);
  running = r;
  tick(ctx, r);
  document.dispatchEvent(new CustomEvent('app:music', { detail: { song: song.id } }));
}

function stopRunning(): void {
  const r = running;
  if (!r) return;
  running = undefined;
  window.clearInterval(r.timer);
  try {
    const ctx = audioContext();
    r.bus.gain.cancelScheduledValues(ctx.currentTime);
    r.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  } catch {
    // 止められなくても続行する
  }
  window.setTimeout(() => r.bus.disconnect(), 400);
}

function tick(ctx: AudioContext, r: Running): void {
  if (running !== r) return;
  while (r.t0 + r.next * r.stepSec < ctx.currentTime + LOOKAHEAD) {
    const at = r.t0 + r.next * r.stepSec;
    for (const e of r.byStep.get(r.next % r.steps) ?? []) play(ctx, r, e, at);
    r.next += 1;
    // 長く止まっていたら(別のタブにいたなど)、遅れを取り戻そうとせずに今から続ける
    if (r.t0 + r.next * r.stepSec < ctx.currentTime - 0.5) r.t0 = ctx.currentTime - r.next * r.stepSec;
  }
}

function play(ctx: AudioContext, r: Running, e: NoteEvent, at: number): void {
  const dur = e.len * r.stepSec;
  switch (e.voice) {
    case 'lead':
      tone(ctx, r.bus, r.song.lead, e.freq, at, dur * (r.song.staccato ? 0.8 : 0.92), e.gain);
      break;
    case 'bass':
      tone(ctx, r.bus, 'triangle', e.freq, at, dur * 0.9, e.gain);
      break;
    case 'arp':
      tone(ctx, r.bus, 'square', e.freq, at, dur * 0.7, e.gain);
      break;
    case 'kick':
      kick(ctx, r.bus, at, e.gain);
      break;
    case 'snare':
      hit(ctx, r.bus, at, 0.12, e.gain, 'bandpass', 1800);
      break;
    case 'hat':
      hit(ctx, r.bus, at, 0.04, e.gain * 0.5, 'highpass', 7000);
      break;
  }
}

function tone(ctx: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, at: number, dur: number, gain: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const end = at + Math.max(0.03, dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.008);
  g.gain.setTargetAtTime(gain * 0.65, at + 0.02, 0.12);
  g.gain.setTargetAtTime(0, end - 0.02, 0.015);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(end + 0.1);
}

function kick(ctx: AudioContext, dest: AudioNode, at: number, gain: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  g.gain.setValueAtTime(gain * 0.5, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + 0.2);
}

function hit(ctx: AudioContext, dest: AudioNode, at: number, dur: number, gain: number, kind: BiquadFilterType, freq: number): void {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    // 毎回同じ音になるよう、乱数は固定(簡単な線形合同法)
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * 0.5, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(at);
  src.stop(at + dur + 0.02);
}

// 画面を離れている間は、曲を止める(戻ったら、続きから)
document.addEventListener('visibilitychange', () => {
  try {
    const ctx = audioContext();
    if (document.hidden) void ctx.suspend();
    else if (enabled) void ctx.resume();
  } catch {
    // 音が使えない環境では何もしない
  }
});
