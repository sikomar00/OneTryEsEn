// 배틀 아레나: 검색 1회 = 한 라운드 (등장 > 싸움 > 승부 > 진 쪽 퇴장). 사용자 입력은 전혀 보내지 않는다.
import { $, el } from "./util.js";

/* =========================================================
   배틀 아레나 — 검색 1회마다 한 라운드: 등장 > 싸움 > 승부 > (진 쪽) 퇴장
   이긴 쪽은 자리에 남고, 빈 자리에 새 도전자가 나타난다.
   데이터: PokeAPI(포켓몬 1025종, 한국어 이름) / digi-api.com(디지몬). 사용자 입력은 전혀 보내지 않는다.
========================================================= */
export const Arena = (function(){
  const POKE_MAX = 1025;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const slots = { L: $("slotL"), R: $("slotR") };
  const occupant = { L: null, R: null };     // 슬롯별 { f:fighter, node, hpFill, hp }
  let pending = 0, running = false, fast = false, nextFighter = null, digiTotal = 0;

  const rand = n => Math.floor(Math.random() * n);
  const sleep = ms => new Promise(r => setTimeout(r, reduce ? 120 : (fast ? 25 : ms)));
  const say = t => { $("arenaMsg").textContent = t; };

  async function getJson(url){
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 8000);
    try{
      const r = await fetch(url, { signal:c.signal });
      if(!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }
  // 이미지는 허용된 출처만, 그리고 미리 받아 둔 뒤에 등장시킨다 (깨진 그림이 튀어나오지 않도록)
  function preload(url){
    const ok = typeof url === "string" && (url.startsWith("https://raw.githubusercontent.com/PokeAPI/sprites/") ||
                                           url.startsWith("https://digi-api.com/images/"));
    if(!ok) return Promise.resolve(false);
    return new Promise(res=>{
      const im = new Image(); const to = setTimeout(() => res(false), 8000);
      im.referrerPolicy = "no-referrer";
      im.onload = () => { clearTimeout(to); res(true); };
      im.onerror = () => { clearTimeout(to); res(false); };
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
    const img = (p.sprites.other && p.sprites.other["official-artwork"].front_default) || p.sprites.front_default;
    return { kind:"p", name: ko ? ko.name : p.name, en: p.name, img,
             power: p.stats.reduce((a, x) => a + x.base_stat, 0) };
  }
  async function fetchDigimon(){
    if(!digiTotal){
      const r = await getJson("https://digi-api.com/api/v1/digimon?pageSize=1");
      digiTotal = (r.pageable && r.pageable.totalElements) || 1000;
    }
    const r = await getJson(`https://digi-api.com/api/v1/digimon?page=${rand(digiTotal)}&pageSize=1`);
    const d = r.content && r.content[0];
    if(!d) throw new Error("empty");
    return { kind:"d", name:d.name, en:d.name, img:d.image, power: 250 + rand(350) };  // 디지몬은 능력치 데이터가 없어 무작위
  }
  async function makeFighter(){
    const order = Math.random() < 0.5 ? [fetchPokemon, fetchDigimon] : [fetchDigimon, fetchPokemon];
    for(const fn of order){
      try{
        const f = await fn();
        f.imgOk = await preload(f.img);
        if(f.imgOk) return f;
      }catch(e){ /* 다른 소스로 */ }
    }
    return { kind:"p", name:"???", en:"???", img:"", imgOk:false, power:400, emoji:"👾" };   // 오프라인 대비
  }
  const prefetch = () => { nextFighter = makeFighter(); };

  function hpColor(p){ return `hsl(${Math.max(0, Math.min(120, p * 1.2))} 60% 45%)`; }
  function setHp(o, p){ o.hp = p; o.hpFill.style.width = p + "%"; o.hpFill.style.backgroundColor = hpColor(p); }

  function place(side, f){
    const node = el("div", "fighter");
    const hp = el("div", "hp"), fill = el("i"); hp.appendChild(fill);
    node.appendChild(hp);
    if(f.imgOk){
      const img = el("img"); img.src = f.img; img.alt = ""; img.referrerPolicy = "no-referrer"; img.decoding = "async";
      if(f.kind === "d") img.className = "blend";
      node.appendChild(img);
    }else node.appendChild(el("div", "emoji", f.emoji || "❓"));
    const nm = el("div", "fname");
    nm.appendChild(el("span", "fkind " + f.kind, f.kind === "p" ? "포켓몬" : "디지몬"));
    nm.appendChild(document.createTextNode(f.name));
    nm.title = f.en;
    node.appendChild(nm);
    slots[side].appendChild(node);
    const o = { f, node, hpFill: fill, hp: 100 };
    setHp(o, 100);
    occupant[side] = o;
    return o;
  }
  function remove(side){
    const o = occupant[side];
    if(o && o.node.parentNode) o.node.parentNode.removeChild(o.node);
    occupant[side] = null;
  }
  function pop(o, text){
    const d = el("span", "dmg", text); o.node.appendChild(d);
    setTimeout(() => d.remove(), 850);
  }
  const addTemp = (node, cls, ms) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
  function updateStreak(){
    const champ = occupant.L || occupant.R;
    const n = champ && champ.f.streak || 0;
    $("arenaStreak").textContent = n >= 1 ? `👑 ${champ.f.name} ${n}연승` : "";
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
    say("도전자를 찾는 중…");
    const f = await (nextFighter || makeFighter()); nextFighter = null;
    prefetch();                                   // 다음 라운드용을 미리 받아 둔다
    const chal = place(chalSide, f);
    chal.node.classList.add("enter");
    say(`${f.name} 등장!`);
    await sleep(900); chal.node.classList.remove("enter");

    // 3) 싸움 — 승자는 종족값(디지몬은 무작위) 비례 확률로 미리 정하고, 연출은 그에 맞춘다
    const pc = champ.f.power, pf = chal.f.power;
    const champWins = Math.random() < pc / (pc + pf);
    const winner = champWins ? champ : chal, loser = champWins ? chal : champ;
    const wSide = champWins ? champSide : chalSide;
    $("vsMark").classList.add("fight");
    say(`${champ.f.name} vs ${chal.f.name} — 싸움!`);
    const hits = [                                      // 서로 주고받다가 마지막 일격은 항상 승자
      { a:winner, t:loser,  to:70 },
      { a:loser,  t:winner, to:82 },
      { a:winner, t:loser,  to:36 },
      { a:loser,  t:winner, to:50 + rand(20) },
      { a:winner, t:loser,  to:0 }
    ];
    for(const h of hits){
      addTemp(h.a.node, "atk", 400);
      await sleep(190);
      addTemp(h.t.node, "hit", 400);
      pop(h.t, "-" + Math.max(1, Math.round(h.t.hp - h.to)));
      setHp(h.t, h.to);
      await sleep(420);
    }
    $("vsMark").classList.remove("fight");

    // 4) 승부 → 퇴장
    winner.f.streak = (winner.f.streak || 0) + 1;
    loser.f.streak = 0;
    say(`${winner.f.name} 승리!` + (winner.f.streak > 1 ? ` (${winner.f.streak}연승)` : ""));
    addTemp(winner.node, "win", 1200);
    await sleep(500);
    loser.node.classList.add("ko");
    await sleep(850);
    remove(wSide === "L" ? "R" : "L");
    updateStreak();
    await sleep(250);
    say(`${winner.f.name}이(가) 다음 도전자를 기다리는 중`);
  }

  async function loop(){
    running = true;
    while(pending > 0){
      pending--;
      fast = pending > 0;                         // 대기 중인 검색이 있으면 빨리 감기
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
