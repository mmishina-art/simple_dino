// 効果音は Web Audio で合成する（音声ファイルは持たない）。オン/オフ設定は必ず用意する。
import { load, save } from './storage';

let ctx: AudioContext | undefined;
let enabled = load('sound', true);

/** 効果音と BGM が共有する AudioContext(なければ作る) */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

export const isSoundOn = (): boolean => enabled;

/** バックアップを読み込んだあとなど、保存されている設定を読み直す */
export function syncSound(): void {
  enabled = load('sound', true);
}

export function setSound(on: boolean): void {
  enabled = on;
  save('sound', on);
}

export function beep(frequency = 660, seconds = 0.08): void {
  if (!enabled) return;
  try {
    const ctx = audioContext();
    // iPhone では操作のあとに resume が必要
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
    // テストが「どの音が鳴ったか」を確認できるようにイベントを出す
    document.dispatchEvent(new CustomEvent('app:sound', { detail: { frequency } }));
  } catch {
    // 音が出せなくても続行する
  }
}

/** ゲームの効果音。音の高さと並びだけで作る(音声ファイルは持たない) */
export type Sfx = 'jump' | 'land' | 'dead' | 'clear' | 'start';

const SEQUENCES: Record<Sfx, readonly (readonly [number, number])[]> = {
  jump: [[520, 0.09]],
  land: [[180, 0.04]],
  dead: [[220, 0.12], [160, 0.12], [110, 0.25]],
  clear: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]],
  start: [[440, 0.07], [660, 0.1]],
};

export function sfx(name: Sfx): void {
  let delay = 0;
  for (const [freq, sec] of SEQUENCES[name]) {
    if (delay === 0) beep(freq, sec);
    else setTimeout(() => beep(freq, sec), delay * 1000);
    delay += sec;
  }
}
