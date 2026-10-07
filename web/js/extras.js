// 부가 정보: 결과가 먼저 뜬 뒤 늦게 도착하는 대로 덧붙인다 (실패해도 본 결과는 그대로).
//  - 문장(공백 포함): 언어 간 요소 대응   - 단어 하나: Wiktionary 정의 + Wikipedia 요약
import { $, el, LANGS, LANG_LABEL, LANG_TAG, LANG_COLOR, state } from "./util.js";

/* =========================================================
   부가 정보 (결과가 먼저 뜬 뒤 늦게 도착하는 대로 덧붙인다 — 실패해도 본 결과는 그대로)
   - 문장(공백 포함): 언어 간 요소 대응   - 단어 하나: Wiktionary 정의 + Wikipedia 요약
========================================================= */
const isSafeUrl = (u, host) => typeof u === "string" && u.startsWith("https://" + host + "/");

function fullTexts(d){
  const t = {}; t[d.source.lang] = d.source.text;
  d.translations.forEach(x => { t[x.lang] = x.text; });
  return t;
}

export function loadExtras(d){
  ["alignBox","dictBox"].forEach(id => { const b = $(id); b.textContent = ""; b.style.display = "none"; });
  if(/\s/.test(d.source.text)){
    if(d.engine.startsWith("NVIDIA")) loadAlign(d);
  }else{
    loadDictionary(d);
  }
}

async function postJson(url, body){
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  let j = null; try{ j = await res.json(); }catch(e){}
  if(!res.ok) throw new Error((j && j.error) || ("서버 오류 " + res.status));
  return j;
}

/* ---- 문장 요소 대응 ---- */
async function loadAlign(d){
  const box = $("alignBox");
  box.style.display = "block";
  box.textContent = "";
  box.appendChild(el("h3", null, "문장 요소 대응 — 같은 색끼리 같은 뜻"));
  const body = el("div", "meta", "대응 분석 중…");
  box.appendChild(body);
  try{
    const r = await postJson("/api/align", { texts: fullTexts(d) });
    if(state.currentData !== d) return;
    renderAlign(box, d, r.units);
  }catch(err){
    if(state.currentData !== d) return;
    body.className = "meta warn";
    body.textContent = "대응 분석을 불러오지 못했어요 (" + err.message + ")";
  }
}

const unitColor = i => `hsl(${(i * 47 + 12) % 360} 75% 86%)`;
const unitColorDark = i => `hsl(${(i * 47 + 12) % 360} 55% 48%)`;

// 문장 안에서 조각의 위치를 찾는다. 같은 조각이 겹치지 않게 이미 쓴 구간은 건너뛴다.
function locate(text, units, lang){
  const taken = [], found = [];
  units.forEach((u, i)=>{
    const p = u[lang];
    if(!p) return;
    let from = 0, at;
    while((at = text.indexOf(p, from)) !== -1){
      if(!taken.some(([a,b]) => at < b && at + p.length > a)){
        taken.push([at, at + p.length]); found.push({ start:at, end:at + p.length, i }); return;
      }
      from = at + 1;
    }
  });
  return found.sort((a,b) => a.start - b.start);
}

function renderAlign(box, d, units){
  box.textContent = "";
  box.appendChild(el("h3", null, "문장 요소 대응 — 같은 색끼리 같은 뜻 (칸에 마우스를 올려 보세요)"));
  const texts = fullTexts(d);

  LANGS.forEach(l=>{
    const line = el("div", "align-sent");
    const tag = el("span", "lang", LANG_TAG[l]); tag.style.background = LANG_COLOR[l];
    line.appendChild(tag);
    const s = el("span", "s");
    let pos = 0;
    locate(texts[l], units, l).forEach(f=>{
      if(f.start > pos) s.appendChild(document.createTextNode(texts[l].slice(pos, f.start)));
      const m = el("mark", "u", texts[l].slice(f.start, f.end));
      m.dataset.u = f.i;
      m.style.setProperty("--c", unitColor(f.i));
      m.style.setProperty("--c-dark", unitColorDark(f.i));
      s.appendChild(m);
      pos = f.end;
    });
    if(pos < texts[l].length) s.appendChild(document.createTextNode(texts[l].slice(pos)));
    line.appendChild(s);
    box.appendChild(line);
  });

  const table = el("table", "align");
  const head = el("tr");
  LANGS.forEach(l=>{ const th = el("th", null, LANG_TAG[l]); th.style.background = LANG_COLOR[l]; head.appendChild(th); });
  head.appendChild(el("th", null, "뜻")); head.lastChild.style.background = "var(--ink-soft)";
  table.appendChild(head);
  units.forEach((u, i)=>{
    const tr = el("tr"); tr.dataset.u = i;
    LANGS.forEach(l=>{
      const td = el("td");
      if(u[l]){
        const c = el("span", "chip", u[l]); c.style.setProperty("--c", unitColor(i)); td.appendChild(c);
      }else{ td.className = "none"; td.textContent = "—"; }
      tr.appendChild(td);
    });
    tr.appendChild(el("td", "gloss", u.gloss || ""));
    table.appendChild(tr);
  });
  box.appendChild(table);
  box.appendChild(el("div", "src-link", "AI가 나눈 대응이라 어색할 수 있어요. 문장에 실제로 있는 조각만 표시합니다."));

  const toggle = (idx, on)=>{
    box.querySelectorAll(`[data-u="${idx}"]`).forEach(n => n.classList.toggle("on", on));
  };
  box.onmouseover = e=>{ const n = e.target.closest("[data-u]"); if(n) toggle(n.dataset.u, true); };
  box.onmouseout  = e=>{ const n = e.target.closest("[data-u]"); if(n) toggle(n.dataset.u, false); };
}

/* ---- 단어: Wiktionary + Wikipedia ---- */
async function loadDictionary(d){
  const word = d.source.text, lang = d.source.lang;
  const en = lang === "en" ? null : (d.translations.find(t => t.lang === "en") || {}).text;
  const isNoun = /noun|명사/i.test(d.pos || "");
  const wikiTitle = lang === "en" ? word : en;
  const jobs = [
    fetchJson(`/api/wiktionary?word=${encodeURIComponent(word)}&lang=${lang}` +
              (en ? `&check=${encodeURIComponent(en)}` : "")).then(r => ({ wikt:r })).catch(() => null),
    (isNoun && wikiTitle) ? fetchJson(`/api/wikipedia?title=${encodeURIComponent(wikiTitle)}`)
                              .then(r => ({ wiki:r })).catch(() => null) : Promise.resolve(null)
  ];
  const [a, b] = await Promise.all(jobs);
  if(state.currentData !== d) return;
  const wikt = a && a.wikt, wiki = b && b.wiki;
  const box = $("dictBox");
  box.textContent = "";
  if(wikt && wikt.found){
    box.appendChild(el("h3", null, `사전 (Wiktionary) — ${LANG_LABEL[lang]} '${word}'`));
    if(typeof wikt.confirmed === "boolean"){
      box.appendChild(el("div", "verify " + (wikt.confirmed ? "ok" : "no"), wikt.confirmed
        ? `✓ 사전 확인됨 — 정의에 영어 번역 '${en}'이(가) 있어요.`
        : `⚠ 사전 정의에서 '${en}'을(를) 찾지 못했어요. 모델이 다른 표현을 썼거나 틀렸을 수 있어요.`));
    }
    wikt.entries.forEach(en_=>{
      const div = el("div", "dict-entry");
      div.appendChild(el("b", null, en_.pos));
      const ol = el("ol");
      en_.defs.forEach(t => ol.appendChild(el("li", null, t)));
      div.appendChild(ol);
      box.appendChild(div);
    });
    if(isSafeUrl(wikt.url, "en.wiktionary.org")){
      const p = el("div", "src-link"); const a_ = el("a", null, "Wiktionary에서 더 보기");
      a_.href = wikt.url; a_.target = "_blank"; a_.rel = "noopener noreferrer";
      p.appendChild(a_); box.appendChild(p);
    }
  }else if(a){
    box.appendChild(el("h3", null, "사전 (Wiktionary)"));
    box.appendChild(el("div", "meta", "Wiktionary에 이 단어 항목이 없어요."));
  }
  if(wiki && wiki.found){
    const card = el("div", "wiki-card");
    if(wiki.thumbnail && (isSafeUrl(wiki.thumbnail, "upload.wikimedia.org") || isSafeUrl(wiki.thumbnail, "thumb.wikimedia.org"))){
      const img = el("img"); img.src = wiki.thumbnail; img.alt = wiki.title; img.loading = "lazy";
      img.referrerPolicy = "no-referrer"; card.appendChild(img);
    }
    const t = el("div", "wtxt");
    t.appendChild(el("b", null, `Wikipedia: ${wiki.title}`));
    t.appendChild(el("div", null, wiki.extract));
    const note = el("div", "src-link", "단어와 뜻이 정확히 같지 않을 수 있는 참고 항목이에요. ");
    if(isSafeUrl(wiki.url, "en.wikipedia.org")){
      const l = el("a", null, "원문 보기"); l.href = wiki.url; l.target = "_blank"; l.rel = "noopener noreferrer";
      note.appendChild(l);
    }
    t.appendChild(note); card.appendChild(t);
    box.appendChild(card);
  }
  box.style.display = box.childNodes.length ? "block" : "none";
}

async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
