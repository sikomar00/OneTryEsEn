// 공용 상수와 DOM 도우미. 모듈 사이에서 공유하는 상태는 state 하나로만 둔다.

export const MAX_CHARS = 500;
export const MYMEMORY = "https://api.mymemory.translated.net/get";
export const STORAGE_KEY = "trilingual-vocab-list-v1";
export const LANGS = ["en","es","ko"];
export const LANG_LABEL = { en:"영어", es:"스페인어", ko:"한국어" };
export const LANG_TAG = { en:"EN", es:"ES", ko:"KO" };
export const LANG_COLOR = { en:"var(--en)", es:"var(--es)", ko:"var(--ko)" };
export const SPEECH_LOCALE = { en:"en-US", es:"es-ES", ko:"ko-KR" };

export const $ = id => document.getElementById(id);
export function el(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text != null) e.textContent = text;
  return e;
}

// 현재 화면에 표시 중인 조회 결과 (부가 정보가 늦게 도착했을 때 "아직 같은 결과인지" 확인하는 데 쓴다)
export const state = { currentData: null };
