// デバッグモードの表示と、カクつきの原因を切り分けるための操作(フレームの時間・描き方・入力の受け方)。ふつうの利用者には使われない。
import { formatInput, formatPerf, type PerfSummary } from './perf';
import type { Player } from './play';

/** 表示の左下をタップするたびに、描き方を切り替える(自動 → 密度 2 → 密度 1 → 描かない → 更新だけ) */
const RENDER_MODES: readonly { label: string; cap: number | null; off: boolean; idle?: boolean }[] = [
  { label: '密度 自動', cap: null, off: false },
  { label: '密度 ×2', cap: 2, off: false },
  { label: '密度 ×1', cap: 1, off: false },
  { label: '描かない', cap: null, off: true },
  { label: '更新だけ(ゲームも止める)', cap: null, off: true, idle: true },
];

/** 画面を押したときの受け方。左上のボタンで切り替える */
const INPUT_METHODS = ['pointerdown', 'touchstart'] as const;

export class DebugPanel {
  private renderMode = 0;
  private inputMethod = 0;
  private lastPerf = '';

  /** setTouchInput: touchstart で受けるかどうかを切り替える(受け口の付け外しは、画面の側が行う) */
  constructor(
    private readonly player: Player,
    private readonly hud: HTMLElement,
    private readonly inputButton: HTMLElement,
    private readonly setTouchInput: (on: boolean) => void,
  ) {
    inputButton.addEventListener('click', () => {
      this.inputMethod = (this.inputMethod + 1) % INPUT_METHODS.length;
      this.setTouchInput(this.inputMethod === 1);
      this.player.inputStats.reset();
      this.inputButton.textContent = `入力: ${INPUT_METHODS[this.inputMethod]}`;
      this.show();
    });
    hud.addEventListener('click', () => {
      this.renderMode = (this.renderMode + 1) % RENDER_MODES.length;
      const m = RENDER_MODES[this.renderMode];
      this.player.setRenderMode(m.cap, m.off, m.idle === true);
      this.lastPerf = ''; // 新しい描き方の数字が出るまで、前の数字は出さない
      this.show();
    });
  }

  /** いまの入力の受け方の番号(0: pointerdown、1: touchstart) */
  get method(): number {
    return this.inputMethod;
  }

  /** フレームの時間のまとめを受け取って、表示を更新する */
  setPerf(summary: PerfSummary): void {
    this.lastPerf = formatPerf(summary);
    this.show();
  }

  /** デバッグモードのオン/オフに合わせる。オフにしたら、切り替えた設定を元にもどす */
  apply(on: boolean): void {
    // デバッグモードのときだけ、フレームの時間を記録して、ゲーム画面に出す
    this.player.perf = on;
    this.hud.hidden = !on;
    this.inputButton.hidden = !on;
    if (!on && this.renderMode !== 0) {
      this.renderMode = 0;
      this.player.setRenderMode(null);
    }
    if (!on && this.inputMethod !== 0) {
      this.inputMethod = 0;
      this.setTouchInput(false);
      this.inputButton.textContent = `入力: ${INPUT_METHODS[0]}`;
    }
    this.show();
  }

  private show(): void {
    this.hud.textContent = `${this.lastPerf || 'FPS --'} ｜ ${RENDER_MODES[this.renderMode].label}\n${formatInput(this.player.inputStats.summary(), INPUT_METHODS[this.inputMethod])}`;
  }
}
