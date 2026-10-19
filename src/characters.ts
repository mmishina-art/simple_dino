// 遊べるキャラ。ステージのコース(障害物の位置)は同じで、キャラによって、走る速さと当たり判定の大きさが変わる。
// 全ステージをクリアすると、ちびダイノが遊べるようになる。キャラごとに、クリアの記録は別。
import { DINO_BODY, type Body, type StageDef } from './logic';

export type CharacterId = 'dino' | 'chibi';

export interface Character {
  id: CharacterId;
  name: string;
  /** 走る速さの倍率(1 = ダイノ) */
  speedMul: number;
  /** 当たり判定の大きさ */
  body: Body;
  /** ステージ選択で見せる、ひとこと */
  note: string;
}

export const CHARACTERS: readonly Character[] = [
  { id: 'dino', name: 'ダイノ', speedMul: 1, body: DINO_BODY, note: 'ふつうの速さ' },
  { id: 'chibi', name: 'ちびダイノ', speedMul: 1.4, body: { w: 14, h: 16 }, note: '小さくて、速い' },
];

export const characterById = (id: CharacterId): Character => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/** 保存されていた値を、キャラの ID に直す(知らない値はダイノ) */
export const sanitizeCharacterId = (raw: unknown): CharacterId => (raw === 'chibi' ? 'chibi' : 'dino');

/** ステージを、そのキャラで遊ぶ形にする。コース(障害物・たまごの位置)は同じで、速さと当たり判定の大きさが変わる */
export function forCharacter(stage: StageDef, character: Character): StageDef {
  if (character.id === 'dino') return stage;
  return { ...stage, speed: stage.speed * character.speedMul, body: character.body };
}

/** ちびダイノは、ダイノで全ステージをクリアすると遊べる */
export const isCharacterUnlocked = (id: CharacterId, dinoClearedCount: number, stageCount: number): boolean =>
  id === 'dino' || dinoClearedCount >= stageCount;
