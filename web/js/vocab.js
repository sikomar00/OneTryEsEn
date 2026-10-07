// 단어장(내 단어 도감): localStorage 저장·목록 렌더링·레벨·CSV 내보내기.
import { $, el, LANGS, LANG_TAG, STORAGE_KEY } from "./util.js";
import { icon } from "./pixel.js";

/* =========================================================
   저장소 (localStorage 입출력) — 실패를 숨기지 않고 알린다
========================================================= */
export function loadVocab(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(list)) return [];
    return list.filter(it => it && it.source && LANGS.includes(it.source.lang) &&
                             typeof it.source.text === "string" && Array.isArray(it.translations));
  }catch(e){ return []; }
}
export function saveVocab(list){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; }
  catch(e){ return false; }
}

function vocabLine(item){
  return item.translations.map(t => `${LANG_TAG[t.lang]} ${t.text}`).join(" · ");
}

// 5개 저장할 때마다 레벨 업 (순전히 재미 요소)
export const WORDS_PER_LEVEL = 5;
export const levelOf = n => 1 + Math.floor(n / WORDS_PER_LEVEL);

function renderLevel(n){
  $("vocabLevel").textContent = "LV." + levelOf(n);
  const bar = $("xpBar");
  bar.textContent = "";
  const filled = n % WORDS_PER_LEVEL;
  for(let i = 0; i < WORDS_PER_LEVEL; i++) bar.appendChild(el("i", i < filled ? "on" : ""));
  $("xpLabel").textContent = `다음 레벨까지 ${WORDS_PER_LEVEL - filled}`;
}

/** highlightId: 방금 저장한 항목은 잠깐 깜빡인다 */
export function renderVocabList(highlightId){
  const all = loadVocab();
  const q = $("vocabFilter").value.trim().toLowerCase();
  const list = q ? all.filter(it => (it.source.text + " " + vocabLine(it)).toLowerCase().includes(q)) : all;
  const box = $("vocabList");
  $("vocabCount").textContent = all.length;
  renderLevel(all.length);
  $("exportBtn").disabled = all.length === 0;
  box.textContent = "";
  $("vocabEmpty").style.display = list.length ? "none" : "block";
  $("vocabEmpty").textContent = all.length ? "검색 결과가 없어요." : "아직 저장한 항목이 없어요. 마음에 드는 단어를 저장해 봐요!";
  list.slice().reverse().forEach(item=>{
    const row = el("div", "vocab-item" + (item.id === highlightId ? " new" : ""));
    const left = el("span");
    const main = el("span", "v-main");
    main.append(el("i", "vtag " + item.source.lang, LANG_TAG[item.source.lang]), document.createTextNode(item.source.text));
    left.appendChild(main);
    left.appendChild(el("span", "v-sub", vocabLine(item) + (item.pivoted ? " (영어 경유)" : "")));
    row.appendChild(left);
    const del = el("button", "vocab-del");
    del.type = "button";
    del.setAttribute("aria-label", "삭제");
    del.appendChild(icon("x", 16));
    del.addEventListener("click", ()=>{
      saveVocab(loadVocab().filter(x => x.id !== item.id));
      renderVocabList();
    });
    row.appendChild(del);
    box.appendChild(row);
  });
}

function csvCell(v){
  let s = String(v == null ? "" : v);
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // 스프레드시트 수식 주입 방지
  return '"' + s.replace(/"/g,'""') + '"';
}
export function exportCsv(){
  const list = loadVocab();
  if(!list.length) return;
  const rows = [["en","es","ko","입력언어"]];
  list.forEach(it=>{
    const m = { [it.source.lang]: it.source.text };
    it.translations.forEach(t => { m[t.lang] = t.text; });
    rows.push([m.en, m.es, m.ko, it.source.lang]);
  });
  const BOM = String.fromCharCode(0xFEFF);          // 엑셀이 UTF-8 한글을 알아보게 하는 표식
  const csv = BOM + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
  a.download = "vocab.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
