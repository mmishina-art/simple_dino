import './style.css';
import { Player } from './play';
import { STAGES } from './stages';
import { setupInstallGuide } from './install';
import { setupUpdateBanner } from './pwa';
import { isSoundOn, setSound, sfx, syncSound } from './sound';
import { exportBackup, importBackup, migrateStorage, requestPersist } from './storage';
import type { StageDef } from './logic';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

migrateStorage();

const home = $('screen-home');
const game = $('screen-game');
const canvas = $<HTMLCanvasElement>('game-canvas');
const hint = $('game-hint');
const overlay = $('game-overlay');
const pad = $('game-pad');

function renderSoundButton(): void {
  const sound = $('sound-button');
  sound.textContent = isSoundOn() ? '🔊' : '🔇';
  sound.setAttribute('aria-pressed', String(isSoundOn()));
}

// ---- ステージ選択 ----

function renderStageList(): void {
  const list = $('stage-list');
  list.replaceChildren();
  for (const stage of STAGES) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stage-button';
    button.setAttribute('aria-label', `ステージ${stage.id} ${stage.name}`);
    const num = document.createElement('span');
    num.className = 'stage-num';
    num.textContent = String(stage.id);
    const name = document.createElement('span');
    name.className = 'stage-name';
    name.textContent = stage.name;
    button.append(num, name);
    button.addEventListener('click', () => openStage(stage));
    li.append(button);
    list.append(li);
  }
}

// ---- ゲーム画面 ----

const status = $('game-status');
let current: StageDef = STAGES[0];

const player = new Player(
  canvas,
  {
    onJump: () => sfx('jump'),
    onLand: () => undefined,
    onDead: () => {
      sfx('dead');
      status.textContent = 'ゲームオーバー';
      showOverlay('ざんねん!', 'もういちど挑戦しよう', [
        { label: 'もういちど', primary: true, run: () => restart() },
        { label: 'ステージ選択', run: () => closeStage() },
      ]);
    },
    onCleared: () => {
      sfx('clear');
      status.textContent = 'ステージクリア';
      const next = STAGES.find((s) => s.id === current.id + 1);
      showOverlay('ステージクリア!', `${current.name} をクリアした`, [
        ...(next ? [{ label: 'つぎのステージ', primary: true, run: () => openStage(next) }] : []),
        { label: 'もういちど', primary: !next, run: () => restart() },
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
  current = stage;
  home.hidden = true;
  game.hidden = false;
  $('game-title').textContent = `ステージ${stage.id} ${stage.name}`;
  hideOverlay();
  hint.hidden = false;
  status.textContent = '';
  player.load(stage);
}

/** 同じステージを、すぐにやり直す */
function restart(): void {
  hideOverlay();
  hint.hidden = true;
  status.textContent = '';
  player.load(current);
  sfx('start');
  player.begin();
}

function closeStage(): void {
  player.stop();
  hideOverlay();
  game.hidden = true;
  home.hidden = false;
}

// 操作: 画面のどこをタップしてもジャンプ(ボタンの上は除く)。押し続けると高く跳ぶ
function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, label') !== null;
}

function pressInput(): void {
  if (player.phase === 'ready') {
    hint.hidden = true;
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
  renderSoundButton();
});

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
    renderSoundButton();
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
renderSoundButton();
renderStageList();

// ここまで来たら起動成功（public/boot.js が見ている）
window.__appStarted = true;
