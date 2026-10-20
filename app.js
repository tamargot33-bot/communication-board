// לוגיקת הלוחות: בחירת לוח, קטגוריות, כפתורים, בניית משפט, עריכה, ייבוא/ייצוא.

const state = {
  boards: [],
  boardId: null,
  currentCat: null,
  msg: [],
  editMode: false,
};

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const board = () => state.boards.find((b) => b.id === state.boardId) || state.boards[0];

// יוצר אלמנט עם מאפיינים וילדים. מאפיין שמתחיל ב-on מתחבר לאירוע.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

function notify(text) {
  const el = $("#notice");
  el.textContent = text;
  el.hidden = !text;
}

// ---------- שמירה וטעינה ----------

async function loadBoards() {
  let boards = null;
  try {
    boards = await Store.get("boards");
    if (boards) unpackImages(boards, await Store.get("images"));
  } catch {
    notify("לא ניתן לגשת לאחסון המקומי – השינויים לא יישמרו.");
  }
  if (!boards || !boards.length) {
    boards = await fetchDefaultBoards();
    await saveBoards(boards);
  }
  state.boards = boards;
  state.boardId = Prefs.get("boardId", boards[0].id);
  if (!state.boards.some((b) => b.id === state.boardId)) state.boardId = boards[0].id;
  state.currentCat = board().categories[0]?.id ?? null;
}

// טוען את לוחות ברירת המחדל, כולל קבצי הקול שמצורפים אליהם
async function fetchDefaultBoards() {
  const res = await fetch("default-board.json");
  const data = await res.json();
  await storeAudio(data.audio).catch(() => {});
  return unpackImages(data.boards, data.images);
}

// תמונות זהות נשמרות פעם אחת: בפריט נשאר "ref:N" שמצביע לרשימת images
function packImages(boards) {
  const images = [];
  const index = new Map();
  const packed = boards.map((b) => ({
    ...b,
    items: b.items.map((it) => {
      if (typeof it.image !== "string" || !it.image.startsWith("data:")) return it;
      let i = index.get(it.image);
      if (i === undefined) {
        i = images.push(it.image) - 1;
        index.set(it.image, i);
      }
      return { ...it, image: "ref:" + i };
    }),
  }));
  return { boards: packed, images };
}

// מחזיר את התמונות לפריטים (משנה את הלוחות במקום)
function unpackImages(boards, images) {
  for (const b of boards) {
    for (const it of b.items) {
      if (typeof it.image === "string" && it.image.startsWith("ref:")) {
        it.image = images?.[Number(it.image.slice(4))] ?? null;
      }
    }
  }
  return boards;
}

// שומר קבצי קול (data URL לפי מזהה פריט) באחסון
async function storeAudio(audio) {
  for (const [id, dataUrl] of Object.entries(audio || {})) {
    const blob = await (await fetch(dataUrl)).blob();
    await Store.set("audio:" + id, blob);
  }
}

async function saveBoards(boards = state.boards) {
  try {
    const packed = packImages(boards);
    await Store.set("images", packed.images);
    await Store.set("boards", packed.boards);
  } catch {
    notify("השמירה נכשלה. ייתכן שהאחסון מלא.");
  }
}

function switchBoard(id) {
  state.boardId = id;
  Prefs.set("boardId", id);
  state.currentCat = board().categories[0]?.id ?? null;
  render();
}

// ---------- רינדור ----------

function render() {
  renderBoardSelect();
  renderCats();
  renderGrid();
  $("#btn-edit").setAttribute("aria-pressed", String(state.editMode));
  $("#btn-edit").textContent = state.editMode ? "✔" : "✏️";
  $("#btn-edit").title = state.editMode ? "סיום עריכה" : "עריכה";
  $("#btn-edit").setAttribute("aria-label", $("#btn-edit").title);
}

function renderBoardSelect() {
  const sel = $("#board-select");
  sel.innerHTML = "";
  for (const b of state.boards) sel.append(h("option", { value: b.id }, b.name));
  sel.value = state.boardId;
}

function renderCats() {
  const el = $("#cats");
  el.innerHTML = "";
  for (const c of board().categories) {
    el.append(
      h(
        "button",
        {
          class: "cat" + (c.id === state.currentCat ? " active" : ""),
          type: "button",
          role: "tab",
          onclick: () => onCategoryClick(c),
        },
        c.name
      )
    );
  }
  el.append(h("button", { class: "cat add", type: "button", onclick: addCategory }, "+ קטגוריה"));
}

function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const items = board().items.filter((i) => i.category === state.currentCat);

  for (const it of items) {
    const visual = it.image
      ? h("img", { src: it.image, alt: "" })
      : it.icon
      ? h("span", { class: "icon", "aria-hidden": "true" }, it.icon)
      : null;
    const btn = h(
      "button",
      {
        class: "tile" + (state.editMode ? " editing" : ""),
        type: "button",
        style: `background:${it.color || "#fff3c4"}`,
        title: it.label,
      },
      visual,
      h("span", {}, it.label)
    );
    bindPress(btn, it);
    grid.append(btn);
  }

  grid.append(
    h("button", { class: "tile add-tile", type: "button", onclick: () => openItemDialog(null) }, "+")
  );
  // מנקים רק את הודעת "קטגוריה ריקה", כדי לא למחוק הודעות שגיאה שהוצגו זה עתה
  if (!items.length) notify(EMPTY_HINT);
  else if ($("#notice").textContent === EMPTY_HINT) notify("");
}

const EMPTY_HINT = "אין עדיין פריטים בקטגוריה הזו. הוסיפו בעזרת + או בשדה שבתחתית.";

// לחיצה רגילה = הקראה. לחיצה ארוכה (600ms) = עריכה של הפריט.
function bindPress(btn, it) {
  let timer = null;
  let longPressed = false;

  btn.addEventListener("pointerdown", () => {
    longPressed = false;
    timer = setTimeout(() => {
      longPressed = true;
      openItemDialog(it);
    }, 600);
  });
  const cancel = () => clearTimeout(timer);
  btn.addEventListener("pointerup", cancel);
  btn.addEventListener("pointerleave", cancel);
  btn.addEventListener("pointercancel", cancel);

  btn.addEventListener("click", (e) => {
    if (longPressed) {
      e.preventDefault();
      longPressed = false;
      return;
    }
    if (state.editMode) openItemDialog(it);
    else onTileClick(it);
  });
}

// ---------- בניית משפט והקראה ----------

function onTileClick(it) {
  state.msg.push(it);
  renderMsg();
  Speech.playItem(it);
}

function renderMsg() {
  const el = $("#msg");
  el.innerHTML = "";
  if (!state.msg.length) {
    el.append(h("span", { class: "hint" }, Speech.hasVoice() ? "לחצו על כפתור כדי לבנות משפט" : "לא נמצא קול עברי – ראו הגדרות"));
    return;
  }
  for (const it of state.msg) el.append(h("span", { class: "chip" }, it.icon ? `${it.icon} ${it.label}` : it.label));
}

function speakSentence() {
  const text = state.msg.map((i) => i.speak || i.label).join(" ");
  Speech.stopAll();
  Speech.speakText(text);
}

// ---------- קטגוריות ----------

function onCategoryClick(c) {
  if (state.editMode) return renameCategory(c);
  state.currentCat = c.id;
  render();
}

function addCategory() {
  const name = prompt("שם הקטגוריה החדשה:")?.trim();
  if (!name) return;
  const cat = { id: uid(), name };
  board().categories.push(cat);
  state.currentCat = cat.id;
  saveBoards().then(render);
}

function renameCategory(c) {
  const name = prompt("שם חדש לקטגוריה (ריק = מחיקה, רק אם אין בה פריטים):", c.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    const count = board().items.filter((i) => i.category === c.id).length;
    if (count) {
      notify("אי אפשר למחוק קטגוריה שיש בה פריטים. העבירו או מחקו אותם קודם.");
      return;
    }
    board().categories = board().categories.filter((x) => x !== c);
    if (state.currentCat === c.id) state.currentCat = board().categories[0]?.id ?? null;
  } else {
    c.name = trimmed;
  }
  saveBoards().then(render);
}

// ---------- עריכת פריט ----------

let editingItem = null;
let pendingImage; // undefined = ללא שינוי, null = הוסר, מחרוזת = תמונה חדשה
let pendingAudio; // undefined = ללא שינוי, null = הוסר, File = קובץ חדש

function openItemDialog(it) {
  editingItem = it;
  pendingImage = undefined;
  pendingAudio = undefined;

  const f = $("#item-form");
  f.reset();
  $("#item-title").textContent = it ? "עריכת פריט" : "פריט חדש";
  f.label.value = it?.label ?? "";
  f.speak.value = it && it.speak !== it.label ? it.speak : "";
  f.icon.value = it?.icon ?? "";
  f.color.value = it?.color ?? "#fff3c4";

  f.category.innerHTML = "";
  for (const c of board().categories) f.category.append(h("option", { value: c.id }, c.name));
  f.category.value = it?.category ?? state.currentCat;

  refreshImagePreview(it?.image ?? null);
  refreshAudioStatus(!!it?.hasAudio);
  $("#item-delete").hidden = !it;
  $("#item-order").hidden = !it;
  $("#item-up").disabled = neighborIndex(it, -1) < 0;
  $("#item-down").disabled = neighborIndex(it, 1) < 0;
  $("#item-dlg").showModal();
}

// מחזיר את האינדקס של הפריט הסמוך באותה קטגוריה (dir = -1 למעלה, 1 למטה), או -1 אם אין
function neighborIndex(it, dir) {
  if (!it) return -1;
  const items = board().items;
  let j = items.indexOf(it) + dir;
  while (j >= 0 && j < items.length && (!items[j] || items[j].category !== it.category)) {
    j += dir;
  }
  return j >= 0 && j < items.length ? j : -1;
}

// מזיז פריט למעלה/למטה בתוך הקטגוריה שלו. סדר המערך קובע את סדר הכפתורים במסך.
function moveItem(dir) {
  if (!editingItem) return;
  const j = neighborIndex(editingItem, dir);
  if (j < 0) return;
  const items = board().items;
  const i = items.indexOf(editingItem);
  [items[i], items[j]] = [items[j], items[i]];
  $("#item-dlg").close();
  saveBoards().then(render);
}

$("#item-up").addEventListener("click", () => moveItem(-1));
$("#item-down").addEventListener("click", () => moveItem(1));

function refreshImagePreview(src) {
  const img = $("#image-preview");
  img.src = src || "";
  img.hidden = !src;
}

function refreshAudioStatus(has) {
  $("#audio-status").textContent = has ? "קיים קובץ קול מוקלט" : "אין קובץ קול – ההקראה תהיה בקול המערכת";
}

// מקטין תמונה ל-256px כדי לחסוך מקום באחסון
function fileToSmallImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

$("#image-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingImage = await fileToSmallImage(file);
    refreshImagePreview(pendingImage);
  } catch {
    notify("לא ניתן לטעון את התמונה.");
  }
});
$("#image-remove").addEventListener("click", () => {
  pendingImage = null;
  $("#image-file").value = "";
  refreshImagePreview(null);
});

$("#audio-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingAudio = file;
  $("#audio-status").textContent = `קובץ חדש: ${file.name}`;
});
$("#audio-remove").addEventListener("click", () => {
  pendingAudio = null;
  $("#audio-file").value = "";
  $("#audio-status").textContent = "קובץ הקול יוסר בשמירה";
});

$("#item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const label = f.label.value.trim();
  if (!label) {
    f.label.focus();
    return;
  }

  const data = {
    label,
    speak: f.speak.value.trim() || label,
    icon: f.icon.value.trim(),
    color: f.color.value,
    category: f.category.value,
  };
  const item = editingItem ?? { id: uid(), image: null, hasAudio: false };
  Object.assign(item, data);

  if (pendingImage !== undefined) item.image = pendingImage;

  if (pendingAudio !== undefined) {
    try {
      if (pendingAudio === null) {
        await Store.del("audio:" + item.id);
        item.hasAudio = false;
      } else {
        await Store.set("audio:" + item.id, pendingAudio);
        item.hasAudio = true;
      }
    } catch {
      notify("שמירת קובץ הקול נכשלה.");
    }
  }

  if (!editingItem) board().items.push(item);
  await saveBoards();
  $("#item-dlg").close();
  render();
});

$("#item-cancel").addEventListener("click", () => $("#item-dlg").close());

$("#item-delete").addEventListener("click", async () => {
  if (!editingItem) return;
  if (!confirm(`למחוק את "${editingItem.label}"?`)) return;
  board().items = board().items.filter((i) => i !== editingItem);
  try {
    await Store.del("audio:" + editingItem.id);
  } catch {
    /* הקובץ יישאר באחסון בלבד – לא קריטי */
  }
  await saveBoards();
  $("#item-dlg").close();
  render();
});

// ---------- הוספה מהירה ----------

$("#quick").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#quick-text");
  const label = input.value.trim();
  if (!label || !state.currentCat) return;
  board().items.push({
    id: uid(),
    label,
    speak: label,
    icon: "",
    color: "#fff3c4",
    category: state.currentCat,
    image: null,
    hasAudio: false,
  });
  input.value = "";
  await saveBoards();
  render();
});

// ---------- ניהול לוחות ----------

async function newBoard() {
  const name = prompt("שם הלוח החדש:")?.trim();
  if (!name) return;
  const b = { id: uid(), name, categories: [{ id: uid(), name: "כללי" }], items: [] };
  state.boards.push(b);
  await saveBoards();
  $("#settings-dlg").close();
  switchBoard(b.id);
}

async function renameBoard() {
  const name = prompt("שם חדש ללוח:", board().name)?.trim();
  if (!name) return;
  board().name = name;
  await saveBoards();
  $("#settings-dlg").close();
  render();
}

async function deleteBoard() {
  if (state.boards.length <= 1) {
    notify("חייב להישאר לפחות לוח אחד.");
    return;
  }
  if (!confirm(`למחוק את הלוח "${board().name}" וכל הפריטים שבו?`)) return;
  const doomed = board();
  for (const it of doomed.items) {
    if (it.hasAudio) await Store.del("audio:" + it.id).catch(() => {});
  }
  state.boards = state.boards.filter((b) => b !== doomed);
  await saveBoards();
  $("#settings-dlg").close();
  switchBoard(state.boards[0].id);
}

// ---------- הגדרות, ייבוא וייצוא ----------

function refreshVoices() {
  const sel = $("#voice-select");
  const warn = $("#voice-warning");
  warn.dataset.default ??= warn.textContent;
  sel.innerHTML = "";

  if (Speech.usingGoogle()) {
    // במחשב עם server.py: הקול הוא גוגל, ולכן לא מציגים קולות המערכת
    sel.append(h("option", { value: "google" }, "Google (שרת מקומי)"));
    sel.disabled = true;
    warn.hidden = false;
    warn.textContent = "מופעל קול גוגל דרך השרת המקומי. בטלפון ובדפדפנים אחרים הקול הוא קול המערכת.";
    return;
  }

  warn.textContent = warn.dataset.default;
  const voices = Speech.hebrewVoices();
  if (!voices.length) {
    sel.append(h("option", { value: "" }, "אין קולות בעברית"));
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const v of voices) sel.append(h("option", { value: v.name }, v.name));
    sel.value = Speech.getVoiceName() ?? "";
  }
  warn.hidden = Speech.hasVoice();
}

function openSettings() {
  refreshVoices();
  $("#rate").value = Speech.getRate();
  $("#rate-val").textContent = Speech.getRate().toFixed(1);
  $("#speak-mode").value = Speech.getMode();
  $("#audio-priority").value = Speech.getPreferGoogle() ? "google" : "file";
  $("#engine-select").value = Speech.getEngine();
  $("#settings-dlg").showModal();
}

$("#voice-select").addEventListener("change", (e) => Speech.setVoice(e.target.value));
$("#rate").addEventListener("input", (e) => {
  Speech.setRate(Number(e.target.value));
  $("#rate-val").textContent = Number(e.target.value).toFixed(1);
});
$("#speak-mode").addEventListener("change", (e) => Speech.setMode(e.target.value));
$("#audio-priority").addEventListener("change", (e) => Speech.setPreferGoogle(e.target.value === "google"));
$("#engine-select").addEventListener("change", (e) => {
  Speech.setEngine(e.target.value);
  refreshVoices();
});

// ייצוא: כל הלוחות + קבצי קול (כ-data URL) בקובץ JSON אחד
async function exportBoards() {
  const audio = {};
  for (const b of state.boards) {
    for (const it of b.items) {
      if (!it.hasAudio) continue;
      const blob = await Store.get("audio:" + it.id);
      if (blob) audio[it.id] = await blobToDataURL(blob);
    }
  }
  const { boards, images } = packImages(state.boards);
  const data = { format: "comboard", version: 3, boards, images, audio };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  h("a", { href: url, download: "communication-boards.json" }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function importBoards(file) {
  try {
    const data = JSON.parse(await file.text());
    // תואם גם לגרסה 1 (לוח יחיד)
    const boards = data.boards ?? (data.board ? [{ id: uid(), name: "לוח מיובא", ...data.board }] : null);
    if (data.format !== "comboard" || !Array.isArray(boards) || !boards.length) {
      notify("הקובץ אינו לוח תקשורת תקין.");
      return;
    }
    unpackImages(boards, data.images);
    await storeAudio(data.audio);
    state.boards = boards;
    await saveBoards();
    $("#settings-dlg").close();
    switchBoard(boards[0].id);
    notify("הלוחות יובאו בהצלחה.");
  } catch {
    notify("ייבוא הקובץ נכשל.");
  }
}

$("#btn-export").addEventListener("click", exportBoards);
$("#import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importBoards(file);
  e.target.value = "";
});

$("#btn-reset").addEventListener("click", async () => {
  if (!confirm("לאפס לברירת המחדל? כל הלוחות והשינויים שביצעתם יימחקו.")) return;
  state.boards = await fetchDefaultBoards();
  state.boardId = state.boards[0].id;
  await saveBoards();
  $("#settings-dlg").close();
  switchBoard(state.boardId);
});

$("#btn-board-new").addEventListener("click", newBoard);
$("#btn-board-rename").addEventListener("click", renameBoard);
$("#btn-board-delete").addEventListener("click", deleteBoard);

// ---------- סרגל עליון ----------

$("#board-select").addEventListener("change", (e) => switchBoard(e.target.value));
$("#btn-speak").addEventListener("click", speakSentence);
$("#btn-back").addEventListener("click", () => {
  state.msg.pop();
  renderMsg();
});
$("#btn-clear").addEventListener("click", () => {
  state.msg = [];
  renderMsg();
});
$("#btn-edit").addEventListener("click", () => {
  state.editMode = !state.editMode;
  render();
});
$("#btn-settings").addEventListener("click", openSettings);

// ---------- אתחול ----------

async function init() {
  try {
    await loadBoards();
  } catch {
    notify("טעינת הלוחות נכשלה. יש להפעיל את האתר מהרשת (שרת מקומי), לא מקובץ ישיר.");
    return;
  }
  await Speech.ready;
  render();
  renderMsg();
  if (Speech.supported) {
    speechSynthesis.addEventListener("voiceschanged", () => {
      Speech.pickVoice();
      renderMsg();
    });
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
