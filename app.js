(() => {
  "use strict";

  const LANGS = [
    { code: "zh", name: "中文", speech: "zh-TW" },
    { code: "ja", name: "日文", speech: "ja-JP" },
    { code: "en", name: "英文", speech: "en-US" },
    { code: "ko", name: "韓文", speech: "ko-KR" },
    { code: "vi", name: "越南文", speech: "vi-VN" },
    { code: "th", name: "泰文", speech: "th-TH" },
    { code: "es", name: "西班牙文", speech: "es-ES" },
  ];

  const els = {
    micWrap: document.querySelector(".mic-wrap"),
    micBtn: document.getElementById("micBtn"),
    statusText: document.getElementById("statusText"),
    hintText: document.getElementById("hintText"),
    sourceLangBtn: document.getElementById("sourceLangBtn"),
    targetLangBtn: document.getElementById("targetLangBtn"),
    swapBtn: document.getElementById("swapBtn"),
    langBadgeText: document.getElementById("langBadgeText"),
    langBadge: document.getElementById("langBadge"),
    transcript: document.getElementById("transcript"),
    origLabel: document.getElementById("origLabel"),
    origText: document.getElementById("origText"),
    transLabel: document.getElementById("transLabel"),
    transText: document.getElementById("transText"),
    replayBtn: document.getElementById("replayBtn"),
    history: document.getElementById("history"),
    historyList: document.getElementById("historyList"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    langModal: document.getElementById("langModal"),
    langList: document.getElementById("langList"),
    modalSub: document.getElementById("modalSub"),
    modalClose: document.getElementById("modalClose"),
    toast: document.getElementById("toast"),
  };

  const state = {
    sourceIdx: 0, // 中文
    targetIdx: 1, // 日文
    listening: false,
    thinking: false,
    modalRole: null,
    lastUtterance: "",
    lastTargetSpeech: "zh-TW",
    history: JSON.parse(localStorage.getItem("voiceTranslateHistory") || "[]"),
  };

  function toast(msg, ms = 2600) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), ms);
  }

  function renderLangUI() {
    const src = LANGS[state.sourceIdx];
    const tgt = LANGS[state.targetIdx];
    els.sourceLangBtn.textContent = src.name;
    els.targetLangBtn.textContent = tgt.name;
    els.langBadgeText.textContent = `${src.name}${tgt.name} · VOICE`;
    els.origLabel.textContent = src.name;
    els.transLabel.textContent = tgt.name;
  }

  function renderHistory() {
    els.historyList.innerHTML = "";
    if (!state.history.length) {
      els.history.hidden = true;
      return;
    }
    els.history.hidden = false;
    state.history
      .slice()
      .reverse()
      .forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="h-orig">${escapeHtml(item.orig)}</span><span class="h-arrow">→</span>${escapeHtml(item.trans)}`;
        els.historyList.appendChild(li);
      });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function saveHistory(entry) {
    state.history.push(entry);
    if (state.history.length > 50) state.history.shift();
    localStorage.setItem("voiceTranslateHistory", JSON.stringify(state.history));
    renderHistory();
  }

  // ---- Speech Recognition ----
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  function setStatus(text, hint) {
    els.statusText.textContent = text;
    if (hint !== undefined) els.hintText.textContent = hint;
  }

  function setListening(on) {
    state.listening = on;
    els.micWrap.classList.toggle("listening", on);
    if (on) {
      setStatus("聆聽中…", "請開始說話，說完會自動翻譯");
    } else if (!state.thinking) {
      setStatus("點擊下方麥克風開始", "選擇語言對，說話即自動翻譯並朗讀");
    }
  }

  function setThinking(on) {
    state.thinking = on;
    els.micWrap.classList.toggle("thinking", on);
    if (on) setStatus("翻譯中…");
  }

  function startListening() {
    if (!SpeechRecognitionImpl) {
      toast("此瀏覽器不支援語音辨識，建議使用 Chrome");
      return;
    }
    if (state.listening) {
      recognizer && recognizer.stop();
      return;
    }
    recognizer = new SpeechRecognitionImpl();
    const src = LANGS[state.sourceIdx];
    recognizer.lang = src.speech;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => setListening(true);
    recognizer.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast("請允許使用麥克風權限");
      } else if (e.error === "no-speech") {
        toast("沒有偵測到語音，請再試一次");
      } else {
        toast("語音辨識發生錯誤：" + e.error);
      }
    };
    recognizer.onend = () => setListening(false);
    recognizer.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      if (text) handleRecognized(text);
    };

    try {
      recognizer.start();
    } catch (err) {
      toast("無法啟動麥克風");
    }
  }

  async function handleRecognized(text) {
    const src = LANGS[state.sourceIdx];
    const tgt = LANGS[state.targetIdx];

    els.transcript.hidden = false;
    els.origText.textContent = text;
    els.transText.textContent = "";
    setThinking(true);

    try {
      const translated = await translateText(text, src.code, tgt.code);
      els.transText.textContent = translated;
      setThinking(false);
      setStatus("翻譯完成", "點擊下方麥克風繼續對話");
      speak(translated, tgt.speech);
      saveHistory({ orig: text, trans: translated, src: src.name, tgt: tgt.name });
    } catch (err) {
      setThinking(false);
      setStatus("點擊下方麥克風開始", "選擇語言對，說話即自動翻譯並朗讀");
      toast("翻譯失敗，請稍後再試");
    }
  }

  async function translateText(text, sourceCode, targetCode) {
    const langpair = `${sourceCode}|${targetCode}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("network");
    const data = await res.json();
    const result = data && data.responseData && data.responseData.translatedText;
    if (!result) throw new Error("empty");
    return result;
  }

  function speak(text, lang) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    state.lastUtterance = text;
    state.lastTargetSpeech = lang;
    window.speechSynthesis.speak(utter);
  }

  // ---- Language modal ----
  function openLangModal(role) {
    state.modalRole = role;
    els.modalSub.textContent = role === "source" ? "選擇「來源」語言" : "選擇「目標」語言";
    els.langList.innerHTML = "";
    const activeIdx = role === "source" ? state.sourceIdx : state.targetIdx;
    LANGS.forEach((lang, idx) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = lang.name;
      if (idx === activeIdx) btn.classList.add("active");
      btn.addEventListener("click", () => selectLang(idx));
      li.appendChild(btn);
      els.langList.appendChild(li);
    });
    els.langModal.hidden = false;
  }

  function selectLang(idx) {
    if (state.modalRole === "source") {
      if (idx === state.targetIdx) swapLangs();
      else state.sourceIdx = idx;
    } else {
      if (idx === state.sourceIdx) swapLangs();
      else state.targetIdx = idx;
    }
    els.langModal.hidden = true;
    renderLangUI();
  }

  function swapLangs() {
    [state.sourceIdx, state.targetIdx] = [state.targetIdx, state.sourceIdx];
    renderLangUI();
    if (!els.transcript.hidden) {
      const o = els.origText.textContent;
      const t = els.transText.textContent;
      els.origText.textContent = t;
      els.transText.textContent = o;
    }
  }

  // ---- Events ----
  els.micBtn.addEventListener("click", startListening);
  els.swapBtn.addEventListener("click", swapLangs);
  els.sourceLangBtn.addEventListener("click", () => openLangModal("source"));
  els.targetLangBtn.addEventListener("click", () => openLangModal("target"));
  els.langBadge.addEventListener("click", () => openLangModal("source"));
  els.modalClose.addEventListener("click", () => (els.langModal.hidden = true));
  els.langModal.addEventListener("click", (e) => {
    if (e.target === els.langModal) els.langModal.hidden = true;
  });
  els.replayBtn.addEventListener("click", () => {
    if (state.lastUtterance) speak(state.lastUtterance, state.lastTargetSpeech);
  });
  els.clearHistoryBtn.addEventListener("click", () => {
    state.history = [];
    localStorage.removeItem("voiceTranslateHistory");
    renderHistory();
  });

  renderLangUI();
  renderHistory();

  if (!SpeechRecognitionImpl) {
    setStatus("此瀏覽器不支援語音辨識", "請改用電腦版 Chrome 開啟本頁");
  }
})();
