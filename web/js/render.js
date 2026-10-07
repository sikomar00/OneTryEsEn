// 그리기: 정리된 결과 데이터를 DOM에 꽂는다. 모든 문자열은 textContent로만 넣는다 (XSS 방지).
import { $, el, LANGS, LANG_LABEL, LANG_TAG, LANG_COLOR } from "./util.js";
import { icon } from "./pixel.js";
import { typeInto } from "./fx.js";
import { Mascot } from "./mascot.js";

/**
 * 마스코트 말풍선 상태 표시.
 * kind: "idle"(대기) | "busy"(조회 중) | "ok"(성공) | "error"(실패)  — true 를 주면 "error"
 * idle + 빈 메시지면 사용 팁을 돌려가며 말한다.
 */
let dotsTimer = null;
function setDots(on){
  const p = $("statusMsg");
  clearInterval(dotsTimer);
  dotsTimer = null;
  if(!on){ delete p.dataset.dots; return; }
  let n = 0;
  p.dataset.dots = "";
  dotsTimer = setInterval(()=>{ n = (n + 1) % 4; p.dataset.dots = ".".repeat(n); }, 300);
}

export function setStatus(msg, kind = "idle"){
  if(kind === true) kind = "error";
  $("bubble").dataset.kind = kind;
  setDots(kind === "busy");
  Mascot.setMood(kind === "ok" ? "happy" : kind);
  if(kind === "idle" && !msg){ Mascot.showTips(); return; }
  Mascot.stopTips();
  typeInto($("statusMsg"), msg || "");
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

function metaLine(cls, iconName, text){
  const m = el("div", cls);
  m.append(icon(iconName, 16), document.createTextNode(text));
  return m;
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
  const engineName = d.engine.startsWith("NVIDIA") ? "NVIDIA" : d.engine;     // 모델 이름은 툴팁으로
  title.title = d.engine;
  title.appendChild(document.createTextNode(` ${LANG_LABEL[d.source.lang]}로 인식 · ${engineName}`));

  const host = $("resultRows");
  host.textContent = "";
  const byLang = {};
  d.translations.forEach(t => { byLang[t.lang] = t; });

  LANGS.forEach((l, idx)=>{
    const c = langCard(l);
    const isSrc = l === d.source.lang;
    const t = byLang[l];
    if(isSrc){
      c.card.classList.add("src");
      const badge = el("span","badge");
      badge.append(icon("star", 8), document.createTextNode("입력"));
      c.head.appendChild(badge);
    }
    // 글이 한 자씩 찍힌다 (카드마다 조금씩 늦게 시작). 자리는 미리 잡아서 높이가 흔들리지 않는다.
    const txt = el("div","ltext");
    const tt = el("span","tt");
    txt.appendChild(tt);
    if(isSrc && d.pos) txt.appendChild(el("span","pos", d.pos));
    typeInto(tt, isSrc ? d.source.text : t.text, { delay: 22, reserve: true, startDelay: 140 + idx * 160 });
    c.card.appendChild(txt);

    if(isSrc && d.source.ambiguous)
      c.card.appendChild(metaLine("meta warn", "warn", "입력 언어가 애매해요 — 검색창 옆 언어 선택으로 직접 지정해 보세요."));
    if(!isSrc){
      if(t.alternatives && t.alternatives.length){
        const alts = el("div","alts");
        t.alternatives.forEach(a => alts.appendChild(el("span", null, a)));
        c.card.appendChild(alts);
      }
      if(t.pivoted)
        c.card.appendChild(el("div","meta", "영어를 거쳐 번역됨" + (t.via ? ` (중간 영어: "${t.via}")` : "")));
      if(t.lowConfidence)
        c.card.appendChild(metaLine("meta warn", "warn", "입력과 정확히 일치하는 번역이 아니에요 (참고용)"));
    }
    host.appendChild(c.card);
  });

  const extra = $("extraBox");
  extra.textContent = "";
  const exKeys = LANGS.filter(l => d.example && d.example[l]);
  if(exKeys.length || d.note){
    const h = el("h3");
    h.append(icon(exKeys.length ? "book" : "bulb", 16), document.createTextNode(exKeys.length ? "예문" : "한마디"));
    extra.appendChild(h);
  }
  if(exKeys.length){
    exKeys.forEach(l=>{
      const line = el("div","ex-line");
      line.appendChild(el("b", l, LANG_TAG[l]));
      line.appendChild(document.createTextNode(d.example[l]));
      extra.appendChild(line);
    });
  }
  if(d.note){
    const n = el("div","note");
    n.append(icon("bulb", 16), document.createTextNode(d.note));
    extra.appendChild(n);
  }
  extra.style.display = extra.childNodes.length ? "block" : "none";
}
