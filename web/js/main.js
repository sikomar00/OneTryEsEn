// 진입점: 이벤트 연결. 조회 흐름 = 엔진 호출 → 그리기 호출.
import { $, el, MAX_CHARS, LANGS, SPEECH_LOCALE, state } from "./util.js";
import { lookupNvidia, lookupMyMemory } from "./engines.js";
import { loadVocab, saveVocab, renderVocabList, exportCsv } from "./vocab.js";
import { setStatus, showResultArea, renderSkeleton, renderResult } from "./render.js";
import { loadExtras } from "./extras.js";
import { Arena } from "./arena.js";

/* =========================================================
   엔진 선택 / 이벤트 연결 (조회 흐름 = 판단 규칙 호출 → 그리기 호출)
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

// 첫 화면 예시 — 눌러서 바로 조회
["agua", "안녕", "I love learning new languages"].forEach(w=>{
  const b = el("button", "chipbtn", w); b.type = "button";
  b.addEventListener("click", ()=>{ $("mainInput").value = w; $("langSelect").value = "auto"; $("lookupForm").requestSubmit(); });
  $("exampleChips").appendChild(b);
});

$("lookupForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const text = $("mainInput").value.trim();
  if(!text){ setStatus("단어나 문장을 입력해 주세요.", true); return; }
  if(text.length > MAX_CHARS){ setStatus(`${MAX_CHARS}자 이하로 입력해 주세요.`, true); return; }

  const langChoice = $("langSelect").value;
  const engine = $("engineSelect").value;
  const seq = ++requestSeq;
  Arena.go();                                     // 검색 1회 = 배틀 1라운드
  setStatus("조회 중...");
  $("lookupBtn").disabled = true;
  startLoading();
  try{
    const data = engine === "nvidia"
      ? await lookupNvidia(text, langChoice)
      : await lookupMyMemory(text, langChoice);
    if(seq !== requestSeq) return;
    state.currentData = data;
    renderResult(data);
    setStatus("");
    loadExtras(data);
  }catch(err){
    if(seq !== requestSeq) return;
    setStatus("실패: " + err.message, true);
  }finally{
    if(seq === requestSeq){ $("lookupBtn").disabled = false; stopLoading(); }
  }
});

$("saveBtn").addEventListener("click", ()=>{
  if(!state.currentData) return;
  const list = loadVocab();
  const dupe = list.some(it => it.source.lang === state.currentData.source.lang &&
    it.source.text.trim().toLowerCase() === state.currentData.source.text.trim().toLowerCase());
  if(dupe){ $("saveMsg").textContent = "이미 저장된 항목이에요."; return; }
  list.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2,7),
    source: { text: state.currentData.source.text, lang: state.currentData.source.lang },
    translations: state.currentData.translations.map(t => ({ lang:t.lang, text:t.text, lowConfidence:t.lowConfidence })),
    pivoted: state.currentData.translations.some(t => t.pivoted),
    engine: state.currentData.engine
  });
  if(!saveVocab(list)){
    $("saveMsg").textContent = "저장하지 못했어요 (브라우저 저장소가 막혀 있거나 가득 참).";
    $("saveMsg").className = "status error";
    return;
  }
  $("saveMsg").className = "status";
  $("saveMsg").textContent = "저장했어요.";
  renderVocabList();
  $("vocabDetails").open = true;
});

$("speakBtn").addEventListener("click", ()=>{
  if(!state.currentData || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(state.currentData.source.text);
  u.lang = SPEECH_LOCALE[state.currentData.source.lang];
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
});
if(!("speechSynthesis" in window)) $("speakBtn").disabled = true;

$("vocabFilter").addEventListener("input", renderVocabList);
$("exportBtn").addEventListener("click", exportCsv);

renderVocabList();
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
