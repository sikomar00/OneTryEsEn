// 그리기: 정리된 결과 데이터를 DOM에 꽂는다. 모든 문자열은 textContent로만 넣는다 (XSS 방지).
import { $, el, LANGS, LANG_LABEL, LANG_TAG, LANG_COLOR } from "./util.js";

/* =========================================================
   그리기 (DOM 렌더링) — 모든 문자열은 textContent로만 넣는다 (XSS 방지)
========================================================= */
export function setStatus(msg, isError){
  const s = $("statusMsg");
  s.textContent = msg || "";
  s.className = "status" + (isError ? " error" : "");
}

// 항상 EN | ES | KO 순서로 놓는다 — 입력 언어가 바뀌어도 눈이 가는 위치가 같다.
const LANG_BG = { en:"var(--en-bg)", es:"var(--es-bg)", ko:"var(--ko-bg)" };
function langCard(lang){
  const card = el("div","lcard");
  card.style.setProperty("--c", LANG_COLOR[lang]);
  card.style.setProperty("--cbg", LANG_BG[lang]);
  const head = el("div","lhead");
  head.appendChild(el("span","ltag", `${LANG_TAG[lang]} · ${LANG_LABEL[lang]}`));
  card.appendChild(head);
  return { card, head };
}

export function showResultArea(){
  $("emptyState").style.display = "none";
  $("resultPanel").style.display = "block";
}

export function renderSkeleton(){
  const host = $("resultRows");
  host.textContent = "";
  LANGS.forEach(l=>{
    const c = langCard(l);
    c.card.appendChild(el("div","skel"));
    c.card.appendChild(el("div","skel s"));
    host.appendChild(c.card);
  });
  ["extraBox","alignBox","dictBox"].forEach(id => { $(id).style.display = "none"; });
  $("resultTitle").textContent = "";
  $("saveMsg").textContent = "";
}

export function renderResult(d){
  showResultArea();
  $("saveMsg").textContent = "";
  const title = $("resultTitle");
  title.textContent = "";
  title.appendChild(el("b", null, d.source.text.length > 40 ? d.source.text.slice(0,40) + "…" : d.source.text));
  title.appendChild(document.createTextNode(` · ${LANG_LABEL[d.source.lang]}로 인식 · ${d.engine.replace("NVIDIA nvidia/", "NVIDIA · ")}`));

  const host = $("resultRows");
  host.textContent = "";
  const byLang = {};
  d.translations.forEach(t => { byLang[t.lang] = t; });

  LANGS.forEach(l=>{
    const c = langCard(l);
    const isSrc = l === d.source.lang;
    const t = byLang[l];
    if(isSrc){
      c.card.classList.add("src");
      c.head.appendChild(el("span","badge","입력"));
    }
    const txt = el("div","ltext", isSrc ? d.source.text : t.text);
    if(isSrc && d.pos) txt.appendChild(el("span","pos", d.pos));
    c.card.appendChild(txt);
    if(isSrc && d.source.ambiguous)
      c.card.appendChild(el("div","meta warn", "입력 언어가 애매해요 — 검색창 옆 언어 선택으로 직접 지정해 보세요."));
    if(!isSrc){
      if(t.alternatives && t.alternatives.length){
        const alts = el("div","alts");
        t.alternatives.forEach(a => alts.appendChild(el("span", null, a)));
        c.card.appendChild(alts);
      }
      if(t.pivoted)
        c.card.appendChild(el("div","meta", "영어를 거쳐 번역됨" + (t.via ? ` (중간 영어: "${t.via}")` : "")));
      if(t.lowConfidence)
        c.card.appendChild(el("div","meta warn", "⚠ 입력과 정확히 일치하는 번역이 아니에요 (참고용)"));
    }
    host.appendChild(c.card);
  });

  const extra = $("extraBox");
  extra.textContent = "";
  const exKeys = LANGS.filter(l => d.example && d.example[l]);
  if(exKeys.length){
    extra.appendChild(el("h3", null, "예문"));
    exKeys.forEach(l=>{
      const line = el("div","ex-line");
      line.appendChild(el("b",null, LANG_TAG[l]));
      line.appendChild(document.createTextNode(d.example[l]));
      extra.appendChild(line);
    });
  }
  if(d.note) extra.appendChild(el("div","note", "💡 " + d.note));
  extra.style.display = extra.childNodes.length ? "block" : "none";
}
