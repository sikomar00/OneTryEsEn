// 이미지 → 도트 아트: 작게 줄이고, 팔레트 색으로 바꾸고, (선택) 배경을 지우고 외곽선을 두른다.
// 디지몬 일러스트·위키 사진처럼 "픽셀이 아닌" 그림을 화면 테마에 맞춘다.
// 픽셀을 읽으려면 CORS 허용 이미지여야 한다 (digi-api / Wikimedia / PokeAPI 모두 ACAO=*). 아니면 줄이기만 한다.
import { PALETTE, INK } from "./pixel.js";

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// 사진용 32색 (ENDESGA 32)
const EDG32 = [
  "#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39", "#3e2731", "#a22633",
  "#e43b44", "#f77622", "#feae34", "#fee761", "#63c74d", "#3e8948", "#265c42", "#193c3e",
  "#124e89", "#0099db", "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
  "#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a", "#e8b796", "#c28569",
];
export const PALETTES = { sweetie: PALETTE.map(rgb), edg32: EDG32.map(rgb) };
const INK_RGB = rgb(INK);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function nearest(r, g, b, pal){
  let best = pal[0], bd = Infinity;
  for(const c of pal){
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;     // 사람 눈이 초록에 민감한 점을 반영
    if(d < bd){ bd = d; best = c; }
  }
  return best;
}

function loadImage(url, cors){
  return new Promise((resolve, reject)=>{
    const im = new Image();
    const to = setTimeout(() => reject(new Error("timeout")), 8000);
    if(cors) im.crossOrigin = "anonymous";
    im.referrerPolicy = "no-referrer";
    im.onload = () => { clearTimeout(to); resolve(im); };
    im.onerror = () => { clearTimeout(to); reject(new Error("load")); };
    im.src = url;
  });
}

/** 가장자리와 이어진, 모서리 색과 비슷한 픽셀을 투명하게 (흰 배경 일러스트용) */
function removeBackground(img, w, h, tol, pad = 0){
  const d = img.data;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(pad, pad), at(w - 1 - pad, pad), at(pad, h - 1 - pad), at(w - 1 - pad, h - 1 - pad)]
    .map(i => [d[i], d[i + 1], d[i + 2]]);
  const bg = corners[0];
  const far = corners.some(c => Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) > 40);
  if(far) return;                                                  // 배경이 단색이 아니면 건드리지 않는다
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y)=>{
    if(x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) return;
    const i = at(x, y);
    if(d[i + 3] >= 128 && Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]) > tol) return;
    seen[y * w + x] = 1;
    stack.push(x, y);
  };
  for(let x = 0; x < w; x++){ push(x, 0); push(x, h - 1); }
  for(let y = 0; y < h; y++){ push(0, y); push(w - 1, y); }
  while(stack.length){
    const y = stack.pop(), x = stack.pop();
    d[at(x, y) + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

/** 이미지에서 k 개의 대표 색을 뽑는다 (median cut) */
function medianCut(px, k){
  let boxes = [px];
  while(boxes.length < k){
    let bi = -1, bch = 0, best = 0;
    boxes.forEach((b, i)=>{
      if(b.length < 2) return;
      for(let ch = 0; ch < 3; ch++){
        let lo = 255, hi = 0;
        for(const p of b){ if(p[ch] < lo) lo = p[ch]; if(p[ch] > hi) hi = p[ch]; }
        if(hi - lo > best){ best = hi - lo; bi = i; bch = ch; }
      }
    });
    if(bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[bch] - q[bch]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map(b => {
    const s = [0, 0, 0];
    for(const p of b){ s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map(v => Math.round(v / b.length));
  });
}

function adaptivePalette(img, w, h, k){
  const d = img.data, px = [];
  for(let i = 0; i < w * h; i++) if(d[i * 4 + 3] >= 128) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  return px.length ? medianCut(px, k) : PALETTES.sweetie;
}

/** 채도·대비를 조금 올려 줄인 사진이 칙칙해지지 않게 한다 */
function punch(img, w, h, sat = 1.18, con = 1.1){
  const d = img.data;
  for(let i = 0; i < w * h; i++){
    if(!d[i * 4 + 3]) continue;
    const g = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    for(let c = 0; c < 3; c++){
      let v = g + (d[i * 4 + c] - g) * sat;
      v = (v - 128) * con + 128;
      d[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

function quantize(img, w, h, pal, dither){
  const d = img.data;
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const i = (y * w + x) * 4;
      if(d[i + 3] < 128){ d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      if(!pal) continue;                                           // 색은 그대로 (크기만 줄인 모자이크)
      const t = dither ? (BAYER[y & 3][x & 3] / 16 - 0.5) * dither * 64 : 0;
      const c = nearest(d[i] + t, d[i + 1] + t, d[i + 2] + t, pal);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
}

function outline(img, w, h){
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for(let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] ? 1 : 0;
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      if(solid[y * w + x]) continue;
      const n = (x > 0 && solid[y * w + x - 1]) || (x < w - 1 && solid[y * w + x + 1]) ||
                (y > 0 && solid[(y - 1) * w + x]) || (y < h - 1 && solid[(y + 1) * w + x]);
      if(n){
        const i = (y * w + x) * 4;
        d[i] = INK_RGB[0]; d[i + 1] = INK_RGB[1]; d[i + 2] = INK_RGB[2]; d[i + 3] = 255;
      }
    }
  }
}

/**
 * url 의 그림을 size(가장 긴 변, 픽셀 수)로 줄여 도트 아트 <canvas> 로 돌려준다.
 * 옵션: palette("sweetie"|"edg32"|"adaptive"|"none"), colors(adaptive 색 수), dither(0~1), punch, removeBg, outline
 * 표시할 때는 CSS 에서 image-rendering: pixelated 로 정수배 확대한다.
 */
export async function pixelize(url, { size = 48, palette = "sweetie", colors = 24, dither = 0, punch: boost = false, removeBg = false, outline: line = false } = {}){
  let im, canRead = true;
  try{ im = await loadImage(url, true); }
  catch(e){ im = await loadImage(url, false); canRead = false; }       // CORS 불가 → 줄이기만

  const pad = line ? 1 : 0;
  const k = size / Math.max(im.naturalWidth, im.naturalHeight);
  const iw = Math.max(1, Math.round(im.naturalWidth * k));
  const ih = Math.max(1, Math.round(im.naturalHeight * k));
  const w = iw + pad * 2, h = ih + pad * 2;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, pad, pad, iw, ih);

  if(canRead){
    try{
      const data = ctx.getImageData(0, 0, w, h);
      if(removeBg) removeBackground(data, w, h, 56, pad);
      if(boost) punch(data, w, h);
      const pal = palette === "none" ? null
                : palette === "adaptive" ? adaptivePalette(data, w, h, colors)
                : (PALETTES[palette] || PALETTES.sweetie);
      quantize(data, w, h, pal, dither);
      if(line) outline(data, w, h);
      ctx.putImageData(data, 0, 0);
    }catch(e){ /* 오염된 캔버스: 줄인 그림 그대로 */ }
  }
  cv.className = "pxart";
  return cv;
}
