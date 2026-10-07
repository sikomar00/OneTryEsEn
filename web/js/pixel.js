// 픽셀 아트 도우미: 글자 지도(ASCII 비트맵)를 SVG로 그린다. 모든 그림은 shape-rendering="crispEdges".
//  - 팔레트: Sweetie-16 (GrafxKid, CC0). UI·스프라이트·이미지 양자화가 같은 색을 쓴다.
//  - 아이콘: 8x8 비트맵 → currentColor 로 칠해서 글자색을 그대로 따라간다.
const SVG_NS = "http://www.w3.org/2000/svg";

export const PALETTE = [
  "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179",
  "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
];
export const INK = PALETTE[0];

/** 비트맵(문자열 배열)을 SVG 문자열의 <rect> 묶음으로 바꾼다. 같은 색이 이어지는 가로줄은 rect 하나로 합친다. */
export function rectsOf(rows, colors){
  let out = "";
  rows.forEach((row, y)=>{
    let x = 0;
    while(x < row.length){
      const ch = row[x];
      if(!(ch in colors)){ x++; continue; }
      let x2 = x;
      while(x2 + 1 < row.length && row[x2 + 1] === ch) x2++;
      out += `<rect x="${x}" y="${y}" width="${x2 - x + 1}" height="1" fill="${colors[ch]}"/>`;
      x = x2 + 1;
    }
  });
  return out;
}

export const sizeOf = rows => ({ w: Math.max(...rows.map(r => r.length)), h: rows.length });

/** SVG 문자열 (data URI·innerHTML 용). scale = 비트맵 한 칸의 CSS px. */
export function spriteMarkup(rows, colors, scale = 1){
  const { w, h } = sizeOf(rows);
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" ` +
         `shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rectsOf(rows, colors)}</svg>`;
}

/** DOM 요소로 만든 스프라이트 */
export function spriteSVG(rows, colors, scale = 1){
  const t = document.createElement("template");
  t.innerHTML = spriteMarkup(rows, colors, scale);
  return t.content.firstElementChild;
}

export function dataURI(markup){
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

// ── 8x8 아이콘 ('#' = 칠함) ──────────────────────────────
export const ICONS = {
  speaker: [
    "...#....",
    "..##.#..",
    "###..#.#",
    "###..#.#",
    "###..#.#",
    "..##.#..",
    "...#....",
    "........",
  ],
  star: [
    "...##...",
    "...##...",
    "########",
    ".######.",
    "..####..",
    ".######.",
    ".##..##.",
    ".#....#.",
  ],
  bulb: [
    "..####..",
    ".######.",
    ".######.",
    ".######.",
    "..####..",
    "..####..",
    "...##...",
    "..####..",
  ],
  check: [
    "........",
    "......##",
    ".....###",
    "##..###.",
    "#######.",
    ".#####..",
    "..###...",
    "...#....",
  ],
  warn: [
    "..####..",
    ".######.",
    "###..###",
    "###..###",
    "###..###",
    "########",
    ".###.##.",
    "..####..",
  ],
  crown: [
    "........",
    "#..##..#",
    "##.##.##",
    "########",
    "########",
    "########",
    ".######.",
    "........",
  ],
  heart: [
    ".##..##.",
    "########",
    "########",
    "########",
    ".######.",
    "..####..",
    "...##...",
    "........",
  ],
  x: [
    "##....##",
    "###..###",
    ".######.",
    "..####..",
    "..####..",
    ".######.",
    "###..###",
    "##....##",
  ],
  disk: [
    "#######.",
    "#.###.##",
    "#.###.##",
    "#.....##",
    "#.###.##",
    "#.###.##",
    "#.###.##",
    "########",
  ],
  arrow: [
    "##......",
    "####....",
    "######..",
    "########",
    "######..",
    "####....",
    "##......",
    "........",
  ],
  down: [
    "........",
    "########",
    ".######.",
    "..####..",
    "...##...",
    "........",
    "........",
    "........",
  ],
  book: [
    "........",
    ".###.###",
    "####.###",
    "####.###",
    "####.###",
    "####.###",
    ".###.###",
    "........",
  ],
  search: [
    ".####...",
    "##..##..",
    "#....#..",
    "#....#..",
    "##..##..",
    ".#####..",
    ".....###",
    "......##",
  ],
  bolt: [
    "....##..",
    "...##...",
    "..##....",
    ".######.",
    "...##...",
    "..##....",
    ".##.....",
    ".#......",
  ],
};

const ICON_COLORS = { "#": "currentColor" };

export function iconSVG(name, size = 16){
  const rows = ICONS[name];
  if(!rows) throw new Error("unknown icon: " + name);
  return spriteSVG(rows, ICON_COLORS, size / 8);
}

/** <span class="pxi"> 로 감싼 아이콘 (글줄 안에 놓기 좋다) */
export function icon(name, size = 16){
  const s = document.createElement("span");
  s.className = "pxi";
  s.appendChild(iconSVG(name, size));
  return s;
}

/** HTML 안의 <span data-icon="star" data-size="16"> 들을 아이콘으로 채운다 */
export function hydrateIcons(root = document){
  root.querySelectorAll("[data-icon]").forEach(el=>{
    if(el.firstElementChild) return;
    el.classList.add("pxi");
    el.appendChild(iconSVG(el.dataset.icon, Number(el.dataset.size) || 16));
  });
}

// ── 절차적 비트맵 ───────────────────────────────────────
/** 가운데가 비어 있지 않은 원판 (달 등). ch 로 칠한 n x n 비트맵 */
export function discRows(n, ch = "m"){
  const c = (n - 1) / 2, r = n / 2 - 0.35;
  const rows = [];
  for(let y = 0; y < n; y++){
    let row = "";
    for(let x = 0; x < n; x++) row += Math.hypot(x - c, y - c) <= r ? ch : ".";
    rows.push(row);
  }
  return rows;
}

/** 충돌 별 (11x11): 중심 마름모 + 십자 + 대각 팔 */
export const BURST = (()=>{
  const n = 11, c = 5, rows = [];
  for(let y = 0; y < n; y++){
    let row = "";
    for(let x = 0; x < n; x++){
      const dx = Math.abs(x - c), dy = Math.abs(y - c);
      const on = dx + dy <= 3 || ((dx === 0 || dy === 0) && Math.max(dx, dy) <= 5) ||
                 (dx === dy && dx <= 4);
      row += on ? (dx + dy <= 2 ? "w" : "y") : ".";
    }
    rows.push(row);
  }
  return rows;
})();
