// タイトル画面とエンディング画面の絵の動き。動きを減らす設定のときは、止まった絵だけ出す。
import { VIEW_H, VIEW_W, drawEnding, drawTitle } from './render';

/** エンディングの絵を動かし始めて、止める関数を返す */
export const startEnding = (canvas: HTMLCanvasElement): (() => void) => animate(canvas, drawEnding, 6);

/** タイトルの絵を動かし始めて、止める関数を返す */
export const startTitle = (canvas: HTMLCanvasElement): (() => void) => animate(canvas, drawTitle, 0.4);

type Painter = (c: CanvasRenderingContext2D, width: number, t: number) => void;

/** staticT: 動きを減らす設定のときに出す、止まった絵の時刻 */
function animate(canvas: HTMLCanvasElement, paint: Painter, staticT: number): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let start = 0;

  const resize = (): void => {
    const width = Math.max(1, Math.round((canvas.clientWidth || VIEW_W) * (window.devicePixelRatio || 1)));
    canvas.width = width;
    canvas.height = Math.round((width * VIEW_H) / VIEW_W);
  };
  const draw = (t: number): void => paint(ctx, canvas.width, t);
  const observer = new ResizeObserver(() => {
    resize();
    if (reduced) draw(staticT);
  });
  observer.observe(canvas);
  resize();

  if (reduced) {
    draw(staticT);
  } else {
    const frame = (now: number): void => {
      start ||= now;
      draw((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
