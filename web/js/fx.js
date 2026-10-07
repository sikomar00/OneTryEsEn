// 시각 효과: 타자기(글자가 한 자씩 찍힘), 별가루 터짐. 움직임 줄이기 설정이면 즉시 표시/생략한다.
export const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * node 안에 text 를 타자기처럼 채운다.
 * 스크린리더에는 전체 문장을 한 번에(.sr-only), 화면에는 타자 효과(aria-hidden)로 보여줘서
 * aria-live 영역에서 글자 하나마다 읽히는 문제를 피한다.
 *  - reserve: 전체 글을 보이지 않게(.ghost) 깔아 자리를 미리 잡는다 → 타자 중에 카드 높이가 흔들리지 않는다.
 *  - startDelay: 타자를 시작하기 전 대기(ms) — 카드 3장을 차례로 찍을 때 쓴다.
 * 반환: 타자가 끝나면 resolve 되는 Promise. 같은 node 에 다시 부르면 앞의 타자는 멈춘다.
 */
export function typeInto(node, text, { delay = 26, maxTicks = 48, instant = false, reserve = false, startDelay = 0 } = {}){
  if(node._typing){ clearTimeout(node._typing); node._typing = null; }
  node.textContent = "";
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  const vis = document.createElement("span");
  vis.setAttribute("aria-hidden", "true");
  if(reserve){
    const ghost = document.createElement("span");
    ghost.className = "ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = text;
    vis.className = "vis";
    node.append(sr, ghost, vis);
  }else{
    node.append(sr, vis);
  }

  const chars = Array.from(text);                       // 한글·이모지 안전
  if(instant || reducedMotion() || chars.length === 0){
    vis.textContent = text;
    return Promise.resolve();
  }
  const per = Math.max(1, Math.ceil(chars.length / maxTicks));   // 긴 글은 한 번에 여러 글자
  let i = 0;
  return new Promise(resolve=>{
    const tick = ()=>{
      i = Math.min(chars.length, i + per);
      vis.textContent = chars.slice(0, i).join("");
      if(i < chars.length){ node._typing = setTimeout(tick, delay); }
      else { node._typing = null; resolve(); }
    };
    if(startDelay > 0) node._typing = setTimeout(tick, startDelay); else tick();
  });
}

const SPARK_COLORS = ["#ffcd75", "#73eff7", "#a7f070", "#ef7d57", "#f4f4f4", "#41a6f6"];

/** host(position:relative) 안의 (x, y) 에서 네모 별가루가 터진다. 모두 4px 격자에 맞춰 움직인다. */
export function burst(host, x, y, { count = 10, dist = 44, size = 4, colors = SPARK_COLORS } = {}){
  if(reducedMotion() || !host.animate) return;
  for(let i = 0; i < count; i++){
    const p = document.createElement("i");
    p.className = "spark";
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.width = p.style.height = size + "px";
    p.style.background = colors[i % colors.length];
    host.appendChild(p);
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const d = dist * (0.55 + Math.random() * 0.6);
    const snap = v => Math.round(v / size) * size;
    const dx = snap(Math.cos(ang) * d), dy = snap(Math.sin(ang) * d);
    const a = p.animate([
      { transform: "translate(0,0)", opacity: 1 },
      { transform: `translate(${dx}px,${dy}px)`, opacity: 1, offset: 0.65 },
      { transform: `translate(${dx}px,${dy + 12}px)`, opacity: 0 },
    ], { duration: 720, easing: "steps(8)" });
    a.onfinish = () => p.remove();
  }
}
