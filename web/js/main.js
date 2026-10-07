// 진입점: 이벤트 연결. 조회 흐름 = 엔진 호출 → 그리기 호출.
import { $, el, MAX_CHARS, LANGS, SPEECH_LOCALE, state } from "./util.js";
import { lookupNvidia, lookupMyMemory } from "./engines.js";
import { loadVocab, saveVocab, renderVocabList, exportCsv, levelOf } from "./vocab.js";
import { setStatus, showResultArea, renderSkeleton, renderResult } from "./render.js";
import { loadExtras } from "./extras.js";
import { Arena } from "./arena.js";
import { Mascot, frameRows, MASCOT_COLORS } from "./mascot.js";
import { hydrateIcons, icon, spriteMarkup } from "./pixel.js";
import { initSky } from "./sky.js";
import { burst } from "./fx.js";

/* =========================================================
   시작: 배경·아이콘·마스코트를 먼저 세운다
========================================================= */
initSky();
hydrateIcons();
Mascot.init();
{
  // 탭 아이콘도 슬라임
  const fav = document.querySelector('link[rel="icon"]');
  if(fav) fav.href = "data:image/svg+xml," + encodeURIComponent(spriteMarkup(frameRows("idle"), MASCOT_COLORS, 1));
}

/* =========================================================
   엔진 선택 (NVIDIA 키가 있으면 NVIDIA, 없으면 MyMemory)
========================================================= */
let nvidiaAvailable = false;
let requestSeq = 0;

function fillEngineSelect(){
  const sel = $("engineSelect");
  sel.textContent = "";
  if(nvidiaAvailable){
    const o = el("option", null, "NVIDIA (권장)"); o.value = "nvidia"; sel.appendChild(o);
  }
  const o2 = el("option", null, "MyMemory (대체)"); o2.value = "mymemory"; sel.appendChild(o2);
  sel.value = nvidiaAvailable ? "nvidia" : "mymemory";
  $("engineNote").textContent = nvidiaAvailable ? ""
    : "NVIDIA 엔진을 쓰려면 serve.py 로 실행하고 .env 에 NVIDIA_API_KEY 를 설정하세요. (지금은 MyMemory 사용)";
}

async function detectEngines(){
  try{
    const r = await fetch("/api/status");
    const j = await r.json();
    nvidiaAvailable = !!j.nvidia;
  }catch(e){ nvidiaAvailable = false; }
  fillEngineSelect();
}

/* =========================================================
   조회
========================================================= */
function startLoading(){
  const panel = $("resultPanel");
  showResultArea();
  if(state.currentData){ panel.classList.add("has-prev"); }
  else{ renderSkeleton(); }
  panel.classList.add("loading");
}
function stopLoading(){
  $("resultPanel").classList.remove("loading","has-prev");
  if(!state.currentData){                       // 첫 조회가 실패하면 안내 화면으로 되돌린다
    $("resultPanel").style.display = "none";
    $("emptyState").style.display = "block";
  }
}

// 첫 화면 메뉴 — 눌러서 바로 조회 (고르는 항목 앞에 ▶ 커서)
["agua", "안녕", "I love learning new languages"].forEach(w=>{
  const b = el("button", "menu-item"); b.type = "button";
  b.append(icon("arrow", 16), document.createTextNode(w));
  b.addEventListener("click", ()=>{ $("mainInput").value = w; $("langSelect").value = "auto"; $("lookupForm").requestSubmit(); });
  $("exampleChips").appendChild(b);
});

$("lookupForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const text = $("mainInput").value.trim();
  if(!text){ setStatus("단어나 문장을 입력해 주세요.", "error"); return; }
  if(text.length > MAX_CHARS){ setStatus(`${MAX_CHARS}자 이하로 입력해 주세요.`, "error"); return; }

  const langChoice = $("langSelect").value;
  const engine = $("engineSelect").value;
  const seq = ++requestSeq;
  Arena.go();                                     // 검색 1회 = 배틀 1라운드
  setStatus("찾는 중", "busy");
  $("lookupBtn").disabled = true;
  startLoading();
  try{
    const data = engine === "nvidia"
      ? await lookupNvidia(text, langChoice)
      : await lookupMyMemory(text, langChoice);
    if(seq !== requestSeq) return;
    state.currentData = data;
    renderResult(data);
    setStatus("찾았다! 마음에 들면 저장해 봐요.", "ok");
    loadExtras(data);
  }catch(err){
    if(seq !== requestSeq) return;
    setStatus("앗, 실패했어요 — " + err.message, "error");
  }finally{
    if(seq === requestSeq){ $("lookupBtn").disabled = false; stopLoading(); }
  }
});

/* =========================================================
   저장 · 발음 · 단어장
========================================================= */
function showSaveMsg(text, isError){
  const m = $("saveMsg");
  m.className = "status" + (isError ? " error" : "");
  m.textContent = text;
}

$("saveBtn").addEventListener("click", ()=>{
  const cur = state.currentData;
  if(!cur) return;
  const list = loadVocab();
  const dupe = list.some(it => it.source.lang === cur.source.lang &&
    it.source.text.trim().toLowerCase() === cur.source.text.trim().toLowerCase());
  if(dupe){ showSaveMsg("이미 도감에 있는 단어예요."); return; }
  const item = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2,7),
    source: { text: cur.source.text, lang: cur.source.lang },
    translations: cur.translations.map(t => ({ lang:t.lang, text:t.text, lowConfidence:t.lowConfidence })),
    pivoted: cur.translations.some(t => t.pivoted),
    engine: cur.engine
  };
  const before = levelOf(list.length);
  list.push(item);
  if(!saveVocab(list)){
    showSaveMsg("저장하지 못했어요 (브라우저 저장소가 막혀 있거나 가득 참).", true);
    return;
  }
  const leveled = levelOf(list.length) > before;
  showSaveMsg(leveled ? `레벨 업! LV.${levelOf(list.length)} 이 되었어요!` : "도감에 등록했어요!");
  renderVocabList(item.id);
  $("vocabDetails").open = true;

  // 별가루: 저장 버튼에서 터진다 (레벨 업이면 더 크게)
  const host = $("saveBtn").parentElement, hb = host.getBoundingClientRect(), bb = $("saveBtn").getBoundingClientRect();
  burst(host, bb.left - hb.left + bb.width / 2, bb.top - hb.top + bb.height / 2, leveled ? { count: 20, dist: 80 } : { count: 10, dist: 48 });
  if(leveled) setStatus(`레벨 업! LV.${levelOf(list.length)} — 계속 모아 봐요!`, "ok");
});

$("speakBtn").addEventListener("click", ()=>{
  if(!state.currentData || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(state.currentData.source.text);
  u.lang = SPEECH_LOCALE[state.currentData.source.lang];
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
});
if(!("speechSynthesis" in window)) $("speakBtn").disabled = true;

$("vocabFilter").addEventListener("input", () => renderVocabList());
$("exportBtn").addEventListener("click", exportCsv);

/* =========================================================
   첫 상태
========================================================= */
renderVocabList();
setStatus("", "idle");
Arena.init();
// 주소로 바로 조회: /?q=agua  (선택: &lang=en|es|ko) — 링크 공유용
detectEngines().then(()=>{
  const qp = new URLSearchParams(location.search);
  const q = (qp.get("q") || "").trim().slice(0, MAX_CHARS);
  if(!q) return;
  $("mainInput").value = q;
  if(LANGS.includes(qp.get("lang"))) $("langSelect").value = qp.get("lang");
  $("lookupForm").requestSubmit();
});
