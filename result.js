// --- Game state (safe defaults) ---
const roundCount = parseInt(localStorage.getItem("roundCount") || localStorage.getItem("totalRounds") || "5", 10);
const startingHP = 0;
const player1 = localStorage.getItem("player1") || "لاعب 1"; // right column
const player2 = localStorage.getItem("player2") || "لاعب 2"; // left column
const picks    = JSON.parse(localStorage.getItem("picks") || "{}");
let round      = parseInt(localStorage.getItem("currentRound") || "0", 10);

// Scores init/persist
let scores = JSON.parse(localStorage.getItem("scores") || "{}");
if (!Number.isFinite(scores?.[player1])) scores[player1] = startingHP;
if (!Number.isFinite(scores?.[player2])) scores[player2] = startingHP;

const roundTitle = document.getElementById("roundTitle");

// Player country selections (optional)
function readPlayerCountry(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (_) {
    return null;
  }
}
const player1Country = readPlayerCountry("player1Country");
const player2Country = readPlayerCountry("player2Country");

// Ability storage keys
const P1_ABILITIES_KEY = "player1Abilities";
const P2_ABILITIES_KEY = "player2Abilities";
const NOTES_KEY = (name) => `notes:${name}`;

// ===== socket =====
const gameID = localStorage.getItem("gameID");
const socket = typeof io !== "undefined" ? io() : null;

/* 🔑 ensure this page's socket is IN the room */
function joinRoomReliably() {
  if (!socket || !gameID) return;
  socket.emit("joinGame", { gameID, role: "host" });
  socket.emit("hostWatchAbilityRequests", { gameID });
}
if (socket) {
  socket.on("connect", () => {
    joinRoomReliably();
    setTimeout(joinRoomReliably, 500);
    setTimeout(joinRoomReliably, 1500);
    setTimeout(joinRoomReliably, 3000);
  });
}

// ========= Toast =========
function showToast(message, actions = [], closeOverride = null) {
  const wrap = document.createElement("div");
  wrap.className =
    "fixed left-1/2 -translate-x-1/2 bottom-6 z-50 " +
    "bg-[#222] text-white border-2 border-yellow-500 shadow-xl " +
    "rounded-xl px-4 py-3 max-w-[90vw] w-[520px]";
  const msg = document.createElement("div");
  msg.className = "mb-3 leading-relaxed";
  msg.textContent = message;
  wrap.appendChild(msg);
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "flex gap-2 justify-end";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.className = "px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 font-bold";
      b.onclick = () => { a.onClick?.(); document.body.removeChild(wrap); };
      row.appendChild(b);
    });
    const closeBtn = document.createElement("button");
    if (closeOverride?.label) {
      closeBtn.textContent = closeOverride.label;
      closeBtn.onclick = () => { closeOverride.onClick?.(); document.body.removeChild(wrap); };
    } else {
      closeBtn.textContent = "إغلاق";
      closeBtn.onclick = () => document.body.removeChild(wrap);
    }
    closeBtn.className = "px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 font-bold";
    row.appendChild(closeBtn);
    wrap.appendChild(row);
  }
  document.body.appendChild(wrap);
  if (!actions.length) setTimeout(() => wrap.remove(), 1800);
}

// ===== Helpers =====
function loadAbilities(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]") || []; } catch { return []; }
}
function saveAbilities(key, arr) { localStorage.setItem(key, JSON.stringify(arr || [])); }
function normalizeAbilityList(arr) {
  const list = Array.isArray(arr) ? arr : [];
  return list.map(a => {
    if (typeof a === "string") return { text: a.trim(), used: false };
    if (a && typeof a === "object") return { text: String(a.text || "").trim(), used: !!a.used };
    return null;
  }).filter(Boolean).filter(a => a.text);
}
function syncServerAbilities(){
  if (!socket || !gameID) return;
  const abilities = {
    [player1]: localStorage.getItem("player1AbilityImage") || null,
    [player2]: localStorage.getItem("player2AbilityImage") || null,
  };
  socket.emit("setAbilities", { gameID, abilities });
}

function createMedia(url, className, playSfx = false) {
  const isWebm = /\.webm(\?|#|$)/i.test(url || "");
  if (isWebm) {
    const v = document.createElement("video");
    v.src = url; v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
    v.className = className;
    if (playSfx && window.WebmSfx) window.WebmSfx.attachToMedia(v, url);
    return v;
  } else {
    const img = document.createElement("img");
    img.src = url; img.className = className; return img;
  }
}

function abilityRow(ab, onToggle) {
  const row = document.createElement("button");
  row.className =
    "w-full text-center px-4 py-2.5 rounded-lg font-bold text-base " +
    (ab.used
      ? "bg-yellow-700 text-black/90 border border-yellow-800"
      : "bg-yellow-400 hover:bg-yellow-300 text-black border border-yellow-500");
  row.textContent = ab.text;
  row.onclick = onToggle;
  return row;
}

// Fixed-height abilities pane rendering
// Render a single ability image for a player (image assigned earlier in start.js)
function renderAbilities(storageKey, container) {
  // في صفحة النتيجة 2 قد لا نستخدم حاوية قدرات، فتجاهل إن لم توجد
  if (!container) return;
  container.innerHTML = "";
  const name = storageKey === P1_ABILITIES_KEY ? player1 : player2;
  const key = storageKey === P1_ABILITIES_KEY ? "player1AbilityImage" : "player2AbilityImage";
  const imgUrl = localStorage.getItem(key);
  if (!imgUrl) {
    const p = document.createElement("p");
    p.className = "opacity-70 text-sm"; p.textContent = "لا توجد صورة قدرة";
    container.appendChild(p);
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center justify-center";
  const img = createMedia(imgUrl, "max-w-full max-h-[160px] object-contain");
  wrapper.appendChild(img);
  container.appendChild(wrapper);
}

// previous & VS
function getPreviousUrls(name) {
  const arr = Array.isArray(picks?.[name]) ? picks[name] : [];
  return arr.filter((_, i) => i < round);
}
function renderPrevGrid(container, urls) {
  container.innerHTML = "";
  urls.forEach(src => {
    const cell = document.createElement("div"); cell.className = "w-24 h-32 rounded-md overflow-hidden";
    const m = createMedia(src, "w-full h-full object-contain"); cell.appendChild(m); container.appendChild(cell);
  });
}

// Scoreboard names + flags (top bar)
function renderScoreboardMeta() {
  const leftName = document.getElementById("scoreNameLeft");
  if (leftName) leftName.textContent = player2;

  const rightName = document.getElementById("scoreNameRight");
  if (rightName) rightName.textContent = player1;

  const applyFlag = (elId, countryData) => {
    const holder = document.getElementById(elId);
    if (!holder) return;
    holder.innerHTML = "";
    if (countryData?.image) {
      const img = document.createElement("img");
      img.src = countryData.image;
      img.alt = countryData?.name ? `\u0639\u0644\u0645 ${countryData.name}` : "\u0639\u0644\u0645 \u0627\u0644\u0644\u0627\u0639\u0628";
      img.loading = "lazy";
      holder.appendChild(img);
    }
  };

  applyFlag("scoreFlagLeft", player2Country);
  applyFlag("scoreFlagRight", player1Country);
}

// ======== Player-View snapshot sync (host→viewers) ========
let okState = { left:{active:false,playerName:null}, right:{active:false,playerName:null} };
function buildSnapshot() {
  return {
    player1, player2,
    round, roundCount,
    scores,
    ok: okState,
    abilities: { [player1]: localStorage.getItem("player1AbilityImage") || null, [player2]: localStorage.getItem("player2AbilityImage") || null },
    countries: { [player1]: player1Country, [player2]: player2Country },
    currentLeftUrl:  picks?.[player2]?.[round],
    currentRightUrl: picks?.[player1]?.[round],
    prevLeft:  getPreviousUrls(player2),
    prevRight: getPreviousUrls(player1),
    notes: {
      [player1]: localStorage.getItem(NOTES_KEY(player1)) || "",
      [player2]: localStorage.getItem(NOTES_KEY(player2)) || ""
    }
  };
}
function broadcast() { if (socket && gameID) socket.emit("resultSnapshot", { gameID, snapshot: buildSnapshot() }); }
if (socket) socket.on("requestResultSnapshot", () => broadcast());

// ======== VS Row ========
function renderVsRow() {
  if (window.WebmSfx && typeof window.WebmSfx === "object") {
    try { if (!window.WebmSfx.perSide) window.WebmSfx.perSide = { left: [], right: [] };
      window.WebmSfx.perSide.left = []; window.WebmSfx.perSide.right = []; } catch {}
  }
  const vsRow = document.getElementById("vsRow"); vsRow.innerHTML = "";
  vsRow.className = "flex justify-center items-start gap-10 md:gap-16 flex-wrap md:flex-nowrap";
  const side = (name, mediaUrl, pos /* 'left' | 'right' */, countryData) => {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col items-center gap-4";

    const card = document.createElement("div");
    card.className = "w-80 md:w-96 h-[26rem] md:h-[30rem] overflow-hidden flex items-center justify-center";
    const media = createMedia(mediaUrl, "w-full h-full object-contain", true); card.appendChild(media);

    // 🔊 map correctly: left = player2, right = player1
    if (window.WebmSfx && /\.webm(\?|#|$)/i.test(mediaUrl || "")) {
      if (typeof window.WebmSfx.markSide === "function") window.WebmSfx.markSide(pos, mediaUrl);
    }

    // حاوية البطاقات السابقة + مربع الملاحظات (عمودي)
    const noteColumn = document.createElement("div");
    noteColumn.className = "flex flex-col items-stretch gap-3";

    const prevGrid = document.createElement("div");
    prevGrid.id = pos === "left" ? "prevLeftGrid" : "prevRightGrid";
    // شبكة 3 أعمدة مع سكرول عمودي لعرض البطاقات السابقة
    prevGrid.className =
      "w-64 md:w-72 max-h-40 overflow-y-auto no-scrollbar " +
      "grid grid-cols-3 gap-2";

    const note = document.createElement("textarea");
    note.className = "note-box p-3 text-base font-semibold outline-none placeholder:opacity-60";
    note.placeholder = "ملاحظات الجولة";
    note.value = localStorage.getItem(NOTES_KEY(name)) || "";
    note.addEventListener("input", () => { localStorage.setItem(NOTES_KEY(name), note.value); broadcast(); });

    noteColumn.appendChild(prevGrid);
    noteColumn.appendChild(note);

    const sideRow = document.createElement("div");
    sideRow.className = "flex items-center gap-4 md:gap-6";
    if (pos === "left") {
      sideRow.appendChild(noteColumn);
      sideRow.appendChild(card);
    } else {
      sideRow.appendChild(card);
      sideRow.appendChild(noteColumn);
    }

    wrap.appendChild(sideRow);
    return wrap;
  };

  const left  = side(player2, picks?.[player2]?.[round], "left", player2Country);
  const right = side(player1, picks?.[player1]?.[round], "right", player1Country);
  const vs = document.createElement("div"); vs.className = "self-center flex items-center justify-center";
  vs.innerHTML = `<div class="text-yellow-400 font-extrabold text-5xl mx-2 leading-none">VS</div>`;
  vsRow.appendChild(left); vsRow.appendChild(vs); vsRow.appendChild(right);

  // relabel replay buttons correctly
  const leftBtn  = document.getElementById("sfxReplayLeft");
  const rightBtn = document.getElementById("sfxReplayRight");
  if (leftBtn)  leftBtn.textContent  = `🔊 ${player2}`;
  if (rightBtn) rightBtn.textContent = `🔊 ${player1}`;

  broadcast();
}

// ===== Health & OK badges =====
function wireHealthControls(name, decBtn, incBtn, label) {
  const clamp = (n) => Math.max(-100, Math.min(100, n));
  const refresh = () => { label.textContent = String(scores[name]); };
  decBtn.onclick = () => { scores[name] = clamp((scores[name] ?? startingHP) - 1); refresh(); localStorage.setItem("scores", JSON.stringify(scores)); broadcast(); };
  incBtn.onclick = () => { scores[name] = clamp((scores[name] ?? startingHP) + 1); refresh(); localStorage.setItem("scores", JSON.stringify(scores)); broadcast(); };
  refresh();
}

function showOkBadge(side) {
  const el = side === "left" ? document.getElementById("p2OkAlert") : document.getElementById("p1OkAlert");
  if (!el) return;
  el.textContent = "تمام";
  el.classList.remove("hidden");
}

function hideOkBadge(side) {
  const el = side === "left" ? document.getElementById("p2OkAlert") : document.getElementById("p1OkAlert");
  if (el) el.classList.add("hidden");
}
function resetOkBadges() { hideOkBadge("left"); hideOkBadge("right"); }

// ===== Render page =====
function renderRound() {
  roundTitle.textContent = `الدقيقة ${round + 1}0`;
  renderScoreboardMeta();
  renderVsRow();
  renderAbilities(P2_ABILITIES_KEY, document.getElementById("p2Abilities"));
  renderAbilities(P1_ABILITIES_KEY, document.getElementById("p1Abilities"));
  renderPrevGrid(document.getElementById("prevLeftGrid"),  getPreviousUrls(player2));
  renderPrevGrid(document.getElementById("prevRightGrid"), getPreviousUrls(player1));

  wireHealthControls(player2, document.getElementById("p2Dec"), document.getElementById("p2Inc"), document.getElementById("p2Health"));
  wireHealthControls(player1, document.getElementById("p1Dec"), document.getElementById("p1Inc"), document.getElementById("p1Health"));

  resetOkBadges();
  syncServerAbilities();
  broadcast();
}

// ===== Next round / confirm =====
function goToRound(newIndex) {
  const maxIndex = Math.max(0, Math.min(roundCount - 1, newIndex));
  round = maxIndex;
  localStorage.setItem("currentRound", String(round));

  try { window.WebmSfx && window.WebmSfx._resetForNewRound && window.WebmSfx._resetForNewRound(); } catch {}

  renderRound();
}
function confirmWinner() {
  localStorage.setItem("scores", JSON.stringify(scores));
  const next = round + 1;
  const gameOver = next >= roundCount || scores[player1] === 100 || scores[player1] === -100 || scores[player2] === 100 || scores[player2] === -100;

  socket?.emit("confirmRoundResult", { gameID, round, snapshot: buildSnapshot() });

  if (gameOver) {
    let winner = null;
    let isTie = false;
    if ((scores[player1] ?? 0) > (scores[player2] ?? 0)) winner = player1;
    else if ((scores[player2] ?? 0) > (scores[player1] ?? 0)) winner = player2;
    else isTie = true;

    try {
      if (socket && gameID) {
        socket.emit("gameOver", {
          gameID,
          scores: { [player1]: scores[player1], [player2]: scores[player2] },
          winner,
          isTie,
          roundCount
        });
        socket.emit("submitFinalScores", {
          gameID,
          scores: { [player1]: scores[player1], [player2]: scores[player2] }
        });
      }
    } catch {}

    localStorage.removeItem(NOTES_KEY(player1));
    localStorage.removeItem(NOTES_KEY(player2));
    location.href = "score.html";
  } else {
    try { if (socket && gameID) socket.emit("startRound", { gameID, round: next }); } catch {}
    goToRound(next);
  }
}
window.confirmWinner = confirmWinner;

// ===== transfer modal =====
function openTransferModal(fromKey, fromName, toName){
  const list  = loadAbilities(fromKey);
  const modal = document.getElementById("transferModal");
  const grid  = document.getElementById("abilityGrid");
  const title = document.getElementById("transferTitle");
  title.textContent = `اختر القدرة المراد نقلها إلى ${toName}`;
  const toKey = (fromKey === P1_ABILITIES_KEY) ? P2_ABILITIES_KEY : P1_ABILITIES_KEY;
  grid.innerHTML = "";
  if (!list.length){
    const p = document.createElement("p"); p.className = "text-yellow-200 text-center py-2"; p.textContent = "لا توجد قدرات لنقلها."; grid.appendChild(p);
  } else {
    normalizeAbilityList(list).forEach((ab, idx)=>{
      const btn = document.createElement("button");
      btn.className = "w-full text-center px-3 py-2 rounded-lg border-2 border-yellow-500 bg-[#7b2131] hover:bg-[#8b2a3a] font-bold";
      btn.textContent = ab.text + (ab.used ? " (مستخدمة)" : "");
      btn.onclick = ()=>{
        const sender = normalizeAbilityList(loadAbilities(fromKey));
        const moved  = sender.splice(idx, 1)[0];
        saveAbilities(fromKey, sender);
        const receiver = normalizeAbilityList(loadAbilities(toKey)); receiver.push({ text: moved.text, used: !!moved.used });
        saveAbilities(toKey, receiver);
        closeTransferModal();
        renderAbilities(P2_ABILITIES_KEY, document.getElementById("p2Abilities"));
        renderAbilities(P1_ABILITIES_KEY, document.getElementById("p1Abilities"));
        syncServerAbilities();
        broadcast();
        showToast(`✅ تم نقل «${moved.text}» إلى ${toName}`);
      };
      grid.appendChild(btn);
    });
  }
  modal.classList.remove("hidden"); modal.classList.add("flex");
}
function closeTransferModal(){
  const modal = document.getElementById("transferModal");
  modal.classList.add("hidden"); modal.classList.remove("flex");
}
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;

/* ===== abilities persistence to server (NEW) ===== */
async function persistAbilityToServer(text) {
  try {
    if (!text || !text.trim()) return;
    const r = await fetch("/api/abilities/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.warn("[abilities] server persist failed:", r.status, t);
      showToast("⚠️ لم يتم الحفظ في السيرفر (سيتم حفظها محليًا فقط).");
    }
  } catch (e) {
    console.warn("[abilities] persist error:", e);
    showToast("⚠️ خطأ أثناء الحفظ في السيرفر.");
  }
}

// ===== Quick Add Ability modal =====
let _addTargetKey = null;
function openAddAbilityModal(targetKey, playerLabel) {
  _addTargetKey = targetKey;
  const modal = document.getElementById("addAbilityModal");
  const input = document.getElementById("addAbilityInput");
  if (!modal || !input) return;
  input.value = "";
  input.placeholder = `اكتب نص قدرة لإضافتها لـ ${playerLabel}…`;
  modal.classList.remove("hidden"); modal.classList.add("flex");
  setTimeout(() => input.focus(), 0);
}
function closeAddAbilityModal() {
  const modal = document.getElementById("addAbilityModal");
  if (!modal) return;
  modal.classList.add("hidden"); modal.classList.remove("flex");
  _addTargetKey = null;
}
async function confirmAddAbility() {
  const input = document.getElementById("addAbilityInput");
  if (!_addTargetKey || !input) return;
  const text = String(input.value || "").trim();
  if (!text) { input.focus(); return; }

  // ✅ allow duplicates: no local duplicate check
  const list = normalizeAbilityList(loadAbilities(_addTargetKey));
  list.push({ text, used: false });
  saveAbilities(_addTargetKey, list);

  // re-render + sync sockets
  if (_addTargetKey === P1_ABILITIES_KEY) {
    renderAbilities(P1_ABILITIES_KEY, document.getElementById("p1Abilities"));
  } else {
    renderAbilities(P2_ABILITIES_KEY, document.getElementById("p2Abilities"));
  }
  syncServerAbilities();
  broadcast();

  // persist globally (abilities.json)
  await persistAbilityToServer(text);

  // UX
  showToast(`✅ تمت إضافة «${text}».`);
  closeAddAbilityModal();
}
window.openAddAbilityModal = openAddAbilityModal;
window.closeAddAbilityModal = closeAddAbilityModal;
window.confirmAddAbility  = confirmAddAbility;

// ===== ability requests + OK alerts =====
if (socket && gameID) {
  // OK badges; also remember state for viewers and broadcast
  socket.on("playerOk", (payload = {}) => {
    const { gameID: g, playerName, side } = payload;
    const active = Object.prototype.hasOwnProperty.call(payload, "active")
      ? !!payload.active
      : true; // legacy ON
    if (g && gameID && g !== gameID) return;
    if (side === "left")  okState.left  = { active, playerName };
    if (side === "right") okState.right = { active, playerName };
    if (active === false) hideOkBadge(side); else showOkBadge(side, playerName);
    broadcast();
  });
}

// ===== Initial render =====
renderRound();
