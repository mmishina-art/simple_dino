// 全ステージクリアのエンディング画面の動き。動きを減らす設定のときは、止まった絵だけ出す。
import { VIEW_H, VIEW_W, drawEnding } from './render';

/** 動き始めて、止める関数を返す */
export function startEnding(canvas: HTMLCanvasElement): () => void {
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
  const draw = (t: number): void => drawEnding(ctx, canvas.width, t);
  const observer = new ResizeObserver(() => {
    resize();
    if (reduced) draw(6);
  });
  observer.observe(canvas);
  resize();

  if (reduced) {
    draw(6);
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
