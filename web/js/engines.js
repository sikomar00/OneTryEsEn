// 번역 엔진: 응답을 공통 형태로 정리한다 (DOM을 건드리지 않는다).
import { LANGS, MYMEMORY } from "./util.js";

/* =========================================================
   판단 규칙 1 — (MyMemory 대체 모드 전용) 언어 자동 감지
   NVIDIA 엔진은 모델이 직접 입력 언어를 판정한다.
   DOM을 건드리지 않는 순수 함수.
========================================================= */
const ES_WORDS = new Set(["el","la","los","las","un","una","unos","unas","de","del",
  "que","y","en","es","son","esta","con","para","por","como","mas","pero","se",
  "su","sus","le","les","yo","tu","ella","nosotros","ellos","ellas","muy",
  "tambien","porque","cuando","donde","quien","cual","esto","eso","aqui","alli",
  "hola","gracias","amor","idioma","idiomas","aprender","encanta","nuevo","nueva","me",
  "agua","casa","gato","perro","libro","comer","beber","hablar","vivir","tiempo"]);
const EN_WORDS = new Set(["the","a","an","is","are","was","were","of","in","on","at",
  "for","to","and","or","but","not","with","this","that","these","those","i","you",
  "he","she","we","they","very","also","because","when","where","who","which","here",
  "there","hello","thanks","love","language","languages","learn","learning","new",
  "water","house","cat","dog","book","eat","drink","speak","live","time"]);

export function detectLanguage(text){
  if(/[가-힣]/.test(text)) return { lang:"ko", ambiguous:false };
  const lower = text.toLowerCase();
  if(/[ñ¿¡]/.test(lower)) return { lang:"es", ambiguous:false };
  const words = lower.match(/[a-zñáéíóúü]+/g) || [];
  let es = 0, en = 0;
  words.forEach(w=>{ if(ES_WORDS.has(w)) es++; if(EN_WORDS.has(w)) en++; });
  const accent = /[áéíóúü]/.test(lower);
  if(es === en) return { lang: accent ? "es" : "en", ambiguous:true };
  return { lang: es > en ? "es" : "en", ambiguous:false };
}

/* =========================================================
   판단 규칙 2 — 엔진별 응답을 공통 형태로 정리 (DOM 무관)
   공통 결과: { source:{text,lang,ambiguous}, translations:[{lang,text,alternatives,lowConfidence,pivoted}],
               pos, example, note, engine }
========================================================= */

// --- NVIDIA (로컬 프록시 serve.py 경유 — 키는 서버에만 있다) ---
export async function lookupNvidia(text, langChoice){
  let res;
  try{
    res = await fetch("/api/lookup", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ text, source: langChoice })
    });
  }catch(e){ throw new Error("로컬 서버(serve.py)에 연결하지 못함"); }
  let json = null;
  try{ json = await res.json(); }catch(e){}
  if(!res.ok) throw new Error((json && json.error) || ("서버 오류 " + res.status));
  const src = json.source_lang;
  const targets = LANGS.filter(l => l !== src);
  return {
    engine: "NVIDIA " + (json.model || ""),
    source: { text, lang: src, ambiguous: !!json.ambiguous },
    translations: targets.map(l => ({
      lang: l, text: json.translations[l],
      alternatives: (json.alternatives && json.alternatives[l]) || [],
      lowConfidence: false, pivoted: false
    })),
    pos: json.pos || "", example: json.example || {}, note: json.note || ""
  };
}

// --- MyMemory (대체 모드) ---
// 점수(match)만 믿지 않는다: 입력과 segment가 같은 항목을 우선하고,
// 다른 문장의 메모리가 1위인 경우엔 '유사 문장 결과'로 낮은 신뢰 표시한다.
function normalizeMyMemory(json, input){
  if(!json || typeof json !== "object") throw new Error("MyMemory 응답 형식 오류");
  const status = Number(json.responseStatus);
  const rd = json.responseData || {};
  if(json.quotaFinished) throw new Error("MyMemory 오늘 무료 한도를 모두 사용했어요");
  if(status !== 200) throw new Error("MyMemory 오류: " + (rd.translatedText || json.responseDetails || status));
  if(typeof rd.translatedText !== "string" || !rd.translatedText.trim())
    throw new Error("번역 결과가 비어 있어요");
  const key = input.trim().toLowerCase();
  const matches = Array.isArray(json.matches) ? json.matches : [];
  const exact = matches.filter(m => m && typeof m.translation === "string" &&
                                    String(m.segment || "").trim().toLowerCase() === key)
                       .sort((a,b)=> (Number(b.match)||0) - (Number(a.match)||0));
  const best = exact[0];
  const text = (best ? best.translation : rd.translatedText).trim();
  const topSeg = matches[0] && String(matches[0].segment || "").trim().toLowerCase();
  const lowConfidence = !best && (matches.length > 0 && topSeg !== key || !(Number(rd.match) >= 0.5));
  const alternatives = [];
  matches.forEach(m=>{
    const t = m && typeof m.translation === "string" ? m.translation.trim() : "";
    if(t && t.toLowerCase() !== text.toLowerCase() && !alternatives.some(a => a.toLowerCase() === t.toLowerCase()) && String(m.segment||"").trim().toLowerCase() === key)
      alternatives.push(t);
  });
  return { text, lowConfidence, alternatives: alternatives.slice(0,3) };
}

async function myMemoryCall(text, from, to){
  const url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("MyMemory 응답 오류: " + res.status);
  return normalizeMyMemory(await res.json(), text);
}

// 판단 규칙 3 — 피벗: MyMemory는 ko↔es 직접 번역이 부실해(안녕→annyo) 영어를 거친다.
// 단, 중간 영어 결과를 화면에 보여줘 오류 전파를 사용자가 확인할 수 있게 한다.
export async function lookupMyMemory(text, langChoice){
  const det = langChoice === "auto" ? detectLanguage(text) : { lang: langChoice, ambiguous:false };
  const src = det.lang;
  const targets = LANGS.filter(l => l !== src);
  let translations;
  if(src === "en"){
    const rs = await Promise.all(targets.map(t => myMemoryCall(text, "en", t)));
    translations = rs.map((r,i)=>({ lang:targets[i], text:r.text, alternatives:r.alternatives,
                                    lowConfidence:r.lowConfidence, pivoted:false }));
  }else{
    const toEn = await myMemoryCall(text, src, "en");
    const other = targets[1];
    const viaEn = await myMemoryCall(toEn.text, "en", other);
    translations = [
      { lang:"en", text:toEn.text, alternatives:toEn.alternatives, lowConfidence:toEn.lowConfidence, pivoted:false },
      { lang:other, text:viaEn.text, alternatives:viaEn.alternatives,
        lowConfidence: viaEn.lowConfidence || toEn.lowConfidence, pivoted:true, via:toEn.text }
    ];
  }
  return { engine:"MyMemory", source:{ text, lang:src, ambiguous:det.ambiguous },
           translations, pos:"", example:{}, note:"" };
}
