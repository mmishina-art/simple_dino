import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STAGES } from '../src/stages';
import { findPlan } from '../tests/solver';

// アプリの ID（package.json の name）。保存データのキーの接頭辞になる
const APP_ID = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string }).name;

/** タイトルから「あそぶ」でステージ選択に進む */
async function toSelect(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'あそぶ' }).click();
  await expect(page.locator('#stage-list')).toBeVisible();
}

test('最初はタイトル画面が出て、「あそぶ」でステージ選択に進み、「もどる」でタイトルにもどれる', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ダイノラン', level: 1 })).toBeVisible();
  await expect(page.locator('#stage-list')).toBeHidden();
  await expect(page.locator('#title-canvas')).toBeVisible();
  await toSelect(page);
  await expect(page.locator('#screen-title')).toBeHidden();
  await page.getByRole('button', { name: 'タイトルにもどる' }).click();
  await expect(page.locator('#screen-title')).toBeVisible();
});

test('最初の画面に、全 10 ステージの選択ボタンが並ぶ', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await expect(page.locator('.stage-button')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'ステージ1 そうげん' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ステージ10 ラスト' })).toBeVisible();
});

test('ステージを選んで、タップでスタートし、ぶつかるとゲームオーバー → もういちどで再挑戦できる', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#game-hint')).toBeVisible();
  await expect(page.locator('#game-title')).toHaveText('ステージ1 そうげん');

  // 何もせず走ると、最初の障害物にぶつかる
  await page.locator('#game-canvas').tap();
  await expect(page.locator('#game-hint')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await expect(page.locator('#game-status')).toContainText('ゲームオーバー');
  // 失敗したときに、どこまで進んだかと、ベストが出る(はじめては、ベスト更新)
  await expect(page.locator('#overlay-text')).toContainText(/\d+% まで進んだ/);
  await expect(page.locator('#overlay-text')).toContainText('ベスト更新!');
  await expect(page.locator('#overlay-text')).toContainText('たまご 0/3');
  await expect(page.locator('#best-marker')).toBeVisible();

  // もういちど: すぐに同じステージを走り出す(進み具合が 0 に戻って、また進む)
  await page.getByRole('button', { name: 'もういちど' }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
});

test('ジャンプすると効果音が鳴る', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await page.evaluate(() => {
    (window as unknown as { __sounds: number[] }).__sounds = [];
    document.addEventListener('app:sound', (e) => (window as unknown as { __sounds: number[] }).__sounds.push((e as CustomEvent).detail.frequency));
  });
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await page.locator('#game-canvas').tap();
  await page.locator('.pad').tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds)).toContain(520);
});

/** 偽の時計で 1 フレームずつ進め、ソルバーが見つけた押し方どおりにジャンプして、結果の画面が出るまで進める */
async function playWithPlan(page: Page, stageIndex: number, margin: number): Promise<void> {
  // たまごを全部取る経路(取る範囲を 2px せまくしても取れる)で、1 回でたまご全部 = ★3 になる
  const plan = findPlan(STAGES[stageIndex], margin, 2);
  expect(plan).not.toBeNull();
  // 時計を止める(止めないと、実時間でも進んでしまう)。ここからは runFor で進めた分だけ時間が進む
  await page.clock.pauseAt(10_000);
  await page.locator('#game-canvas').tap();
  const FRAME_MS = 1000 / 60;
  // ゲーム画面の下のほう(ジャンプの操作エリア)に指をおく
  await page.mouse.move(200, 600);
  const done = page.locator('#game-overlay, #screen-ending:not([hidden])');
  for (let f = 0; f < 3000; f++) {
    if (await done.first().isVisible()) break;
    for (const m of plan ?? []) {
      if (m.frame === f) await page.mouse.down();
      if (m.frame + m.hold === f) await page.mouse.up();
    }
    // 整数のミリ秒で進める(1 フレームごとに丸めると、少しずつ遅れてずれていく)
    await page.clock.runFor(Math.round((f + 1) * FRAME_MS) - Math.round(f * FRAME_MS));
  }
}

test('最初はステージ 1 だけ遊べて、ほかはロックされている', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await expect(page.locator('#progress-summary')).toContainText('クリア 0/10');
  await expect(page.getByRole('button', { name: 'ステージ1 そうげん' })).toBeEnabled();
  const locked = page.getByRole('button', { name: /ステージ2 さばく.*ロック中/ });
  await expect(locked).toBeDisabled();
  await expect(page.locator('.stage-button:disabled')).toHaveCount(9);
});

test('ステージ 1 をクリアすると、クリア画面が出て、つぎのステージが解放され、記録が残る', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await playWithPlan(page, 0, 15);
  await expect(page.locator('#overlay-title')).toHaveText('ステージクリア!');
  await expect(page.locator('#overlay-text')).toContainText('1回目の挑戦でクリア');
  await expect(page.locator('#overlay-text')).toContainText('★★★');
  await expect(page.locator('#overlay-text')).toContainText('たまご 3/3');
  await expect(page.locator('#game-status')).toContainText('ステージクリア。ほし3つ');
  await page.getByRole('button', { name: 'つぎのステージ' }).click();
  await expect(page.locator('#game-title')).toHaveText('ステージ2 さばく');
  await expect(page.locator('#game-overlay')).toBeHidden();

  // もどると、ステージ 2 が解放されている。再読み込みしても残る
  await page.getByRole('button', { name: 'ステージ選択にもどる' }).click();
  await expect(page.locator('#progress-summary')).toContainText('クリア 1/10');
  await page.clock.resume();
  await page.reload();
  await toSelect(page);
  await expect(page.locator('#progress-summary')).toContainText('クリア 1/10');
  await expect(page.getByRole('button', { name: /ステージ1 そうげん\(クリア済み、ほし3つ\)/ })).toBeEnabled();
  await expect(page.locator('.stage-button').first()).toContainText('★★★');
  await expect(page.getByRole('button', { name: 'ステージ2 さばく' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /ステージ3 ゆうやけ.*ロック中/ })).toBeDisabled();
});

test('最終ステージをクリアすると、エンディングが出る(もういちど見ることもできる)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((id) => {
    if (!localStorage.getItem(`${id}-progress`)) {
      localStorage.setItem(`${id}-progress`, JSON.stringify({ cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9], attempts: {}, firstClearTries: {}, endingSeen: false }));
    }
  }, APP_ID);
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await toSelect(page);
  await expect(page.locator('#progress-summary')).toContainText('クリア 9/10');
  await page.getByRole('button', { name: 'ステージ10 ラスト' }).click();
  await playWithPlan(page, 9, 8);
  await expect(page.locator('#screen-ending')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ぜんぶクリア! おめでとう!' })).toBeVisible();
  await expect(page.locator('#ending-stats')).toContainText('1 回、挑戦しました');

  await page.getByRole('button', { name: 'ステージ選択へ' }).click();
  await expect(page.locator('#progress-summary')).toContainText('★ ぜんぶクリア! (10/10)');
  await page.clock.resume();
  await page.reload();
  await expect(page.locator('#title-summary')).toHaveText('つづき: ★ ぜんぶクリア!');
  await toSelect(page);
  await expect(page.locator('#progress-summary')).toContainText('★ ぜんぶクリア! (10/10)');
  await page.getByRole('button', { name: /エンディングをもういちど見る/ }).click();
  await expect(page.locator('#screen-ending')).toBeVisible();
});

test('進み具合は、バックアップの書き出し・読み込みで戻せる', async ({ page }) => {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(`${id}-progress`, JSON.stringify({ cleared: [1, 2], attempts: { '1': 3 }, firstClearTries: { '1': 3 }, endingSeen: false }));
    }
  }, APP_ID);
  await page.goto('/');
  await expect(page.locator('#title-summary')).toHaveText('つづき: クリア 2/10');
  await page.getByText('記録のバックアップ').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ファイルに書き出す' }).click()]);
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(await download.path(), 'utf8');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#title-summary')).toHaveText('');
  await page.getByText('記録のバックアップ').click();
  await page.locator('#backup-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#title-summary')).toHaveText('つづき: クリア 2/10');
  await toSelect(page);
  await expect(page.getByRole('button', { name: 'ステージ3 ゆうやけ' })).toBeEnabled();
});

test('壊れた進み具合の記録が入っていても、起動してステージ 1 から遊べる', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem(`${id}-progress`, '{"cleared":[1,99,"x"],"attempts":5'), APP_ID);
  await page.goto('/');
  await toSelect(page);
  await expect(page.locator('#progress-summary')).toContainText('クリア 0/10');
  await expect(page.getByRole('button', { name: 'ステージ1 そうげん' })).toBeEnabled();
});

test('BGM: タイトルの曲が鳴り、ステージを開くとそのステージの曲に変わる。BGM をオフにすると鳴らない', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __songs: string[] }).__songs = [];
    document.addEventListener('app:music', (e) => (window as unknown as { __songs: string[] }).__songs.push((e as CustomEvent).detail.song));
  });
  await page.goto('/');
  const songs = () => page.evaluate(() => (window as unknown as { __songs: string[] }).__songs);
  // 利用者が操作するまで、BGM は始まらない
  expect(await songs()).toEqual([]);
  await toSelect(page);
  await expect.poll(songs).toEqual(['title']);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect.poll(songs).toEqual(['title', 'stage1']);
  // 走り出すと、曲が頭から始まる
  await page.locator('#game-canvas').tap();
  await expect.poll(songs).toEqual(['title', 'stage1', 'stage1']);
  // ぶつかると、BGM は止まる(やられた音が鳴る)。もういちどで、また頭から
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await page.getByRole('button', { name: 'もういちど' }).click();
  await expect.poll(songs).toEqual(['title', 'stage1', 'stage1', 'stage1']);
  // ゲーム画面の BGM ボタンでオフにする
  await page.locator('#music-button-game').click();
  await expect(page.locator('#music-button-game')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'ステージ選択にもどる' }).click();
  await page.waitForTimeout(300);
  expect((await songs()).length).toBe(4);
});

test('BGM のオン/オフは、タイトルで切り替えられ、再読み込みしても残る', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('#music-button');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#music-button')).toHaveAttribute('aria-pressed', 'false');
});

test('たまごの数が画面に出る。ステージごとにベストの進み具合も覚えていて、再読み込みしても残る', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#egg-count')).toHaveText('0/3');
  await expect(page.locator('#game-best')).toHaveText('');
  await page.locator('#game-canvas').tap();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await page.reload();
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#game-best')).toHaveText(/ベスト \d+%/);
  await expect(page.locator('#best-marker')).toBeVisible();
});

test('版 1 の古い進み具合(たまごや★の項目がない)も読み込めて、そのまま遊べる', async ({ page }) => {
  await page.addInitScript((id) => {
    if (!localStorage.getItem(`${id}-progress`)) {
      localStorage.setItem(`${id}-schema`, '1');
      localStorage.setItem(`${id}-progress`, JSON.stringify({ cleared: [1, 2], attempts: { '1': 3 }, firstClearTries: { '1': 3 }, endingSeen: false }));
    }
  }, APP_ID);
  await page.goto('/');
  await toSelect(page);
  // クリア済みは ★1 として数える
  await expect(page.locator('#progress-summary')).toContainText('クリア 2/10 ・ ★ 2/30');
  await expect(page.getByRole('button', { name: /ステージ2 さばく\(クリア済み、ほし1つ\)/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'ステージ3 ゆうやけ' })).toBeEnabled();
  // 版番号が新しくなっている
  expect(await page.evaluate((id) => localStorage.getItem(`${id}-schema`), APP_ID)).toBe('2');
});

test('演出: たまごを取ると効果音が鳴る', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __sounds: number[] }).__sounds = [];
    document.addEventListener('app:sound', (e) => (window as unknown as { __sounds: number[] }).__sounds.push((e as CustomEvent).detail.frequency));
  });
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await playWithPlan(page, 0, 15);
  // たまごを取ったときの高めの音(784)が鳴っている
  expect(await page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds)).toContain(784);
  await expect(page.locator('#egg-count')).toHaveText('3/3');
});

test('ステージ選択にもどれる', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#screen-game')).toBeVisible();
  await page.getByRole('button', { name: 'ステージ選択にもどる' }).click();
  await expect(page.locator('#screen-game')).toBeHidden();
  await expect(page.locator('.stage-button')).toHaveCount(10);
});

test('音のオン/オフを切り替えられる', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('#sound-button');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('manifest と Service Worker が使える', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(registered).toBe(true);
});

test('更新バナーは通常は隠れている', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#update-banner')).toBeHidden();
});

test('最初の画面からインストール方法を開ける（使っている端末の説明が開いている）', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /インストールする方法/ }).click();
  const dialog = page.locator('#install-dialog');
  await expect(dialog).toBeVisible();
  // Pixel 7 のプロファイルなので Android の説明が開いている
  await expect(dialog.locator('details[data-platform="android"]')).toHaveJSProperty('open', true);
  await expect(dialog.locator('details[data-platform="ios"]')).toHaveJSProperty('open', false);
  await expect(dialog.getByText('ホーム画面に追加', { exact: false }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'とじる' }).click();
  await expect(dialog).toBeHidden();
});

test('最初の画面にバージョンが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#version')).toHaveText(/^\d+\.\d+\.\d+$/);
});

test('記録をファイルに書き出し、消えたあとに読み込んで戻せる', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sound-button').click();
  await page.getByText('記録のバックアップ').click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ファイルに書き出す' }).click()]);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(path, 'utf8');
  expect(JSON.parse(text).data[`${APP_ID}-sound`]).toBe('false');

  // 記録を消す → 読み込んで戻す
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('記録のバックアップ').click();
  await page.locator('#backup-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#backup-message')).toContainText('読み込みました');
});

test('おかしいバックアップファイルは、理由を表示して読み込まない', async ({ page }) => {
  await page.goto('/');
  await page.getByText('記録のバックアップ').click();
  await page.locator('#backup-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.locator('#backup-message')).toContainText('このアプリのバックアップではありません');
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
});

test('起動できないときは「なおす」ボタンが出て、押すと起動できる（記録と、ほかのアプリのキャッシュは消えない）', async ({ page }) => {
  await page.addInitScript((id) => {
    (window as unknown as { __bootWaitMs: number }).__bootWaitMs = 500;
    // 1回目の自動修復は済んだことにして、ボタンが出る側の動きを確かめる
    sessionStorage.setItem(`${id}:repaired-at`, String(Date.now()));
    if (!localStorage.getItem(`${id}-sound`)) localStorage.setItem(`${id}-sound`, 'false');
  }, APP_ID);
  // 同じサイトにある、ほかのアプリのキャッシュ（なおすときに消えてはいけない）を用意する
  await page.goto('/');
  await page.evaluate(async () => { await caches.open('other-app-v1'); });
  // メインのスクリプトが読み込めない状況を作る
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#boot-error')).toBeVisible();

  await page.unroute('**/assets/*.js');
  await page.getByRole('button', { name: 'なおす' }).click();
  await expect(page.getByRole('button', { name: 'あそぶ' })).toBeVisible();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#boot-error')).toBeHidden();
  // このアプリのキャッシュだけが作り直され、ほかのアプリのキャッシュは残っている
  expect(await page.evaluate(() => caches.has('other-app-v1'))).toBe(true);
});
