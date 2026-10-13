// ステージごとの背景の色と飾り。色はゲーム画面(Canvas)の中だけで使う。
// 暗い背景のステージ(5・7・8・9・10)は、恐竜と障害物を明るい色にして見えやすくする。

export type Decor = 'sun' | 'bigSun' | 'cloud' | 'dunes' | 'trees' | 'stalactite' | 'mountains' | 'snow' | 'volcano' | 'moon' | 'stars' | 'planet';

export interface Theme {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundLine: string;
  dino: string;
  cactus: string;
  rock: string;
  rockLight: string;
  /** 飾りの色(太陽、雲、星など) */
  decor: string;
  /** 飾りの 2 色目(山、木、星雲など) */
  decor2: string;
  decors: readonly Decor[];
}

export const THEMES: readonly Theme[] = [
  { skyTop: '#a8dcff', skyBottom: '#eaf7ff', ground: '#cfe8a0', groundLine: '#6fa84a', dino: '#3b3a30', cactus: '#2f7a3a', rock: '#8a857a', rockLight: '#b5b0a2', decor: '#ffe27a', decor2: '#ffffff', decors: ['sun', 'cloud'] },
  { skyTop: '#ffe0a0', skyBottom: '#fff6dc', ground: '#f0d08a', groundLine: '#c9a24f', dino: '#3b3a30', cactus: '#2f7a3a', rock: '#a9784a', rockLight: '#cfa070', decor: '#ffd04a', decor2: '#e8c070', decors: ['sun', 'dunes', 'cloud'] },
  { skyTop: '#ff8f6a', skyBottom: '#ffd9a8', ground: '#d9a066', groundLine: '#a8693a', dino: '#3b3a30', cactus: '#2b5a2f', rock: '#8b5a3c', rockLight: '#b8825c', decor: '#fff0b0', decor2: '#ffb48a', decors: ['bigSun', 'cloud'] },
  { skyTop: '#a8e0b8', skyBottom: '#e8f7d8', ground: '#a8cf7a', groundLine: '#4f8a3a', dino: '#3b3a30', cactus: '#1f5a2a', rock: '#7a756a', rockLight: '#a8a396', decor: '#ffffff', decor2: '#4f9a4a', decors: ['trees', 'cloud'] },
  { skyTop: '#2b2438', skyBottom: '#4a3f5c', ground: '#5a4c6e', groundLine: '#8a7aa8', dino: '#f7f1de', cactus: '#7fd18a', rock: '#b8a8d8', rockLight: '#d8ccf0', decor: '#8a7aa8', decor2: '#3a3050', decors: ['stalactite'] },
  { skyTop: '#cfe6ff', skyBottom: '#f4f9ff', ground: '#ffffff', groundLine: '#aac8e8', dino: '#3b3a30', cactus: '#2f7a6a', rock: '#7a8aa0', rockLight: '#a8b8cc', decor: '#ffffff', decor2: '#b8d0ec', decors: ['mountains', 'snow'] },
  { skyTop: '#4a1f1f', skyBottom: '#c2563a', ground: '#3a2a2a', groundLine: '#ff7a3a', dino: '#f7f1de', cactus: '#9be070', rock: '#d8c0b0', rockLight: '#f0e0d0', decor: '#ff7a3a', decor2: '#2a1818', decors: ['volcano', 'stars'] },
  { skyTop: '#101a3a', skyBottom: '#2a3a6a', ground: '#1f2a4a', groundLine: '#4a5a8a', dino: '#f7f1de', cactus: '#6fd08a', rock: '#aab4d8', rockLight: '#d0d8f0', decor: '#fff5c0', decor2: '#ffffff', decors: ['moon', 'stars'] },
  { skyTop: '#0a0820', skyBottom: '#241446', ground: '#2a1a4a', groundLine: '#7a5ac8', dino: '#f7f1de', cactus: '#7fe0c0', rock: '#c8b8f0', rockLight: '#e8e0ff', decor: '#ffffff', decor2: '#8a5ad8', decors: ['planet', 'stars'] },
  { skyTop: '#2a0a1a', skyBottom: '#7a1a3a', ground: '#1a0a14', groundLine: '#ff4a6a', dino: '#f7f1de', cactus: '#ffd25a', rock: '#ff9ab0', rockLight: '#ffd0dc', decor: '#ffd25a', decor2: '#3a0a20', decors: ['volcano', 'moon', 'stars'] },
];
