// 배틀 아레나: 검색 1회 = 한 라운드 (등장 > 싸움 > 승부 > 진 쪽 퇴장). 사용자 입력은 전혀 보내지 않는다.
//
// 이긴 쪽은 자리에 남고, 빈 자리에 새 도전자가 나타난다.
// 그림은 모두 도트로 맞춘다:
//  - 포켓몬(1~5세대, 649종): PokeAPI/sprites 의 애니메이션 픽셀 스프라이트. 왼쪽은 뒷모습, 오른쪽은 앞모습.
//  - 디지몬(digi-api.com): 일러스트를 32색 도트 아트로 실시간 변환 (배경 제거 + 외곽선).
import { $, el } from "./util.js";
import { icon, spriteSVG, BURST } from "./pixel.js";
import { typeInto, burst, reducedMotion } from "./fx.js";
import { pixelize } from "./pixelize.js";

export const Arena = (function(){
  const POKE_MAX = 649;                              // 650번부터는 픽셀 스프라이트가 없다(3D 렌더)
  const reduce = reducedMotion();
  const scene = $("scene");
  const slots = { L: $("slotL"), R: $("slotR") };
  const stats = { L: $("statL"), R: $("statR") };
  const occupant = { L: null, R: null };             // 슬롯별 { f, node, fill, hp }
  let pending = 0, running = false, fast = false, nextFighter = null, digiTotal = 0;

  const rand = n => Math.floor(Math.random() * n);
  const sleep = ms => new Promise(r => setTimeout(r, reduce ? 120 : (fast ? 25 : ms)));
  const say = t => typeInto($("arenaMsg"), t, { instant: fast, delay: 22 });

  async function getJson(url){
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 8000);
    try{
      const r = await fetch(url, { signal:c.signal });
      if(!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }

  // 허용된 출처의 그림만, 미리 받아 둔 뒤에 등장시킨다 (깨진 그림이 튀어나오지 않도록). 크기도 함께 잰다.
  function preload(url){
    const ok = typeof url === "string" && url.startsWith("https://raw.githubusercontent.com/PokeAPI/sprites/");
    if(!ok) return Promise.resolve(null);
    return new Promise(res=>{
      const im = new Image(); const to = setTimeout(() => res(null), 8000);
      im.referrerPolicy = "no-referrer";
      im.onload = () => { clearTimeout(to); res({ url, w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = () => { clearTimeout(to); res(null); };
      im.src = url;
    });
  }

  async function fetchPokemon(){
    const id = 1 + rand(POKE_MAX);
    const [p, s] = await Promise.all([
      getJson("https://pokeapi.co/api/v2/pokemon/" + id),
      getJson("https://pokeapi.co/api/v2/pokemon-species/" + id).catch(() => null)
    ]);
    const ko = s && (s.names || []).find(n => n.language.name === "ko");
    const anim = (((p.sprites.versions || {})["generation-v"] || {})["black-white"] || {}).animated || {};
    const frontUrl = anim.front_default || p.sprites.front_default;
    const backUrl = anim.back_default || p.sprites.back_default || null;
    const [front, back] = await Promise.all([preload(frontUrl), backUrl ? preload(backUrl) : null]);
    if(!front) throw new Error("sprite");
    return { kind:"p", name: ko ? ko.name : p.name, en: p.name, front, back,
             power: p.stats.reduce((a, x) => a + x.base_stat, 0) };
  }
  async function fetchDigimon(){
    if(!digiTotal){
      const r = await getJson("https://digi-api.com/api/v1/digimon?pageSize=1");
      digiTotal = (r.pageable && r.pageable.totalElements) || 1000;
    }
    const r = await getJson(`https://digi-api.com/api/v1/digimon?page=${rand(digiTotal)}&pageSize=1`);
    const d = r.content && r.content[0];
    if(!d || typeof d.image !== "string" || !d.image.startsWith("https://digi-api.com/images/")) throw new Error("empty");
    const canvas = await pixelize(d.image, { size: 46, palette: "edg32", removeBg: true, outline: true });
    return { kind:"d", name:d.name, en:d.name, canvas,
             power: 250 + rand(350) };                 // 디지몬은 능력치 데이터가 없어 무작위
  }
  async function makeFighter(){
    const order = Math.random() < 0.5 ? [fetchPokemon, fetchDigimon] : [fetchDigimon, fetchPokemon];
    for(const fn of order){
      try{ return await fn(); }catch(e){ /* 다른 소스로 */ }
    }
    return { kind:"p", name:"???", en:"???", power:400, fallback:true };    // 오프라인 대비
  }
  const prefetch = () => { nextFighter = makeFighter(); };

  function setHp(o, p){
    o.hp = p;
    o.fill.style.width = p + "%";
    o.fill.className = p <= 20 ? "low" : p <= 50 ? "mid" : "";
  }

  // 그림을 정수배로 키운다 (픽셀이 뭉개지지 않게). 슬롯 크기(--smax)에 맞는 가장 큰 정수배.
  function scaleFor(w, h){
    const smax = parseFloat(getComputedStyle($("arena")).getPropertyValue("--smax")) || 104;
    return Math.max(1, Math.floor(smax / Math.max(w, h)));
  }

  function spriteFor(side, f){
    if(f.canvas){
      const cv = f.canvas, s = scaleFor(cv.width, cv.height);
      cv.style.width = cv.width * s + "px";
      cv.style.height = cv.height * s + "px";
      cv.classList.add("sprite");
      if(side === "L") cv.classList.add("flip");        // 왼쪽 전사는 오른쪽(상대)을 본다
      return cv;
    }
    if(f.front){
      // 왼쪽은 뒷모습(없으면 앞모습을 뒤집어서), 오른쪽은 앞모습
      const useBack = side === "L" && f.back;
      const spr = useBack ? f.back : f.front;
      const img = new Image();
      img.className = "sprite" + (side === "L" && !f.back ? " flip" : "");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = spr.url;
      const s = scaleFor(spr.w, spr.h);
      img.style.width = spr.w * s + "px";
      img.style.height = spr.h * s + "px";
      return img;
    }
    const q = el("div", "sprite qmark", "?");           // 그림을 못 받았을 때
    return q;
  }

  function place(side, f){
    const slot = slots[side];
    slot.appendChild(el("div", "pad"));
    const node = el("div", "fighter");
    node.appendChild(spriteFor(side, f));
    slot.appendChild(node);

    const box = el("div", "fstat");
    const nm = el("div", "fname");
    nm.append(el("i", "fkind " + f.kind, f.kind === "p" ? "포켓몬" : "디지몬"), el("span", "fn", f.name));
    nm.title = f.en;
    const hp = el("div", "hp");
    const bar = el("div", "bar"), fill = el("i");
    bar.appendChild(fill);
    hp.append(el("span", "lab", "HP"), bar);
    box.append(nm, hp);
    stats[side].appendChild(box);

    const o = { f, node, fill, hp: 100 };
    setHp(o, 100);
    occupant[side] = o;
    return o;
  }
  function remove(side){
    slots[side].textContent = "";
    stats[side].textContent = "";
    occupant[side] = null;
  }

  function pop(o, text){
    const d = el("span", "dmg", text); o.node.appendChild(d);
    setTimeout(() => d.remove(), 850);
  }
  function hitFx(o){
    scene.classList.add("flash", "shake");
    setTimeout(() => scene.classList.remove("flash", "shake"), 320);
    if(reduce) return;
    const b = spriteSVG(BURST, { w:"#f4f4f4", y:"#ffcd75" }, 4);
    b.classList.add("burst");
    o.node.appendChild(b);
    setTimeout(() => b.remove(), 340);
  }
  const addTemp = (node, cls, ms) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };

  function updateStreak(){
    const box = $("arenaStreak");
    box.textContent = "";
    const champ = occupant.L || occupant.R;
    const n = champ && champ.f.streak || 0;
    if(n >= 1){
      box.append(icon("crown", 16), document.createTextNode(`${champ.f.name} ${n}연승`));
    }
  }

  function confettiAt(side, o){
    const host = slots[side].getBoundingClientRect(), r = o.node.getBoundingClientRect();
    burst(slots[side], r.left - host.left + r.width / 2, r.top - host.top + r.height / 3, { count: 12, dist: 54 });
  }

  async function oneRound(){
    // 1) 빈 자리 확인 — 챔피언이 없으면 먼저 한 명 세운다
    if(!occupant.L && !occupant.R){
      const first = await (nextFighter || makeFighter()); nextFighter = null;
      const o = place("L", first); addTemp(o.node, "enter", 800);
    }
    const champSide = occupant.L ? "L" : "R";
    const chalSide = champSide === "L" ? "R" : "L";
    const champ = occupant[champSide];
    setHp(champ, 100);

    // 2) 등장
    await say("도전자를 찾는 중…");
    const f = await (nextFighter || makeFighter()); nextFighter = null;
    prefetch();                                          // 다음 라운드용을 미리 받아 둔다
    const chal = place(chalSide, f);
    chal.node.classList.add("enter");
    await say(`야생의 ${f.name}이(가) 나타났다!`);
    await sleep(500);
    chal.node.classList.remove("enter");

    // 3) 싸움 — 승자는 종족값(디지몬은 무작위) 비례 확률로 미리 정하고, 연출은 그에 맞춘다
    const pc = champ.f.power, pf = chal.f.power;
    const champWins = Math.random() < pc / (pc + pf);
    const winner = champWins ? champ : chal, loser = champWins ? chal : champ;
    const wSide = champWins ? champSide : chalSide;
    const lSide = wSide === "L" ? "R" : "L";
    $("vsMark").classList.add("fight");
    await say(`${champ.f.name} vs ${chal.f.name} — 승부!`);
    await sleep(300);
    const hits = [                                       // 서로 주고받다가 마지막 일격은 항상 승자
      { a:winner, t:loser,  to:70 },
      { a:loser,  t:winner, to:82 },
      { a:winner, t:loser,  to:36 },
      { a:loser,  t:winner, to:50 + rand(20) },
      { a:winner, t:loser,  to:0 }
    ];
    for(const h of hits){
      say(`${h.a.f.name}의 공격!`);
      addTemp(h.a.node, "atk", 400);
      await sleep(190);
      addTemp(h.t.node, "hit", 400);
      hitFx(h.t);
      pop(h.t, "-" + Math.max(1, Math.round(h.t.hp - h.to)));
      setHp(h.t, h.to);
      await sleep(420);
    }
    $("vsMark").classList.remove("fight");

    // 4) 승부 → 퇴장
    winner.f.streak = (winner.f.streak || 0) + 1;
    loser.f.streak = 0;
    await say(`${loser.f.name}은(는) 쓰러졌다!`);
    loser.node.classList.add("ko");
    await sleep(900);
    remove(lSide);
    say(`${winner.f.name} 승리!` + (winner.f.streak > 1 ? ` (${winner.f.streak}연승)` : ""));
    addTemp(winner.node, "victory", 1100);     // (.win 은 창 스타일 클래스라 이름이 겹치면 안 된다)
    confettiAt(wSide, winner);
    updateStreak();
    await sleep(1000);
    setHp(winner, 100);                                  // 한숨 돌리며 HP 회복
    await say(`${winner.f.name}이(가) 다음 도전자를 기다리는 중`);
  }

  async function loop(){
    running = true;
    while(pending > 0){
      pending--;
      fast = pending > 0;                                // 대기 중인 검색이 있으면 빨리 감기
      try{ await oneRound(); }catch(e){ say("배틀 준비 중 문제가 생겼어요 — 다음 검색에서 다시!"); }
      fast = false;
    }
    running = false;
  }

  return {
    init(){
      // 첫 화면부터 챔피언이 서 있게 한다 (이미 라운드가 시작됐다면 다음 도전자로 넘긴다)
      makeFighter().then(f=>{
        if(!running && !occupant.L && !occupant.R){
          const o = place("L", f); addTemp(o.node, "enter", 800);
          say(`${f.name}이(가) 도전자를 기다리는 중`);
          prefetch();
        }else if(!nextFighter) nextFighter = Promise.resolve(f);
      });
    },
    go(){
      pending = Math.min(pending + 1, 2);
      if(running) fast = true; else loop();
    }
  };
})();
