// 新版の確認の間隔(DOM にも Service Worker にも触れない純関数。tests/ で単体テストする)。

/** 確認の間隔の最小(ミリ秒): アプリに戻るたびに、通信しすぎない */
export const UPDATE_CHECK_GAP_MS = 60_000;
/** 開いたままのときの、確認の間隔(ミリ秒) */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** 前回の確認(last。まだなら null)から、十分に時間がたっているか */
export const shouldCheck = (now: number, last: number | null, gap = UPDATE_CHECK_GAP_MS): boolean => last === null || now - last >= gap;
