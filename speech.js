// דיבור: קול גוגל דרך השרת המקומי (server.py), רק כשהאתר נפתח מ-localhost.
// בכל מקום אחר (למשל האפליקציה באנדרואיד) משתמשים בקול המערכת (Web Speech API).
// קובץ מוקלט שהועלה לפריט גובר על שניהם.

const Speech = (() => {
  const supported = "speechSynthesis" in window;
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  let voice = null;
  let googleOn = false;
  let mode = Prefs.get("speakMode", "queue");
  let rate = Prefs.get("rate", 1);
  let currentAudio = null;
  let queue = []; // טקסטים ממתינים לקול גוגל (מצב "בתור")
  let preferGoogle = Prefs.get("preferGoogle", true); // כשיש שרת: קול גוגל לפני קובץ מוקלט
  let engine = Prefs.get("engine", "google"); // "google" = קול גוגל כשהשרת זמין, "system" = תמיד קול המערכת

  // קול גוגל פעיל רק אם השרת זמין והמשתמש לא בחר במפורש בקול המערכת
  function googleActive() {
    return googleOn && engine === "google";
  }

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

  // בודק שהשרת המקומי פועל. מחזיר מיד אם האתר לא רץ מ-localhost.
  async function probeGoogle() {
    if (!isLocal) return false;
    try {
      const res = await fetch("health", { cache: "no-store" });
      googleOn = res.ok && (await res.text()) === "ok";
    } catch {
      googleOn = false;
    }
    return googleOn;
  }

  function speakSystem(text) {
    if (!supported) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "he-IL";
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
    return true;
  }

  function playNext() {
    if (queue.length) playGoogle(queue.shift());
  }

  // מנגן טקסט דרך השרת המקומי. אם השרת נכשל, עוברים לקול המערכת.
  function playGoogle(text) {
    const audio = new Audio("tts?text=" + encodeURIComponent(text));
    audio.playbackRate = rate;
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = null;
      playNext();
    };
    audio.onerror = () => {
      currentAudio = null;
      googleOn = false;
      speakSystem(text);
      playNext();
    };
    audio.play().catch(() => {});
  }

  function stopAll() {
    queue = [];
    if (supported) speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio = null;
    }
  }

  function speakText(text) {
    if (!text) return false;
    if (mode === "replace") stopAll();
    if (googleActive()) {
      if (currentAudio) queue.push(text);
      else playGoogle(text);
      return true;
    }
    return speakSystem(text);
  }

  // סדר עדיפויות: קול גוגל (אם השרת פועל ונבחר כך), אחרת קובץ מוקלט של הפריט, אחרת קול המערכת
  async function playItem(item) {
    if (item.hasAudio && !(preferGoogle && googleActive())) {
      try {
        const blob = await Store.get("audio:" + item.id);
        if (blob) {
          if (mode === "replace") stopAll();
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          currentAudio.playbackRate = rate;
          currentAudio.onended = () => {
            URL.revokeObjectURL(url);
            currentAudio = null;
            playNext();
          };
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
  const ready = probeGoogle();

  return {
    supported,
    ready,
    hebrewVoices,
    pickVoice,
    usingGoogle: () => googleActive(),
    hasVoice: () => googleActive() || !!voice,
    getVoiceName: () => (googleActive() ? "Google (שרת מקומי)" : voice ? voice.name : null),
    getEngine: () => engine,
    setEngine(e) {
      engine = e;
      Prefs.set("engine", e);
    },
    setVoice(name) {
      Prefs.set("voiceName", name);
      pickVoice();
    },
    getPreferGoogle: () => preferGoogle,
    setPreferGoogle(v) {
      preferGoogle = v;
      Prefs.set("preferGoogle", v);
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
      if (currentAudio) currentAudio.playbackRate = r;
    },
    speakText,
    playItem,
    stopAll,
  };
})();
