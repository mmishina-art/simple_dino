// ステージのデータ。配置は文字列で書く(トークンを空白で区切る):
//   S / B / R / T … 障害物をその位置に置く(src/game.ts の OBSTACLE_SIZES)
//   数字         … 進む時間(ミリ秒)。先頭の数字は最初の障害物までの時間、末尾の数字はゴールまでの時間
// ミリ秒で書くので、速さが変わっても「ジャンプのリズム」の感覚をそろえやすい。
import { OBSTACLE_SIZES, type Obstacle, type ObstacleKind, type StageDef } from './logic';

export function parseLayout(speed: number, layout: string): { obstacles: Obstacle[]; length: number } {
  const obstacles: Obstacle[] = [];
  let cursor = 0;
  for (const token of layout.trim().split(/\s+/)) {
    if (/^\d+$/.test(token)) {
      cursor += (Number(token) * speed) / 1000;
    } else if (token in OBSTACLE_SIZES) {
      const { w, h } = OBSTACLE_SIZES[token as ObstacleKind];
      obstacles.push({ kind: token as ObstacleKind, x: cursor, w, h });
      cursor += w;
    } else {
      throw new Error(`知らない記号です: ${token}`);
    }
  }
  return { obstacles, length: cursor };
}

function stage(id: number, name: string, speed: number, layout: string): StageDef {
  return { id, name, speed, ...parseLayout(speed, layout) };
}

// 配置は tests/solver.ts で「解ける・判定を何 px 厳しくしても解ける余裕」を確かめて決めた(乱数で作って、余裕が目標の範囲に入ったものを採用)。
// 後半ほど速く・間隔が狭く・連続ジャンプが増え、余裕が減る。数字を変えたら、必ず npm test で難易度の範囲を確認する。
export const STAGES: readonly StageDef[] = [
  stage(1, 'そうげん', 180,
    '1520 S 1180 R 1100 S 1240 R 1500 R 1280 S 1560 S 1300 S 1180 R 1350 R 1340 R 1410 R 1420 S 1120 S 1430 S 1360 S 1500 1200'),
  stage(2, 'さばく', 200,
    '1350 R 1280 R 1280 B 1110 S 1370 B 1120 B 1220 B 1250 R 1380 B 1350 B 1290 S 1170 S 1330 B 1020 R 1310 S 1050 S 1150 S 1250 S 1080 B 1010 1200'),
  stage(3, 'ゆうやけ', 220,
    '1500 R 1050 S 1080 B 1230 B 1240 B 1010 R 1270 S 90 B 1110 B 900 B 1110 S 1050 B 1080 R 1000 S 1040 S 920 B 1210 R 90 S 1090 R 1190 S 1010 B 1030 S 1220 R 1190 R 100 S 1090 1200'),
  stage(4, 'もり', 240,
    '1310 R 1090 R 880 S 560 S 910 B 90 B 1080 S 680 S 860 B 1160 R 90 S 990 B 990 S 1020 B 1080 S 1010 S 940 R 690 B 1040 S 520 S 1000 S 590 S 1140 R 610 B 950 R 900 S 1120 B 860 S 510 S 1050 S 80 S 920 1200'),
  stage(5, 'どうくつ', 260,
    '1210 S 490 S 940 S 90 S 90 S 870 B 130 S 830 R 950 R 830 S 1050 B 90 B 820 S 1100 R 820 B 100 S 920 B 120 S 950 S 1060 S 110 S 110 S 980 B 900 B 940 B 990 R 1060 S 430 S 890 S 520 S 860 B 900 B 780 R 1010 R 90 S 910 B 530 S 1040 B 1090 S 1070 1200'),
  stage(6, 'ゆきぐに', 285,
    '1210 B 110 B 980 B 970 S 470 S 780 R 550 B 770 R 710 B 790 B 850 T 420 S 720 S 880 B 990 T 850 T 840 R 400 B 870 R 410 B 990 T 460 S 750 R 390 B 790 S 840 T 110 S 780 B 810 S 100 S 100 S 980 T 960 S 110 S 110 S 950 R 760 T 100 S 980 T 480 S 740 S 710 T 450 S 890 B 110 B 890 1200'),
  stage(7, 'かざん', 310,
    '1210 R 700 B 710 S 100 S 100 S 880 S 380 T 830 T 780 S 670 S 450 S 870 B 350 R 800 T 90 S 840 B 940 T 490 S 840 R 670 B 860 B 340 R 810 B 350 R 710 S 690 S 470 S 880 T 440 S 790 B 910 S 80 S 80 S 680 T 500 S 810 B 880 T 370 S 760 S 90 S 90 S 660 S 470 T 760 T 880 S 500 S 830 B 480 R 770 T 90 S 730 1200'),
  stage(8, 'よる', 335,
    '1180 B 790 T 320 S 640 R 400 S 840 S 430 T 870 S 80 S 80 S 800 R 420 S 640 R 330 S 790 T 720 S 700 R 740 R 410 S 710 S 130 S 130 S 680 S 470 T 800 B 390 T 890 S 440 S 730 B 110 B 110 B 830 T 350 S 890 B 100 B 100 B 610 S 440 S 680 S 360 S 850 T 90 S 850 T 620 T 110 S 850 R 330 S 690 S 100 T 620 B 100 B 100 B 700 T 380 S 650 S 100 T 640 B 420 T 710 R 470 S 770 1200'),
  stage(9, 'うちゅう', 360,
    '1070 R 650 B 410 R 670 S 100 T 650 B 120 T 700 S 110 T 820 B 430 R 670 S 120 T 580 B 340 R 850 S 340 T 820 B 100 T 690 S 90 T 770 B 840 S 120 T 660 B 390 S 760 B 340 R 610 B 100 B 100 B 640 T 340 S 840 R 350 S 740 R 390 S 590 B 670 S 430 S 700 S 90 T 660 S 310 S 650 S 390 S 640 R 390 S 720 1200'),
  stage(10, 'ラスト', 390,
    '1290 R 330 S 750 S 340 S 790 T 370 S 580 T 420 S 750 B 530 B 80 T 620 S 290 S 510 T 340 S 570 T 410 B 570 R 330 S 760 T 360 S 670 S 510 R 580 B 110 T 730 S 360 S 640 R 420 S 750 S 400 T 590 B 290 S 580 R 350 S 520 S 390 T 680 S 350 T 540 S 290 T 730 R 320 S 710 B 120 B 120 B 540 R 570 S 360 T 610 1200'),
];
