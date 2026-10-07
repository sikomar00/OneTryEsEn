// 배경 도트 그림을 코드로 만든다: 별·구름·달·마을 실루엣(밤하늘), 아레나의 언덕과 발판.
// 결과는 CSS 변수(data URI)로 넣어 두고, 실제 배치·움직임은 CSS 가 맡는다.
// 시드가 고정된 난수라서 새로고침해도 같은 하늘이고, 모든 도형은 격자(CELL)에 맞아 있다.
import { rectsOf, dataURI, discRows } from "./pixel.js";

const SVG = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
const rect = (x, y, w, h, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

function rng(seed){                       // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL = 4;

// ── 별 ───────────────────────────────────────────────
function starTile(seed, small, big){
  const r = rng(seed), T = 480, g = T / CELL;
  const colors = ["#f4f4f4", "#f4f4f4", "#ffcd75", "#73eff7"];
  let body = "";
  const at = () => [Math.floor(r() * (g - 4)) * CELL + CELL, Math.floor(r() * (g - 4)) * CELL + CELL];
  for(let i = 0; i < small; i++){
    const [x, y] = at();
    body += rect(x, y, CELL, CELL, colors[Math.floor(r() * colors.length)]);
  }
  for(let i = 0; i < big; i++){                         // 십자 모양 큰 별
    const [x, y] = at(), c = colors[Math.floor(r() * colors.length)];
    body += rect(x, y, CELL, CELL, c) + rect(x - CELL, y, CELL, CELL, c) + rect(x + CELL, y, CELL, CELL, c) +
            rect(x, y - CELL, CELL, CELL, c) + rect(x, y + CELL, CELL, CELL, c);
  }
  return dataURI(SVG(T, T, body));
}

// ── 구름 (납작한 바닥 + 둥근 윗면) ───────────────────────
function cloudShape(r, widthCells){
  const bumps = [];
  const n = 3 + Math.floor(r() * 2);
  for(let i = 0; i < n; i++) bumps.push({ cx: 3 + Math.floor(r() * (widthCells - 6)), rad: 2 + Math.floor(r() * 3) });
  const tops = [];
  for(let x = 0; x < widthCells; x++){
    let h = 0;
    for(const b of bumps){
      const d = x - b.cx;
      if(Math.abs(d) <= b.rad) h = Math.max(h, Math.round(Math.sqrt(b.rad * b.rad - d * d)) + 1);
    }
    tops.push(h);
  }
  return tops;
}
function cloudTile(){
  const r = rng(7), W = 1024, H = 192, u = 8;           // 구름은 8px 격자
  let body = "";
  [[40, 24, 14], [380, 96, 18], [700, 40, 12], [860, 128, 16]].forEach(([x0, y0, wc])=>{
    const tops = cloudShape(r, wc), base = y0 + 6 * u;
    tops.forEach((h, i)=>{
      if(!h) return;
      body += rect(x0 + i * u, base - h * u, u, h * u, "#566c86");
      body += rect(x0 + i * u, base - h * u, u, u, "#94b0c2");          // 윗면 하이라이트
    });
  });
  return dataURI(SVG(W, H, `<g fill-opacity="0.34">${body}</g>`));
}

// ── 달 (원판 + 그늘 + 분화구 + 후광) ─────────────────────
function moonMarkup(){
  const base = discRows(16, "m").map((row, y) =>
    row.split("").map((ch, x) => ch === "m" && Math.hypot(x - 5.2, y - 5.2) > 9.4 ? "s" : ch).join(""));
  const crater = [[4, 5], [5, 5], [10, 4], [10, 9], [11, 9], [6, 11], [7, 11], [3, 9]];
  const rows = base.map(r => r.split(""));
  crater.forEach(([x, y]) => { if(rows[y][x] !== ".") rows[y][x] = "c"; });
  const body = rectsOf(rows.map(r => r.join("")), { m: "#f4f4f4", s: "#94b0c2", c: "#bcc9d6" });
  const halo1 = rectsOf(discRows(22, "h"), { h: "rgba(244,244,244,0.07)" });
  const halo2 = rectsOf(discRows(19, "h"), { h: "rgba(244,244,244,0.10)" });
  return SVG(22, 22, `<g>${halo1}</g><g transform="translate(1.5 1.5)">${halo2}</g><g transform="translate(3 3)">${body}</g>`);
}

// ── 마을 실루엣: 주기 함수라 좌우로 이어 붙여도 끊기지 않는다 ────
function ridge(seed, N, base, amps){
  const r = rng(seed), ph = amps.map(() => r() * Math.PI * 2);
  return Array.from({ length: N }, (_, i) =>
    base + amps.reduce((s, [k, a], j) => s + a * Math.sin((2 * Math.PI * k * i) / N + ph[j]), 0));
}
function columns(heights, step, H, fill){
  let body = "", i = 0;
  const q = heights.map(h => Math.max(step, Math.round(h / step) * step));
  while(i < q.length){
    let j = i;
    while(j + 1 < q.length && q[j + 1] === q[i]) j++;
    body += rect(i * step, H - q[i], (j - i + 1) * step, q[i], fill);
    i = j + 1;
  }
  return { body, q };
}
function house(x, y, lit){            // (x, y) = 지붕 꼭대기 왼쪽 위
  const c = "#1a1c2c";
  let s = rect(x + 8, y, 8, 4, c) + rect(x + 4, y + 4, 16, 4, c) + rect(x, y + 8, 24, 4, c) + rect(x + 2, y + 12, 20, 12, c);
  if(lit) s += rect(x + 6, y + 16, 4, 4, "#ffcd75") + (lit > 1 ? rect(x + 14, y + 16, 4, 4, "#ffcd75") : "");
  return s;
}
function pine(x, y){                  // 소나무
  const c = "#1a1c2c";
  return rect(x + 8, y, 4, 4, c) + rect(x + 4, y + 4, 12, 4, c) + rect(x, y + 8, 20, 4, c) +
         rect(x + 4, y + 12, 12, 4, c) + rect(x + 8, y + 16, 4, 8, c);
}
function hillsTile({ seed, W, H, step, base, amps, fill, town = false }){
  const N = W / step, hs = ridge(seed, N, base, amps);
  const { body, q } = columns(hs, step, H, fill);
  let extra = "";
  if(town){
    const r = rng(seed + 9);
    for(let k = 0; k < 7; k++){
      const i = 2 + Math.floor(r() * (N - 6)), x = i * step, top = H - q[i];
      extra += r() < 0.35 ? pine(x, top - 24) : house(x, top - 24, 1 + Math.floor(r() * 2));
    }
  }
  return dataURI(SVG(W, H, body + extra));
}

// ── 아레나: 발판(타원) ──────────────────────────────
function padMarkup(){
  const W = 24, H = 7, rows = [];
  for(let y = 0; y < H; y++){
    let row = "";
    for(let x = 0; x < W; x++){
      const nx = (x - (W - 1) / 2) / (W / 2), ny = (y - (H - 1) / 2) / (H / 2);
      const d = nx * nx + ny * ny;
      row += d <= 0.72 ? (y >= H - 3 ? "g" : "l") : d <= 1.02 ? "o" : ".";
    }
    rows.push(row);
  }
  return SVG(W, H, rectsOf(rows, { l: "#d9f8a8", g: "#7fd94f", o: "#257179" }));
}

/** 페이지 로드 시 한 번 호출: CSS 변수에 도트 그림들을 심는다 */
export function initSky(){
  const root = document.documentElement.style;
  root.setProperty("--stars-a", starTile(11, 26, 5));
  root.setProperty("--stars-b", starTile(23, 26, 5));
  root.setProperty("--clouds", cloudTile());
  root.setProperty("--moon", dataURI(moonMarkup()));
  root.setProperty("--hills-far", hillsTile({ seed: 5, W: 960, H: 160, step: 8, base: 70, amps: [[2, 26], [5, 14], [11, 8]], fill: "#333c57" }));
  root.setProperty("--hills-near", hillsTile({ seed: 8, W: 960, H: 120, step: 8, base: 44, amps: [[3, 16], [7, 10], [13, 6]], fill: "#1a1c2c", town: true }));
  root.setProperty("--scene-hills", hillsTile({ seed: 3, W: 480, H: 56, step: 8, base: 28, amps: [[2, 12], [5, 8], [9, 4]], fill: "#257179" }));
  root.setProperty("--pad", dataURI(padMarkup()));
}
