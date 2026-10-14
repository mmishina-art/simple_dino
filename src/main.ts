import './style.css';
import { startEnding, startTitle } from './ending';
import { Player } from './play';
import {
  allCleared, bestOf, isCleared, isUnlocked, markEndingSeen, recordAttempt, recordClear, recordDeath, sanitizeProgress, starsOf, totalAttempts, totalStars, type Progress,
} from './progress';
import { STAGES } from './stages';
import { setupInstallGuide } from './install';
import { setupUpdateBanner } from './pwa';
import { isMusicOn, setMusicOn, setScene, syncMusic, unlockMusic } from './music';
import { isSoundOn, setSound, sfx, syncSound } from './sound';
import { stageSongId } from './songs';
import { exportBackup, importBackup, load, migrateStorage, requestPersist, save } from './storage';
import type { StageDef } from './logic';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

migrateStorage();

const title = $('screen-title');
const select = $('screen-select');
const ending = $('screen-ending');
const game = $('screen-game');
const canvas = $<HTMLCanvasElement>('game-canvas');
const hint = $('game-hint');
const overlay = $('game-overlay');
const pad = $('game-pad');

function renderToggles(): void {
  const sound = $('sound-button');
  sound.textContent = isSoundOn() ? '🔊' : '🔇';
  sound.setAttribute('aria-pressed', String(isSoundOn()));
  // BGM のボタン(タイトルとゲーム中の 2 か所)
  for (const id of ['music-button', 'music-button-game']) {
    const el = $(id);
    el.textContent = isMusicOn() ? '🎵' : '🔕';
    el.setAttribute('aria-pressed', String(isMusicOn()));
  }
}

// ---- 進み具合の保存 ----

const loadProgress = (): Progress => sanitizeProgress(load<unknown>('progress', null), STAGES.length);
let progress = loadProgress();

function updateProgress(next: Progress): void {
  progress = next;
  save('progress', progress);
}

// ---- ステージ選択 ----

/** ★の数を「★★☆」の形にする(色だけでなく形でも、数が分かるように) */
const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

function renderStageList(): void {
  const list = $('stage-list');
  list.replaceChildren();
  for (const stage of STAGES) {
    const unlocked = isUnlocked(progress, stage.id);
    const cleared = isCleared(progress, stage.id);
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stage-button';
    button.disabled = !unlocked;
    // 色だけでなく、記号と読み上げでも状態を伝える
    const stars = starsOf(progress, stage.id, stage.eggs.length);
    const state = cleared ? `クリア済み、ほし${stars}つ` : unlocked ? '' : `ロック中。ステージ${stage.id - 1}をクリアすると遊べます`;
    button.setAttribute('aria-label', `ステージ${stage.id} ${stage.name}${state ? `(${state})` : ''}`);
    const num = document.createElement('span');
    num.className = 'stage-num';
    num.textContent = String(stage.id);
    const name = document.createElement('span');
    name.className = 'stage-name';
    name.textContent = stage.name;
    const mark = document.createElement('span');
    mark.className = 'stage-state';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = cleared ? starText(stars) : unlocked ? '☆☆☆' : '🔒';
    button.append(num, name, mark);
    button.addEventListener('click', () => openStage(stage));
    li.append(button);
    list.append(li);
  }
  const done = allCleared(progress, STAGES.length);
  const stars = `★ ${totalStars(progress, STAGES.map((s) => s.eggs.length))}/${STAGES.length * 3}`;
  $('progress-summary').textContent = done ? `★ ぜんぶクリア! (${STAGES.length}/${STAGES.length}) ・ ${stars}` : `クリア ${progress.cleared.length}/${STAGES.length} ・ ${stars}`;
  $('ending-open').hidden = !done;
  $('title-summary').textContent = progress.cleared.length > 0 ? `つづき: ${done ? '★ ぜんぶクリア!' : `クリア ${progress.cleared.length}/${STAGES.length}`}` : '';
}

// ---- 画面の切り替え ----

let stopTitle: (() => void) | undefined;

/** 表示する画面を 1 つ選ぶ */
function show(screen: HTMLElement): void {
  for (const el of [title, select, ending, game]) el.hidden = el !== screen;
  stopTitle?.();
  stopTitle = screen === title ? startTitle($<HTMLCanvasElement>('title-canvas')) : undefined;
  if (screen === title || screen === select) setScene('title');
}

// ---- ゲーム画面 ----

const status = $('game-status');
let current: StageDef = STAGES[0];

const player = new Player(
  canvas,
  {
    onJump: () => sfx('jump'),
    onLand: () => undefined,
    onEgg: (count, total) => {
      if (count > 0) sfx('egg');
      $('egg-count').textContent = `${count}/${total}`;
    },
    onNearMiss: () => sfx('near'),
    onDead: ({ percent, eggs }) => {
      setScene(null);
      sfx('dead');
      const { progress: next, newBest } = recordDeath(progress, current.id, percent);
      updateProgress(next);
      renderBest();
      const best = bestOf(progress, current.id);
      const line = newBest ? 'ベスト更新!' : `ベスト ${best}%`;
      status.textContent = `ゲームオーバー。${percent}パーセントまで進みました。${line}`;
      showOverlay('ざんねん!', `${percent}% まで進んだ\n${line}\nたまご ${eggs}/${current.eggs.length}`, [
        { label: 'もういちど', primary: true, run: () => restart() },
        { label: 'ステージ選択', run: () => closeStage() },
      ]);
    },
    onCleared: ({ eggs }) => {
      setScene(null);
      sfx('clear');
      const first = !isCleared(progress, current.id);
      const before = starsOf(progress, current.id, current.eggs.length);
      updateProgress(recordClear(progress, current.id, eggs, current.eggs.length));
      const stars = starsOf(progress, current.id, current.eggs.length);
      renderStageList();
      renderBest();
      const next = STAGES.find((s) => s.id === current.id + 1);
      const last = current.id === STAGES.length;
      status.textContent = `ステージクリア。ほし${stars}つ。たまごは${current.eggs.length}個中${eggs.length}個`;
      if (last && allCleared(progress, STAGES.length) && !progress.endingSeen) {
        updateProgress(markEndingSeen(progress));
        openEnding();
        return;
      }
      const lines = [`${starText(stars)}${stars > before && !first ? ' ★ふえた!' : ''}`];
      lines.push(first ? `${progress.firstClearTries[current.id]}回目の挑戦でクリア!` : `${current.name} をクリアした`);
      lines.push(`たまご ${eggs.length}/${current.eggs.length}`);
      if (stars === 1) lines.push('たまごを全部取ると ★2');
      else if (stars === 2) lines.push('1回で全部取ると ★3');
      if (first && next) lines.push(`ステージ${next.id}が遊べるようになった`);
      showOverlay('ステージクリア!', lines.join('\n'), [
        ...(next ? [{ label: 'つぎのステージ', primary: true, run: () => openStage(next) }] : []),
        ...(last && allCleared(progress, STAGES.length) ? [{ label: 'エンディング', primary: true, run: () => openEnding() }] : []),
        { label: 'もういちど', run: () => restart() },
        { label: 'ステージ選択', run: () => closeStage() },
      ]);
    },
    onProgress: (ratio) => $('progress-bar').style.setProperty('width', `${Math.round(ratio * 100)}%`),
  },
  current,
);

interface OverlayButton {
  label: string;
  primary?: boolean;
  run: () => void;
}

function showOverlay(title: string, text: string, buttons: readonly OverlayButton[]): void {
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  const box = $('overlay-buttons');
  box.replaceChildren();
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = b.label;
    if (b.primary) el.className = 'primary';
    el.addEventListener('click', b.run);
    box.append(el);
  }
  overlay.hidden = false;
  pad.hidden = true;
  box.querySelector('button')?.focus();
}

function hideOverlay(): void {
  overlay.hidden = true;
  pad.hidden = false;
}

function openStage(stage: StageDef): void {
  if (!isUnlocked(progress, stage.id)) return;
  current = stage;
  show(game);
  $('game-title').textContent = `ステージ${stage.id} ${stage.name}`;
  renderBest();
  hideOverlay();
  hint.hidden = false;
  status.textContent = '';
  player.load(stage);
  setScene(stageSongId(stage.id), { restart: true });
}

/** 進み具合の棒に、これまででいちばん進んだ場所の印をつけ、ベストを文字でも出す */
function renderBest(): void {
  const best = bestOf(progress, current.id);
  const marker = $('best-marker');
  marker.hidden = best <= 0 || best >= 100;
  marker.style.setProperty('left', `${best}%`);
  const stars = starsOf(progress, current.id, current.eggs.length);
  $('game-best').textContent = isCleared(progress, current.id) ? starText(stars) : best > 0 ? `ベスト ${best}%` : '';
}

/** 同じステージを、すぐにやり直す */
function restart(): void {
  hideOverlay();
  hint.hidden = true;
  status.textContent = '';
  player.load(current);
  updateProgress(recordAttempt(progress, current.id));
  setScene(stageSongId(current.id), { restart: true });
  sfx('start');
  player.begin();
}

function closeStage(): void {
  player.stop();
  hideOverlay();
  show(select);
  renderStageList();
}

let stopEnding: (() => void) | undefined;

function openEnding(): void {
  player.stop();
  hideOverlay();
  show(ending);
  setScene('ending', { restart: true, delay: 1.4 });
  $('ending-stats').textContent = `ぜんぶで ${totalAttempts(progress)} 回、挑戦しました`;
  stopEnding?.();
  stopEnding = startEnding($<HTMLCanvasElement>('ending-canvas'));
  sfx('clear');
  $('ending-close').focus();
}

function closeEnding(): void {
  stopEnding?.();
  stopEnding = undefined;
  show(select);
  renderStageList();
}

$('ending-open').addEventListener('click', openEnding);
$('ending-close').addEventListener('click', closeEnding);

// 操作: 画面のどこをタップしてもジャンプ(ボタンの上は除く)。押し続けると高く跳ぶ
function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, label') !== null;
}

function pressInput(): void {
  if (player.phase === 'ready') {
    hint.hidden = true;
    updateProgress(recordAttempt(progress, current.id));
    setScene(stageSongId(current.id), { restart: true });
    sfx('start');
    player.begin();
  } else if (player.phase === 'playing') {
    player.press();
  } else if (player.phase === 'paused') {
    hideOverlay();
    player.begin();
  }
}

game.addEventListener('pointerdown', (e) => {
  if (isControl(e.target)) return;
  e.preventDefault();
  pressInput();
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
  game.addEventListener(type, () => player.release());
}
document.addEventListener('keydown', (e) => {
  if (game.hidden || e.repeat || !['Space', 'ArrowUp', 'KeyW'].includes(e.code)) return;
  if (isControl(e.target)) return;
  e.preventDefault();
  pressInput();
});
document.addEventListener('keyup', (e) => {
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) player.release();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && player.phase === 'paused') {
    showOverlay('ポーズ中', '画面をタップするとつづきから', [{ label: 'つづける', primary: true, run: () => pressInput() }]);
  }
});
$('game-back').addEventListener('click', closeStage);

// ---- ホーム画面の設定・バックアップ・インストール案内 ----

$('sound-button').addEventListener('click', () => {
  setSound(!isSoundOn());
  renderToggles();
});
for (const id of ['music-button', 'music-button-game']) {
  $(id).addEventListener('click', () => {
    setMusicOn(!isMusicOn());
    renderToggles();
  });
}
$('play-button').addEventListener('click', () => {
  show(select);
  renderStageList();
});
$('select-back').addEventListener('click', () => show(title));

// ブラウザは、利用者が操作するまで音を出せない。最初の操作で BGM(タイトル曲)を始める
for (const type of ['click', 'touchend', 'pointerup', 'keydown'] as const) document.addEventListener(type, unlockMusic, { capture: true });

$('backup-export').addEventListener('click', () => {
  const blob = new Blob([exportBackup()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${__APP_ID__}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$<HTMLInputElement>('backup-import').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const message = $('backup-message');
  try {
    const n = importBackup(await file.text());
    syncSound();
    syncMusic();
    progress = loadProgress();
    renderToggles();
    renderStageList();
    message.textContent = `${n} 件の記録を読み込みました`;
  } catch (err) {
    message.textContent = err instanceof Error ? err.message : '読み込めませんでした';
  }
  input.value = '';
});

$('version').textContent = __APP_VERSION__;
requestPersist();
setupUpdateBanner($('update-banner'), $('update-button'));
setupInstallGuide($<HTMLButtonElement>('install-open'), $<HTMLDialogElement>('install-dialog'), $<HTMLButtonElement>('install-now'));
renderToggles();
renderStageList();
show(title);

// ここまで来たら起動成功（public/boot.js が見ている）
window.__appStarted = true;
