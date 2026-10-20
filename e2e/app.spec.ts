import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STAGES } from '../src/stages';
import { createEndless } from '../src/endless';
import type { StageDef } from '../src/logic';
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

  // 「ステージ選択」は、「もういちど」から離して、下に置く(連続で遊ぶとき、押し間違えない)
  const retry = (await page.getByRole('button', { name: 'もういちど' }).boundingBox())!;
  const away = (await page.getByRole('button', { name: 'ステージ選択', exact: true }).boundingBox())!;
  expect(away.y - (retry.y + retry.height)).toBeGreaterThanOrEqual(20);

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
  // ステージを開いている間(走り出すまで)は、曲を鳴らさない
  await page.waitForTimeout(300);
  expect(await songs()).toEqual(['title']);
  // 走り出すと、そのステージの曲が頭から始まる
  await page.locator('#game-canvas').tap();
  await expect.poll(songs).toEqual(['title', 'stage1']);
  // ぶつかると、BGM は止まる(やられた音が鳴る)。もういちどで、また頭から
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await page.getByRole('button', { name: 'もういちど' }).click();
  await expect.poll(songs).toEqual(['title', 'stage1', 'stage1']);
  // ゲーム画面の BGM ボタンでオフにする
  await page.locator('#music-button-game').click();
  await expect(page.locator('#music-button-game')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'ステージ選択にもどる' }).click();
  await page.waitForTimeout(300);
  expect((await songs()).length).toBe(3);
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
  expect(await page.evaluate((id) => localStorage.getItem(`${id}-schema`), APP_ID)).toBe('3');
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

test('エンドレス: ステージ選択から始められ、ぶつかると走った距離が出て、ハイスコアが保存される', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  await expect(page.locator('#endless-best')).toHaveText('ハイスコアなし');
  await page.getByRole('button', { name: /エンドレス/ }).click();
  await expect(page.locator('#game-title')).toHaveText('エンドレス');
  await expect(page.locator('#score')).toHaveText('0 点');
  // ゴールのあるステージ用のたまごの表示は出ない。肉のレベルの表示は、肉を取るまで出ない
  await expect(page.locator('.egg-counter')).toBeHidden();
  await expect(page.locator('#boost')).toBeHidden();
  await page.locator('#game-canvas').tap();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await expect(page.locator('#overlay-text')).toContainText(/\d+ 点/);
  await expect(page.locator('#overlay-text')).toContainText(/\d+ m 走った・肉 0個/);
  await expect(page.locator('#overlay-text')).toContainText('ハイスコア更新!');
  // もういちど: すぐに新しいコースで走り出す
  await page.getByRole('button', { name: 'もういちど' }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await expect(page.locator('#overlay-title')).toHaveText('ざんねん!', { timeout: 10_000 });
  await page.getByRole('button', { name: 'ステージ選択', exact: true }).click();
  await expect(page.locator('#endless-best')).toHaveText(/ハイスコア \d+ 点/);
  // 再読み込みしても残る。ふつうのステージを開くと、棒とたまごの表示がもどる
  await page.reload();
  await toSelect(page);
  await expect(page.locator('#endless-best')).toHaveText(/ハイスコア \d+ 点/);
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('.progress')).toBeVisible();
  await expect(page.locator('#score')).toBeHidden();
});

test('エンドレス: 専用の曲が鳴る', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __songs: string[] }).__songs = [];
    document.addEventListener('app:music', (e) => (window as unknown as { __songs: string[] }).__songs.push((e as CustomEvent).detail.song));
  });
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: /エンドレス/ }).click();
  await page.locator('#game-canvas').tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __songs: string[] }).__songs)).toContain('endless');
});

test('エンドレス: ソルバーの押し方で、最初の肉の手前まで走りつづけると、スコアが増える', async ({ page }) => {
  test.setTimeout(120_000);
  // コースの種を固定する(乱数を 0.5 に固定すると、種は 2^30)
  await page.addInitScript(() => { Math.random = () => 0.5; });
  const seed = Math.floor(0.5 * 2 ** 31);
  const course = createEndless(seed);
  course.extend?.(9000);
  const obstacles = course.obstacles.filter((o) => o.x < 8000);
  const last = obstacles[obstacles.length - 1];
  const fixed: StageDef = { ...course, obstacles, length: last.x + last.w + 1000, extend: undefined };
  const plan = findPlan(fixed, 4);
  expect(plan).not.toBeNull();

  await page.clock.install({ time: 0 });
  await page.goto('/');
  await toSelect(page);
  await page.getByRole('button', { name: /エンドレス/ }).click();
  await page.clock.pauseAt(10_000);
  await page.locator('#game-canvas').tap();
  await page.mouse.move(200, 600);
  const FRAME_MS = 1000 / 60;
  // 最初の肉(x=2702px)の手前まで走る。肉を取ると速さが変わって、肉なしで作った押し方がずれるので、そこまで
  // (肉で速くなっても越えられることは、tests/endless.test.ts が、ソルバーで確かめている)
  for (let f = 0; f < 700; f++) {
    if (await page.locator('#game-overlay').isVisible()) break;
    for (const m of plan ?? []) {
      if (m.frame === f) await page.mouse.down();
      if (m.frame + m.hold === f) await page.mouse.up();
    }
    await page.clock.runFor(Math.round((f + 1) * FRAME_MS) - Math.round(f * FRAME_MS));
  }
  await expect(page.locator('#game-overlay')).toBeHidden();
  const points = Number((await page.locator('#score').textContent())?.replace(' 点', ''));
  expect(points).toBeGreaterThan(200);
});

test('エンドレス: 肉を取ると、レベルと倍率が出て、スコアのふえ方が大きくなり、効き目の棒がへっていく', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { Math.random = () => 0.5; });
  const seed = Math.floor(0.5 * 2 ** 31);
  const course = createEndless(seed);
  course.extend?.(9000);
  const meat = course.meats![0];
  // 最初の肉を、かならず取る(たまごとして扱う)経路を、ソルバーで探す
  const obstacles = course.obstacles.filter((o) => o.x < meat.x + 1500);
  const last = obstacles[obstacles.length - 1];
  const fixed: StageDef = { ...course, obstacles, length: last.x + last.w + 1000, eggs: [{ x: meat.x, y: meat.y }], extend: undefined };
  const plan = findPlan(fixed, 4, 2);
  expect(plan).not.toBeNull();

  // 肉でテンポが変わる BGM を含めて、ページにエラーが出ないこと
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __sounds: number[] }).__sounds = [];
    document.addEventListener('app:sound', (e) => (window as unknown as { __sounds: number[] }).__sounds.push((e as CustomEvent).detail.frequency));
  });
  await toSelect(page);
  await page.getByRole('button', { name: /エンドレス/ }).click();
  await page.clock.pauseAt(10_000);
  await page.locator('#game-canvas').tap();
  await page.mouse.move(200, 600);
  const FRAME_MS = 1000 / 60;
  let f = 0;
  for (; f < 2500; f++) {
    if (await page.locator('#boost').isVisible()) break;
    for (const m of plan ?? []) {
      if (m.frame === f) await page.mouse.down();
      if (m.frame + m.hold === f) await page.mouse.up();
    }
    await page.clock.runFor(Math.round((f + 1) * FRAME_MS) - Math.round(f * FRAME_MS));
  }
  await expect(page.locator('#game-overlay')).toBeHidden();
  await expect(page.locator('#boost')).toHaveText('🍖1 ×1.5');
  await expect(page.locator('#screen-game')).toHaveClass(/boosted/);
  // 取ったときの効果音(392Hz から始まる上がる音)が鳴っている
  expect(await page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds)).toContain(392);
  // 効き目の棒は、ほぼ満タンから、へっていく
  const width = async () => Number((await page.locator('#progress-bar').evaluate((e) => (e as HTMLElement).style.width)).replace('%', ''));
  const full = await width();
  expect(full).toBeGreaterThan(80);
  for (let i = 0; i < 120; i++) {
    for (const m of plan ?? []) {
      if (m.frame === f + i) await page.mouse.down();
      if (m.frame + m.hold === f + i) await page.mouse.up();
    }
    await page.clock.runFor(Math.round((f + i + 1) * FRAME_MS) - Math.round((f + i) * FRAME_MS));
  }
  expect(await width()).toBeLessThan(full);
  expect(errors).toEqual([]);
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

test('ちびダイノ: 全クリア前は鍵つき。全クリアすると選べて、記録はキャラごとに別で、エンドレスは出ない', async ({ page }) => {
  await page.goto('/');
  await toSelect(page);
  const chibi = page.getByRole('button', { name: /ちびダイノ/ });
  // 全クリアするまでは、ちびダイノも、キャラ選択も、見せない
  await expect(chibi).toHaveCount(0);
  await expect(page.locator('#character-picker')).toBeHidden();
  await expect(page.locator('#endless-open')).toBeVisible();

  // ダイノで全ステージクリアした記録にして、読み込み直す
  await page.evaluate((id) => {
    localStorage.setItem(`${id}-progress`, JSON.stringify({ cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], attempts: {}, firstClearTries: {}, endingSeen: true }));
  }, APP_ID);
  await page.reload();
  await toSelect(page);
  await expect(page.locator('#character-picker')).toBeVisible();
  await expect(page.getByRole('button', { name: /^ダイノ/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(chibi).toBeEnabled();
  await chibi.click();
  await expect(chibi).toHaveAttribute('aria-pressed', 'true');
  // ちびの記録は別: まだステージ 1 しか遊べない。エンドレスと、エンディングは出ない
  await expect(page.locator('#progress-summary')).toContainText('クリア 0/10');
  await expect(page.getByRole('button', { name: 'ステージ2 さばく' })).toBeDisabled();
  await expect(page.locator('#endless-open')).toBeHidden();

  // ちびで遊ぶ: 絵と速さが変わる(タイトルに「・ちび」)。選んだキャラは、読み込み直しても残る
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  await expect(page.locator('#game-title')).toHaveText('ステージ1 そうげん🐣');
  await page.reload();
  await toSelect(page);
  await expect(page.getByRole('button', { name: /ちびダイノ/ })).toHaveAttribute('aria-pressed', 'true');
  const saved = await page.evaluate((id) => localStorage.getItem(`${id}-character`), APP_ID);
  expect(saved).toBe('"chibi"');
});

test('デバッグモード(隠しコマンド): バージョンを 7 回タップで、ちびダイノと全ステージを選べる。もう一度でもどる。バックアップには入らない', async ({ page }) => {
  await page.goto('/');
  const tapVersion = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) await page.locator('.version').click();
  };
  // 6 回では、何も起きない
  await tapVersion(6);
  await toSelect(page);
  await expect(page.locator('#debug-note')).toBeHidden();
  await expect(page.getByRole('button', { name: 'ステージ10 ラスト' })).toBeDisabled();
  await page.getByRole('button', { name: 'タイトルにもどる' }).click();

  // 7 回でオン
  await tapVersion(7);
  await expect(page.locator('#title-summary')).toHaveText('デバッグモード: オン');
  await toSelect(page);
  await expect(page.locator('#debug-note')).toBeVisible();
  await expect(page.getByRole('button', { name: /ちびダイノ/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'ステージ10 ラスト' })).toBeEnabled();
  await page.getByRole('button', { name: /ちびダイノ/ }).click();
  await page.getByRole('button', { name: 'ステージ10 ラスト' }).click();
  await expect(page.locator('#game-title')).toHaveText('ステージ10 ラスト🐣');

  // 読み込み直しても、オンのまま。バックアップには入らない
  await page.reload();
  await toSelect(page);
  await expect(page.locator('#debug-note')).toBeVisible();
  await page.getByRole('button', { name: 'タイトルにもどる' }).click();
  await page.getByText('記録のバックアップ').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ファイルに書き出す' }).click()]);
  const { readFileSync } = await import('node:fs');
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8')) as { data: Record<string, string> };
  expect(Object.keys(exported.data)).not.toContain(`${APP_ID}-debug`);

  // もう 7 回でオフ: 鍵つきにもどり、キャラもダイノにもどる
  await tapVersion(7);
  await expect(page.locator('#title-summary')).toHaveText('デバッグモード: オフ');
  await toSelect(page);
  await expect(page.locator('#debug-note')).toBeHidden();
  await expect(page.locator('#character-picker')).toBeHidden();
  await expect(page.getByRole('button', { name: 'ステージ10 ラスト' })).toBeDisabled();
});

test('新版の確認: アプリに戻ったとき・「新しい版を確認する」で、Service Worker に確認させる(間隔をおく)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __updates: number };
    w.__updates = 0;
    const update = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function (this: ServiceWorkerRegistration) {
      w.__updates += 1;
      return update.call(this);
    };
  });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const count = (): Promise<number> => page.evaluate(() => (window as unknown as { __updates: number }).__updates);
  // 登録がすんだあと、アプリに戻ってきたら、確認する。すぐにまた戻っても、見送る(通信しすぎない)
  await expect.poll(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    return count();
  }).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(await count()).toBe(1);

  // ボタンは、間隔をおかずに確認して、結果を知らせる
  await page.getByRole('button', { name: '新しい版を確認する' }).click();
  await expect(page.locator('#update-message')).toHaveText('これが最新の版です');
  expect(await count()).toBe(2);
  // 新版はないので、「更新」の案内は出ない
  await expect(page.locator('#update-banner')).toBeHidden();
});

test.describe('描くループ', () => {
  // やられた演出の粒(動きを減らす設定では出ない)が残っているあいだだけ起きるので、動きを減らさない
  test.use({ reducedMotion: 'no-preference' });

  test('「もういちど」を早く何度も押しても、描くループは 1 つのまま(1 秒に画面の更新の回数だけ)', async ({ page }) => {
    await page.addInitScript((id) => {
      localStorage.setItem(`${id}-music`, 'false');
      localStorage.setItem(`${id}-progress`, JSON.stringify({ cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9], attempts: {}, firstClearTries: {}, endingSeen: false }));
      const w = window as unknown as { __callbacks: number };
      w.__callbacks = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => {
        w.__callbacks += 1;
        cb(t);
      });
    }, APP_ID);
    await page.goto('/');
    await toSelect(page);
    await page.getByRole('button', { name: 'ステージ10 ラスト' }).click();
    await page.locator('#game-canvas').tap();
    const perSecond = async (): Promise<number> => {
      await page.evaluate(() => { (window as unknown as { __callbacks: number }).__callbacks = 0; });
      await page.waitForTimeout(1000);
      return page.evaluate(() => (window as unknown as { __callbacks: number }).__callbacks);
    };
    const before = await perSecond();
    // 結果が出た瞬間に「もういちど」を押す(やられた演出のループが残っているうちに)。これを 3 回くりかえす
    for (let i = 0; i < 3; i++) {
      await page.locator('#overlay-title').waitFor({ state: 'visible', timeout: 15_000 });
      await page.evaluate(() => {
        [...document.querySelectorAll<HTMLButtonElement>('.overlay-buttons button')].find((b) => b.textContent === 'もういちど')?.click();
      });
    }
    const after = await perSecond();
    // ループが増えると、押すたびに 1 秒の回数が 1 つぶんずつ増える(60 → 120 → 180 → 240)
    expect(after).toBeLessThan(before * 1.5);
  });
});

test('ダブルタップでの拡大を防ぐ: 0.35 秒以内の 2 回目のタップ(touchend)は止める。ボタンは止めない', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const fire = (el: Element): boolean => {
      const e = new Event('touchend', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const text = document.querySelector('.title-lead') as Element;
    const button = document.getElementById('play-button') as Element;
    const first = fire(text);
    const second = fire(text); // すぐ続けた 2 回目: 止める
    const onButton = fire(button); // ボタンは、すぐ続けても止めない
    return { first, second, onButton };
  });
  expect(result).toEqual({ first: false, second: true, onButton: false });
  // ゲーム画面には、この止める処理を付けない(touch-action: none で拡大されない。タッチのたびに待たせない)
  await page.getByRole('button', { name: 'あそぶ' }).click();
  await page.getByRole('button', { name: 'ステージ1 そうげん' }).click();
  const inGame = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as Element;
    const fire = (): boolean => {
      const e = new Event('touchend', { bubbles: true, cancelable: true });
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return { first: fire(), second: fire(), touchAction: getComputedStyle(document.getElementById('screen-game') as Element).touchAction };
  });
  expect(inGame).toEqual({ first: false, second: false, touchAction: 'none' });
  // CSS でも、すべての要素で、ダブルタップ拡大だけを防いでいる
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.title-lead') as Element).touchAction)).toBe('manipulation');
});

test('タップ計測テストのページ: 開けて、タップすると入力の数字が出る', async ({ page }) => {
  await page.goto('/tap-test.html');
  await expect(page.locator('#out')).toContainText('FPS', { timeout: 10_000 });
  await page.locator('#pad').tap();
  await expect(page.locator('#out')).toContainText('届くまで 平均');
  await page.locator('#method').click();
  await expect(page.locator('#method')).toHaveText('入力: touchstart');
  // 設定を切り替えても、Canvas が作り直されて、また動く
  await page.locator('#canvasmode').click();
  await page.locator('#touchaction').click();
  await page.locator('#target').click();
  await page.locator('#prevent').click();
  await expect(page.locator('#out')).toContainText('FPS', { timeout: 10_000 });
  await expect(page.locator('#out')).toContainText('別描き');
});
