import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { STAGES } from '../src/stages';
import { findPlan } from '../tests/solver';

// アプリの ID（package.json の name）。保存データのキーの接頭辞になる
const APP_ID = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string }).name;

test('最初の画面に、全 10 ステージの選択ボタンが並ぶ', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage-button')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'ステージ1 そうげん' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ステージ10 さいごのたに' })).toBeVisible();
});

test('ステージを選んで、タップでスタートし、ぶつかるとゲームオーバー → もういちどで再挑戦できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#game-hint')).toBeVisible();
  await expect(page.locator('#game-title')).toHaveText('ステージ1 そうげん');

  // 何もせず走ると、最初の障害物にぶつかる
  await page.locator('.game-canvas').tap();
  await expect(page.locator('#game-hint')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await expect(page.locator('#game-status')).toHaveText('ゲームオーバー');

  // もういちど: すぐに同じステージを走り出す(進み具合が 0 に戻って、また進む)
  await page.getByRole('button', { name: 'もういちど' }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
});

test('ジャンプすると効果音が鳴る', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __sounds: number[] }).__sounds = [];
    document.addEventListener('app:sound', (e) => (window as unknown as { __sounds: number[] }).__sounds.push((e as CustomEvent).detail.frequency));
  });
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await page.locator('.game-canvas').tap();
  await page.locator('.pad').tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds)).toContain(520);
});

test('ステージ 1 をクリアすると、クリア画面が出て、つぎのステージへ進める', async ({ page }) => {
  // 偽の時計で 1 フレームずつ進め、ソルバーが見つけた押し方どおりにジャンプする(実時間のばらつきで失敗しない)
  const plan = findPlan(STAGES[0], 15);
  expect(plan).not.toBeNull();
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  // 時計を止める(止めないと、実時間でも進んでしまう)。ここからは runFor で進めた分だけ時間が進む
  await page.clock.pauseAt(10_000);
  await page.locator('.game-canvas').tap();
  const FRAME_MS = 1000 / 60;
  // ゲーム画面の下のほう(ジャンプの操作エリア)に指をおく
  await page.mouse.move(200, 600);
  for (let f = 0; f < 3000; f++) {
    if (await page.locator('#game-overlay').isVisible()) break;
    for (const m of plan ?? []) {
      if (m.frame === f) await page.mouse.down();
      if (m.frame + m.hold === f) await page.mouse.up();
    }
    // 整数のミリ秒で進める(1 フレームごとに丸めると、少しずつ遅れてずれていく)
    await page.clock.runFor(Math.round((f + 1) * FRAME_MS) - Math.round(f * FRAME_MS));
  }
  await expect(page.locator('#overlay-title')).toHaveText('ステージクリア!');
  await expect(page.locator('#game-status')).toHaveText('ステージクリア');
  await page.getByRole('button', { name: 'つぎのステージ' }).click();
  await expect(page.locator('#game-title')).toHaveText('ステージ2 さばく');
  await expect(page.locator('#game-overlay')).toBeHidden();
});

test('ステージ選択にもどれる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ステージ3 ゆうやけ' }).click();
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
  await expect(page.locator('.stage-button')).toHaveCount(10);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#boot-error')).toBeHidden();
  // このアプリのキャッシュだけが作り直され、ほかのアプリのキャッシュは残っている
  expect(await page.evaluate(() => caches.has('other-app-v1'))).toBe(true);
});
