import './style.css';
import { startEnding, startTitle } from './ending';
import { CHARACTERS, characterById, forCharacter, isCharacterUnlocked, sanitizeCharacterId, type CharacterId } from './characters';
import { createEndless } from './endless';
import { scoreMultiplier } from './logic';
import { Player } from './play';
import { formatPerf } from './perf';
import {
  allCleared, bestOf, isCleared, isUnlocked, markEndingSeen, recordAttempt, recordClear, recordDeath, recordEndless, sanitizeProgress, starsOf, totalAttempts, totalStars, type Progress,
} from './progress';
import { STAGES } from './stages';
import { setupInstallGuide } from './install';
import { checkForUpdate, setupUpdateBanner, type UpdateResult } from './pwa';
import { isMusicOn, setMusicOn, setMusicTempo, setScene, syncMusic, unlockMusic } from './music';
import { isSoundOn, setSound, sfx, syncSound } from './sound';
import { stageSongId, type SongId } from './songs';
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

/** キャラごとに、記録は別。ダイノは今までのキー(progress)のまま(キー名を変えると記録が消える) */
const progressKey = (id: CharacterId): string => (id === 'dino' ? 'progress' : `progress-${id}`);
const loadProgressOf = (id: CharacterId): Progress => sanitizeProgress(load<unknown>(progressKey(id), null), STAGES.length);

/**
 * デバッグモード(隠しコマンド): タイトル画面のバージョン表示を、すばやく 7 回タップするとオン/オフ。
 * ちびダイノと全ステージを、クリアしなくても選べる(見た目や操作感を試すため)。バックアップには入れない。
 */
let debug = load<boolean>('debug', false) === true;
const stageOpen = (p: Progress, id: number): boolean => debug || isUnlocked(p, id);

/** ちびダイノは、ダイノで全ステージをクリアすると遊べる */
const isUnlockedChar = (id: CharacterId): boolean => debug || isCharacterUnlocked(id, loadProgressOf('dino').cleared.length, STAGES.length);

let character: CharacterId = (() => {
  const saved = sanitizeCharacterId(load<unknown>('character', 'dino'));
  return isUnlockedChar(saved) ? saved : 'dino';
})();
const loadProgress = (): Progress => loadProgressOf(character);
let progress = loadProgress();

function updateProgress(next: Progress): void {
  progress = next;
  save(progressKey(character), progress);
}

function setCharacter(id: CharacterId): void {
  if (!isUnlockedChar(id)) return;
  character = id;
  save('character', id);
  progress = loadProgress();
  renderStageList();
}

function renderCharacters(): void {
  const box = $('character-picker');
  box.replaceChildren();
  // ちびダイノは、遊べるようになるまで、見せない(キャラ選択ごと隠す)
  box.hidden = !isUnlockedChar('chibi');
  if (box.hidden) return;
  for (const c of CHARACTERS) {
    const open = isUnlockedChar(c.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = !open;
    button.setAttribute('aria-pressed', String(open && c.id === character));
    button.setAttribute('aria-label', open ? `${c.name}(${c.note})` : `${c.name}。ぜんぶのステージをクリアすると遊べます`);
    const name = document.createElement('span');
    name.textContent = open ? c.name : `🔒 ${c.name}`;
    const note = document.createElement('small');
    note.className = 'muted';
    note.setAttribute('aria-hidden', 'true');
    note.textContent = open ? c.note : 'ぜんぶクリアで解放';
    button.append(name, note);
    button.addEventListener('click', () => setCharacter(c.id));
    box.append(button);
  }
}

// ---- ステージ選択 ----

/** ★の数を「★★☆」の形にする(色だけでなく形でも、数が分かるように) */
const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

function renderStageList(): void {
  renderCharacters();
  $('debug-note').hidden = !debug;
  // デバッグモードのときだけ、フレームの時間を記録して、ゲーム画面に出す
  player.perf = debug;
  perfHud.hidden = !debug;
  if (!debug && renderMode !== 0) {
    renderMode = 0;
    player.setRenderMode(null);
  }
  showPerf();
  const list = $('stage-list');
  list.replaceChildren();
  for (const stage of STAGES) {
    const unlocked = stageOpen(progress, stage.id);
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
  $('ending-open').hidden = !done || character !== 'dino';
  // エンドレスは、ダイノだけ(速さを、ステージごとに決めているため)
  $('endless-open').hidden = character !== 'dino';
  $('endless-best').textContent = progress.endlessBest > 0 ? `ハイスコア ${progress.endlessBest} 点` : 'ハイスコアなし';
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
  // タイトル画面に来たら、新版があるか確認する(前に確認したばかりなら見送る)
  if (screen === title) void checkForUpdate();
}

// ---- ゲーム画面 ----

const status = $('game-status');
const perfHud = $('perf-hud');
/** デバッグモードの切り分け: 表示の左下をタップするたびに、描き方を切り替える(自動 → 密度 2 → 密度 1 → 描かない → 更新だけ) */
const RENDER_MODES: readonly { label: string; cap: number | null; off: boolean; idle?: boolean }[] = [
  { label: '密度 自動', cap: null, off: false },
  { label: '密度 ×2', cap: 2, off: false },
  { label: '密度 ×1', cap: 1, off: false },
  { label: '描かない', cap: null, off: true },
  { label: '更新だけ(ゲームも止める)', cap: null, off: true, idle: true },
];
let renderMode = 0;
let lastPerf = '';
const showPerf = (): void => {
  perfHud.textContent = `${lastPerf || 'FPS --'} ｜ ${RENDER_MODES[renderMode].label}`;
};
const progressBar = $('progress-bar');
let barPercent = -1;
/** 進み具合の棒の幅。毎フレームは書かない(値が変わったときだけ。書くたびに、画面の組み直しが起きるため) */
function setBar(percent: number): void {
  if (percent === barPercent) return;
  barPercent = percent;
  progressBar.style.setProperty('width', `${percent}%`);
}
const score = $('score');
const boostLabel = $('boost');
let lastBoost = 0;
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
    onDead: ({ percent, eggs, meters, score: points, meats, topBoost }) => {
      setScene(null);
      sfx('dead');
      if (current.endless) {
        const { progress: next, newBest } = recordEndless(progress, points);
        updateProgress(next);
        renderBest();
        const line = newBest ? 'ハイスコア更新!' : `ハイスコア ${progress.endlessBest} 点`;
        const detail = `${meters} m 走った・肉 ${meats}個${topBoost > 0 ? `・最高 ×${scoreMultiplier(topBoost).toFixed(1)}` : ''}`;
        status.textContent = `ゲームオーバー。${points}点。${detail}。${line}`;
        showOverlay('ざんねん!', `${points} 点\n${detail}\n${line}`, [
          { label: 'もういちど', primary: true, run: () => restart() },
          { label: 'ステージ選択', away: true, run: () => closeStage() },
        ]);
        return;
      }
      const { progress: next, newBest } = recordDeath(progress, current.id, percent);
      updateProgress(next);
      renderBest();
      const best = bestOf(progress, current.id);
      const line = newBest ? 'ベスト更新!' : `ベスト ${best}%`;
      status.textContent = `ゲームオーバー。${percent}パーセントまで進みました。${line}`;
      showOverlay('ざんねん!', `${percent}% まで進んだ\n${line}\nたまご ${eggs}/${current.eggs.length}`, [
        { label: 'もういちど', primary: true, run: () => restart() },
        { label: 'ステージ選択', away: true, run: () => closeStage() },
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
      if (last && character === 'dino' && allCleared(progress, STAGES.length) && !progress.endingSeen) {
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
      if (first && last && character === 'dino') lines.push('ちびダイノが遊べるようになった!');
      showOverlay('ステージクリア!', lines.join('\n'), [
        ...(next ? [{ label: 'つぎのステージ', primary: true, run: () => openStage(next) }] : []),
        ...(last && allCleared(progress, STAGES.length) ? [{ label: 'エンディング', primary: true, run: () => openEnding() }] : []),
        { label: 'もういちど', run: () => restart() },
        { label: 'ステージ選択', away: true, run: () => closeStage() },
      ]);
    },
    onMeat: () => sfx('meat'),
    onPerf: (summary) => {
      lastPerf = formatPerf(summary);
      showPerf();
    },
    onProgress: (info) => {
      if (!current.endless) {
        setBar(Math.round(info.ratio * 100));
        return;
      }
      // エンドレス: スコアと、肉のレベル・倍率、効き目の残り(棒)を出す。変わったときだけ書きかえる(毎フレームは書かない)
      const text = `${info.score} 点`;
      if (score.textContent !== text) score.textContent = text;
      const label = info.boost > 0 ? `🍖${info.boost} ×${info.mult.toFixed(1)}` : '';
      if (boostLabel.textContent !== label) boostLabel.textContent = label;
      setBar(Math.round(info.boostRatio * 100));
      game.classList.toggle('boosted', info.boost > 0);
      if (info.boost !== lastBoost) {
        lastBoost = info.boost;
        // 肉のレベルが高いほど、曲も少し速くなる
        setMusicTempo(1 + 0.05 * info.boost);
      }
    },
  },
  current,
);

interface OverlayButton {
  label: string;
  primary?: boolean;
  /** 画面のいちばん下に離して置く(遊びつづける流れから外れる操作。押し間違えないように) */
  away?: boolean;
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
    if (b.away) el.classList.add('away');
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

function openStage(base: StageDef): void {
  if (!stageOpen(progress, base.id)) return;
  const stage = forCharacter(base, characterById(character));
  current = stage;
  show(game);
  game.classList.remove('endless');
  $('game-title').textContent = `ステージ${stage.id} ${stage.name}${character === 'dino' ? '' : '🐣'}`;
  renderBest();
  hideOverlay();
  hint.hidden = false;
  status.textContent = '';
  player.load(stage);
  setScene(songIdOf(stage), { restart: true });
}

/** 曲の番号。エンドレスは専用の曲 */
const songIdOf = (stage: StageDef): SongId => (stage.endless ? 'endless' : stageSongId(stage.id));

/** コースの乱数の種(エンドレスは、遊ぶたびに別のコース) */
const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/** エンドレスモードを開く */
function openEndless(): void {
  current = createEndless(newSeed());
  show(game);
  game.classList.add('endless');
  $('game-title').textContent = 'エンドレス';
  $('score').textContent = '0 点';
  renderBest();
  hideOverlay();
  hint.hidden = false;
  status.textContent = '';
  player.load(current);
  setScene('endless', { restart: true });
}

/** 進み具合の棒に、これまででいちばん進んだ場所の印をつけ、ベストを文字でも出す */
function renderBest(): void {
  if (current.endless) {
    $('best-marker').hidden = true;
    $('game-best').textContent = progress.endlessBest > 0 ? `ハイスコア ${progress.endlessBest} 点` : '';
    return;
  }
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
  // エンドレスは、新しいコースで始める
  if (current.endless) current = createEndless(newSeed());
  player.load(current);
  if (!current.endless) updateProgress(recordAttempt(progress, current.id));
  setScene(songIdOf(current), { restart: true });
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
  $('ending-stats').textContent = `ぜんぶで ${totalAttempts(progress)} 回、挑戦しました\nちびダイノが仲間になった! ステージ選択でえらべます`;
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
    if (!current.endless) updateProgress(recordAttempt(progress, current.id));
    setScene(songIdOf(current), { restart: true });
    sfx('start');
    player.begin();
  } else if (player.phase === 'playing') {
    player.press();
  } else if (player.phase === 'paused') {
    hideOverlay();
    player.begin();
  }
}

// ダブルタップでの画面の拡大を防ぐ(iPhone)。CSS の touch-action だけでは、防げないことがある。
// 前のタップから 0.35 秒以内の 2 回目のタップは、ブラウザの標準の動き(拡大)を止める。ボタンやリンクは、止めない(押せなくなるため)。
// ピンチでの拡大は、そのまま使える。ジャンプは pointerdown で受けるので、影響しない。
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350 && !isControl(e.target) && e.cancelable) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

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
$('endless-open').addEventListener('click', openEndless);

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
    character = isUnlockedChar(sanitizeCharacterId(load<unknown>('character', 'dino'))) ? sanitizeCharacterId(load<unknown>('character', 'dino')) : 'dino';
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

perfHud.addEventListener('click', () => {
  renderMode = (renderMode + 1) % RENDER_MODES.length;
  const m = RENDER_MODES[renderMode];
  player.setRenderMode(m.cap, m.off, m.idle === true);
  lastPerf = ''; // 新しい描き方の数字が出るまで、前の数字は出さない
  showPerf();
});

// 「新しい版を確認する」: すぐに確認して、結果を知らせる(新版があれば、「更新」ボタンが出る)
const UPDATE_MESSAGES: Record<UpdateResult, string> = {
  latest: 'これが最新の版です',
  found: '新しい版が見つかりました。「更新」を押してください',
  offline: '確認できませんでした(通信できません)',
  unavailable: 'いまは確認できません',
  skipped: 'これが最新の版です',
};
$('update-check').addEventListener('click', async () => {
  const message = $('update-message');
  message.textContent = '確認しています…';
  message.textContent = UPDATE_MESSAGES[await checkForUpdate(true)];
});

// 隠しコマンド: バージョン表示を 3 秒以内に 7 回タップ → デバッグモードのオン/オフ
const SECRET_TAPS = 7;
let taps: number[] = [];
$('version').parentElement?.addEventListener('pointerup', () => {
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 3000), now];
  if (taps.length < SECRET_TAPS) return;
  taps = [];
  debug = !debug;
  save('debug', debug);
  if (!debug && !isUnlockedChar(character)) {
    character = 'dino';
    save('character', character);
    progress = loadProgress();
  }
  renderStageList();
  $('title-summary').textContent = debug ? 'デバッグモード: オン' : 'デバッグモード: オフ';
});
requestPersist();
setupUpdateBanner($('update-banner'), $('update-button'));
setupInstallGuide($<HTMLButtonElement>('install-open'), $<HTMLDialogElement>('install-dialog'), $<HTMLButtonElement>('install-now'));
renderToggles();
renderStageList();
show(title);

// ここまで来たら起動成功（public/boot.js が見ている）
window.__appStarted = true;
