// Service Worker の登録と「更新」ボタン。新版は待機させ、ボタンが押されたときだけ切り替える。
// 新版の確認: ブラウザは、ページを開き直したときしか自動で確認しない。ホーム画面のアプリは、閉じずに何日も開いたままに
// なりやすく、その間は新版が見つからない。そこで、アプリに戻ってきたとき・タイトル画面に来たとき・1 時間ごとに、自分で確認する。
import { registerSW } from 'virtual:pwa-register';
import { UPDATE_CHECK_INTERVAL_MS, shouldCheck } from './updatecheck';

export type UpdateResult =
  /** 確認して、新版はなかった */
  | 'latest'
  /** 新版が見つかった(「更新」ボタンが出る) */
  | 'found'
  /** 通信できなかった */
  | 'offline'
  /** まだ確認できない(Service Worker が使えない・登録前) */
  | 'unavailable'
  /** 前に確認したばかりなので、見送った */
  | 'skipped';

let registration: ServiceWorkerRegistration | undefined;
let lastCheck: number | null = null;

/** 新版があるか確認する(前の確認から間隔があいていないときは見送る) */
export async function checkForUpdate(): Promise<UpdateResult> {
  const reg = registration;
  if (!reg) return 'unavailable';
  const now = Date.now();
  if (!shouldCheck(now, lastCheck)) return 'skipped';
  lastCheck = now;
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  return reg.installing || reg.waiting ? 'found' : 'latest';
}

export function setupUpdateBanner(banner: HTMLElement, button: HTMLElement): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      banner.hidden = false;
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
  });
  button.addEventListener('click', () => {
    void updateSW(true);
  });
  // アプリに戻ってきたとき(ホーム画面のアプリは、閉じずに開いたままになりやすい)と、開いたままの間は 1 時間ごと
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate();
  });
  window.setInterval(() => {
    if (!document.hidden) void checkForUpdate();
  }, UPDATE_CHECK_INTERVAL_MS);
}
