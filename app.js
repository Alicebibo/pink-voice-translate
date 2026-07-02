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
    voicePanel: document.getElementById("voicePanel"),
    textPanel: document.getElementById("textPanel"),
    voiceModeBtn: document.getElementById("voiceModeBtn"),
    textModeBtn: document.getElementById("textModeBtn"),
    convoModeBtn: document.getElementById("convoModeBtn"),
    textInput: document.getElementById("textInput"),
    translateBtn: document.getElementById("translateBtn"),
    convoPanel: document.getElementById("convoPanel"),
    convoFeed: document.getElementById("convoFeed"),
    convoEmpty: document.getElementById("convoEmpty"),
    convoMicWrap: document.getElementById("convoMicWrap"),
    convoMic: document.getElementById("convoMic"),
    convoTurnLabel: document.getElementById("convoTurnLabel"),
    convoTurnLangName: document.getElementById("convoTurnLangName"),
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
    mode: "voice", // "voice" | "text" | "convo"
    listening: false,
    thinking: false,
    convoTurn: "source", // "source" | "target" — whose turn to speak
    convoListening: false,
    modalRole: null,
    lastUtterance: "",
    lastTargetSpeech: "zh-TW",
    history: JSON.parse(localStorage.getItem("voiceTranslateHistory") || "[]"),
  };

  const IDLE_HINT = {
    voice: "選擇語言對，說話即自動翻譯並朗讀",
    text: "選擇語言對，輸入文字後按翻譯",
    convo: "輪流點麥克風說話，翻譯完會自動換下一位",
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
    renderConvoTurn();
  }

  function renderConvoTurn() {
    const lang = state.convoTurn === "source" ? LANGS[state.sourceIdx] : LANGS[state.targetIdx];
    els.convoTurnLangName.textContent = lang.name;
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
      setStatus("點擊下方麥克風開始", IDLE_HINT.voice);
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
      if (text) handleTranslate(text);
    };

    try {
      recognizer.start();
    } catch (err) {
      toast("無法啟動麥克風");
    }
  }

  async function handleTranslate(text) {
    const src = LANGS[state.sourceIdx];
    const tgt = LANGS[state.targetIdx];
    const idleLabel = state.mode === "voice" ? "點擊下方麥克風開始" : "輸入文字開始翻譯";

    els.transcript.hidden = false;
    els.origText.textContent = text;
    els.transText.textContent = "";
    setThinking(true);

    try {
      const translated = await translateText(text, src.code, tgt.code);
      els.transText.textContent = translated;
      setThinking(false);
      setStatus("翻譯完成", state.mode === "voice" ? "點擊下方麥克風繼續對話" : "輸入下一句文字繼續翻譯");
      speak(translated, tgt.speech);
      saveHistory({ orig: text, trans: translated, src: src.name, tgt: tgt.name });
    } catch (err) {
      setThinking(false);
      setStatus(idleLabel, IDLE_HINT[state.mode]);
      toast("翻譯失敗，請稍後再試");
    } finally {
      if (state.mode === "text") els.translateBtn.disabled = false;
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

  // ---- Conversation mode ----
  let convoRecognizer = null;

  function toggleConvoTurn() {
    if (state.convoListening) return;
    state.convoTurn = state.convoTurn === "source" ? "target" : "source";
    renderConvoTurn();
  }

  function startConvoListening() {
    if (!SpeechRecognitionImpl) {
      toast("此瀏覽器不支援語音辨識，建議使用 Chrome");
      return;
    }
    if (state.convoListening) {
      convoRecognizer && convoRecognizer.stop();
      return;
    }
    const fromRole = state.convoTurn;
    const speaker = fromRole === "source" ? LANGS[state.sourceIdx] : LANGS[state.targetIdx];

    convoRecognizer = new SpeechRecognitionImpl();
    convoRecognizer.lang = speaker.speech;
    convoRecognizer.interimResults = false;
    convoRecognizer.maxAlternatives = 1;

    convoRecognizer.onstart = () => {
      state.convoListening = true;
      els.convoMicWrap.classList.add("listening");
      setStatus("聆聽中…", "請開始說話，說完會自動翻譯給對方");
    };
    convoRecognizer.onerror = (e) => {
      state.convoListening = false;
      els.convoMicWrap.classList.remove("listening");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast("請允許使用麥克風權限");
      } else if (e.error === "no-speech") {
        toast("沒有偵測到語音，請再試一次");
      } else {
        toast("語音辨識發生錯誤：" + e.error);
      }
      setStatus("點擊下方麥克風開始對話", IDLE_HINT.convo);
    };
    convoRecognizer.onend = () => {
      state.convoListening = false;
      els.convoMicWrap.classList.remove("listening");
    };
    convoRecognizer.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      if (text) handleConvoTranslate(text, fromRole);
    };

    try {
      convoRecognizer.start();
    } catch (err) {
      toast("無法啟動麥克風");
    }
  }

  async function handleConvoTranslate(text, fromRole) {
    const from = fromRole === "source" ? LANGS[state.sourceIdx] : LANGS[state.targetIdx];
    const to = fromRole === "source" ? LANGS[state.targetIdx] : LANGS[state.sourceIdx];
    els.convoMicWrap.classList.add("thinking");
    setStatus("翻譯中…", IDLE_HINT.convo);

    try {
      const translated = await translateText(text, from.code, to.code);
      appendConvoMessage(text, translated, fromRole);
      state.convoTurn = fromRole === "source" ? "target" : "source";
      renderConvoTurn();
      setStatus("點擊下方麥克風繼續對話", IDLE_HINT.convo);
      speak(translated, to.speech);
      saveHistory({ orig: text, trans: translated, src: from.name, tgt: to.name });
    } catch (err) {
      setStatus("點擊下方麥克風開始對話", IDLE_HINT.convo);
      toast("翻譯失敗，請稍後再試");
    } finally {
      els.convoMicWrap.classList.remove("thinking");
    }
  }

  function appendConvoMessage(orig, trans, fromRole) {
    els.convoEmpty.hidden = true;
    const div = document.createElement("div");
    div.className = `convo-msg from-${fromRole}`;
    const p1 = document.createElement("p");
    p1.className = "convo-orig";
    p1.textContent = orig;
    const p2 = document.createElement("p");
    p2.className = "convo-trans";
    p2.textContent = trans;
    div.appendChild(p1);
    div.appendChild(p2);
    els.convoFeed.appendChild(div);
    els.convoFeed.scrollTop = els.convoFeed.scrollHeight;
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

  // ---- Mode switching ----
  const IDLE_STATUS = {
    voice: "點擊下方麥克風開始",
    text: "輸入文字開始翻譯",
    convo: "點擊下方麥克風開始對話",
  };

  function setMode(mode) {
    if (state.mode === mode) return;
    if (state.listening) recognizer && recognizer.stop();
    if (state.convoListening) convoRecognizer && convoRecognizer.stop();
    state.mode = mode;
    els.voicePanel.hidden = mode !== "voice";
    els.textPanel.hidden = mode !== "text";
    els.convoPanel.hidden = mode !== "convo";
    els.voiceModeBtn.classList.toggle("active", mode === "voice");
    els.voiceModeBtn.setAttribute("aria-selected", mode === "voice");
    els.textModeBtn.classList.toggle("active", mode === "text");
    els.textModeBtn.setAttribute("aria-selected", mode === "text");
    els.convoModeBtn.classList.toggle("active", mode === "convo");
    els.convoModeBtn.setAttribute("aria-selected", mode === "convo");
    els.transcript.hidden = true;
    setStatus(IDLE_STATUS[mode], IDLE_HINT[mode]);
    if (mode === "text") els.textInput.focus();
  }

  function submitTextTranslate() {
    const text = els.textInput.value.trim();
    if (!text) return;
    els.translateBtn.disabled = true;
    handleTranslate(text);
  }

  // ---- Events ----
  els.micBtn.addEventListener("click", startListening);
  els.voiceModeBtn.addEventListener("click", () => setMode("voice"));
  els.textModeBtn.addEventListener("click", () => setMode("text"));
  els.convoModeBtn.addEventListener("click", () => setMode("convo"));
  els.convoMic.addEventListener("click", startConvoListening);
  els.convoTurnLabel.addEventListener("click", toggleConvoTurn);
  els.translateBtn.addEventListener("click", submitTextTranslate);
  els.textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitTextTranslate();
    }
  });
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
    els.voiceModeBtn.disabled = true;
    els.voiceModeBtn.title = "此瀏覽器不支援語音辨識";
    els.convoModeBtn.disabled = true;
    els.convoModeBtn.title = "此瀏覽器不支援語音辨識";
    setMode("text");
    toast("此瀏覽器不支援語音辨識，已切換為文字輸入");
  }
})();
