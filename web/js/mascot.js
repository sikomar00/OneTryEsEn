// 마스코트 슬라임: 상태(대기·조회 중·성공·실패)에 따라 표정이 바뀌고, 대기 중에는 사용 팁을 말한다.
import { $ } from "./util.js";
import { spriteSVG } from "./pixel.js";
import { typeInto, reducedMotion } from "./fx.js";

export const MASCOT_COLORS = {
  o: "#1a1c2c", B: "#41a6f6", b: "#73eff7", d: "#3b5dc9",
  w: "#f4f4f4", k: "#1a1c2c", p: "#ff9ea8", m: "#1a1c2c",
};

// 16 x 12. o=윤곽 B=몸 b=하이라이트 d=그늘 w=눈빛 k=눈동자 p=볼터치 m=입
const BASE = [
  "....oooooooo....",
  "...obbBBBBBBo...",
  "..obbBBBBBBBBo..",
  ".obBBBBBBBBBBBo.",
  ".oBBwkBBBBwkBBo.",
  ".oBBkkBBBBkkBBo.",
  ".oBBkkBBBBkkBBo.",
  ".oBpBBmBBmBBpBo.",
  ".oBBBBBmmBBBBBo.",
  ".oBBBBBBBBBBBBo.",
  ".oddddddddddddo.",
  "..oooooooooooo..",
];

// [행, 시작열, 끝열, 문자]
const MOODS = {
  idle: [],
  blink: [[4, 4, 5, "B"], [4, 10, 11, "B"], [6, 4, 5, "B"], [6, 10, 11, "B"]],
  happy: [                                   // ^ ^ 눈 + 활짝 웃는 입
    [4, 4, 5, "k"], [4, 10, 11, "k"],
    [5, 3, 3, "k"], [5, 4, 5, "B"], [5, 6, 6, "k"],
    [5, 9, 9, "k"], [5, 10, 11, "B"], [5, 12, 12, "k"],
    [6, 4, 5, "B"], [6, 10, 11, "B"],
    [8, 6, 9, "m"],
  ],
  busy: [                                    // 동그란 눈 + 'o' 입 (생각 중)
    [4, 4, 5, "B"], [4, 10, 11, "B"],
    [5, 4, 4, "B"], [5, 10, 10, "B"],
    [6, 4, 4, "B"], [6, 10, 10, "B"],
    [7, 6, 6, "B"], [7, 9, 9, "B"],
    [7, 7, 8, "m"], [8, 7, 8, "m"],
  ],
  error: [                                   // x x 눈 + 찡그린 입
    [4, 4, 5, "B"], [4, 10, 11, "B"], [5, 4, 5, "B"], [5, 10, 11, "B"], [6, 4, 5, "B"], [6, 10, 11, "B"],
    [4, 4, 4, "k"], [4, 6, 6, "k"], [5, 5, 5, "k"], [6, 4, 4, "k"], [6, 6, 6, "k"],
    [4, 9, 9, "k"], [4, 11, 11, "k"], [5, 10, 10, "k"], [6, 9, 9, "k"], [6, 11, 11, "k"],
    [7, 6, 6, "B"], [7, 9, 9, "B"], [7, 7, 8, "m"], [8, 7, 8, "B"], [8, 6, 6, "m"], [8, 9, 9, "m"],
  ],
};

/** mood 에 해당하는 비트맵 (BASE 에 덧칠) */
export function frameRows(mood){
  const grid = BASE.map(r => r.split(""));
  (MOODS[mood] || []).forEach(([r, c0, c1, ch])=>{ for(let c = c0; c <= c1; c++) grid[r][c] = ch; });
  return grid.map(r => r.join(""));
}

const SCALE = 4;
const TIPS = [
  "궁금한 단어나 문장을 입력해 봐요!",
  "문장을 넣으면 세 언어를 같은 색으로 짝지어 줘요.",
  "단어 하나를 넣으면 사전과 백과 정보도 같이 나와요.",
  "저장한 단어는 CSV로 내보낼 수 있어요.",
  "주소 뒤에 ?q=단어 를 붙이면 바로 조회돼요.",
  "검색할 때마다 배틀이 한 판씩 벌어져요!",
];

let host = null, mood = "idle", blinkTimer = null, tipTimer = null, tipIdx = 0, happyTimer = null;

function paint(frame){
  host.textContent = "";
  host.appendChild(spriteSVG(frameRows(frame), MASCOT_COLORS, SCALE));
}

function scheduleBlink(){
  clearTimeout(blinkTimer);
  if(mood !== "idle" || reducedMotion()) return;
  blinkTimer = setTimeout(()=>{
    if(mood !== "idle") return;
    paint("blink");
    setTimeout(()=>{ if(mood === "idle") paint("idle"); scheduleBlink(); }, 150);
  }, 2400 + Math.random() * 3200);
}

export const Mascot = {
  init(){
    host = $("mascot");
    if(!host) return;
    Mascot.setMood("idle");
  },

  /** idle | busy | happy | error */
  setMood(next){
    if(!host) return;
    clearTimeout(happyTimer);
    mood = next;
    host.dataset.mood = next;
    paint(next);
    scheduleBlink();
    if(next === "happy") happyTimer = setTimeout(()=>{ if(mood === "happy") Mascot.setMood("idle"); }, 3200);
  },

  /** 대기 중 팁을 말풍선에 띄우고 주기적으로 바꾼다 (다른 메시지가 오면 stopTips) */
  showTips(){
    const bubble = $("statusMsg");
    clearTimeout(tipTimer);
    const say = ()=>{
      typeInto(bubble, TIPS[tipIdx % TIPS.length]);
      tipIdx++;
      tipTimer = setTimeout(say, 9000);
    };
    say();
  },
  stopTips(){ clearTimeout(tipTimer); tipTimer = null; },
};
