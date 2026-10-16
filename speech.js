// דיבור: קול המערכת בעברית (Web Speech API), או קובץ קול מוקלט שהועלה לפריט.

const Speech = (() => {
  const supported = "speechSynthesis" in window;
  let voice = null;
  let mode = Prefs.get("speakMode", "queue");
  let rate = Prefs.get("rate", 1);
  let currentAudio = null;

  function hebrewVoices() {
    if (!supported) return [];
    return speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("he"));
  }

  function pickVoice() {
    const list = hebrewVoices();
    const saved = Prefs.get("voiceName", null);
    voice = list.find((v) => v.name === saved) || list[0] || null;
    return voice;
  }

  function stopAll() {
    if (supported) speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }

  function speakText(text) {
    if (!supported || !text) return false;
    if (mode === "replace") stopAll();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "he-IL";
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
    return true;
  }

  // מנגן קובץ מוקלט של פריט אם יש כזה, אחרת מקריא את הטקסט
  async function playItem(item) {
    if (item.hasAudio) {
      try {
        const blob = await Store.get("audio:" + item.id);
        if (blob) {
          if (mode === "replace") stopAll();
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          currentAudio.onended = () => URL.revokeObjectURL(url);
          await currentAudio.play();
          return true;
        }
      } catch {
        /* נופלים להקראה רגילה */
      }
    }
    return speakText(item.speak || item.label);
  }

  if (supported) speechSynthesis.onvoiceschanged = pickVoice;
  pickVoice();

  return {
    supported,
    hebrewVoices,
    pickVoice,
    hasVoice: () => !!voice,
    getVoiceName: () => (voice ? voice.name : null),
    setVoice(name) {
      Prefs.set("voiceName", name);
      pickVoice();
    },
    getMode: () => mode,
    setMode(m) {
      mode = m;
      Prefs.set("speakMode", m);
    },
    getRate: () => rate,
    setRate(r) {
      rate = r;
      Prefs.set("rate", r);
    },
    speakText,
    playItem,
    stopAll,
  };
})();
