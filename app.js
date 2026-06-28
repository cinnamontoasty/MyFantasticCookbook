// ============================================================
// COOKBOOK APP — Firebase-synced version
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { STARTER_RECIPES } from "./starter-recipes.js";

// ---------- Firebase init ----------
let app, db, auth, userId = null;
let syncState = "connecting"; // connecting | needs-code | synced | offline | error
let unsubscribeSnapshot = null;

// The sync code is the real identity now -- not the anonymous auth UID.
// Anonymous auth still runs underneath (Firestore rules require *some*
// signed-in user), but every device that enters the same code lands on
// the exact same document, regardless of which browser or phone it is.
const SYNC_CODE_KEY = "cookbook_sync_code";
let syncCode = null; // e.g. "BethKitchen"

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase init failed", e);
  syncState = "error";
}

let recipes = [];
let currentView = { name: "list" };
let loaded = false;
let showImportModal = false;
let showSettingsModal = false;
let importText = "";
let importError = "";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Categories ----------
const CATEGORIES = ["Fish", "Meat", "Poultry", "Salads", "Sides", "Desserts", "Other"];
const COLLAPSE_KEY = "cookbook_collapsed_categories";

function getCollapsedCategories() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function setCollapsedCategories(list) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(list));
  } catch (e) {}
}
function toggleCategoryCollapsed(cat) {
  const collapsed = getCollapsedCategories();
  const idx = collapsed.indexOf(cat);
  if (idx === -1) collapsed.push(cat);
  else collapsed.splice(idx, 1);
  setCollapsedCategories(collapsed);
}

// Turns any sync code into a short, consistent, Firestore-safe document ID.
// Not cryptographic security -- just a stable, collision-resistant mapping
// so "BethKitchen" always points at the same document. Codes are
// case/whitespace-normalized so "BethKitchen" and "bethkitchen " match.
//
// Also normalizes "smart" typographic punctuation to plain ASCII. iOS
// auto-converts a typed straight apostrophe (') into a curly one (’) as
// you type; desktop browsers often don't apply the same autocorrect. Two
// people (or two devices) typing what looks like the identical code can
// end up with different underlying characters and silently land on two
// different documents. This makes both forms hash the same way.
function normalizeSmartPunctuation(str) {
  return str
    .replace(/[\u2018\u2019\u02BC\u02BB]/g, "'")   // curly single quotes/apostrophes -> '
    .replace(/[\u201C\u201D]/g, '"')                  // curly double quotes -> "
    .replace(/[\u2013\u2014]/g, "-");                 // en/em dash -> hyphen
}

async function hashSyncCode(code) {
  const normalized = normalizeSmartPunctuation(code.trim().toLowerCase());
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function getSavedSyncCode() {
  try {
    return localStorage.getItem(SYNC_CODE_KEY);
  } catch (e) {
    return null;
  }
}

function saveSyncCodeLocally(code) {
  try {
    localStorage.setItem(SYNC_CODE_KEY, code);
  } catch (e) {
    console.error("Couldn't remember sync code on this device", e);
  }
}

// Writes a throwaway value and immediately reads it back. In normal
// browsing this always matches. In some private/incognito modes,
// storage APIs accept writes without error but don't actually persist
// them (or get wiped faster than expected) -- this catches that
// silently-broken case instead of letting the symptom (recipes seem
// to "vanish") show up later with no explanation.
function storageIsReliable() {
  try {
    const testKey = "__cookbook_storage_test__";
    const testVal = String(Date.now());
    localStorage.setItem(testKey, testVal);
    const readBack = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    return readBack === testVal;
  } catch (e) {
    return false;
  }
}

// ---------- Auth + Firestore wiring ----------
function startFirebase() {
  if (!auth) {
    syncState = "error";
    loadLocalFallback();
    return;
  }
  const saved = getSavedSyncCode();
  if (saved) {
    syncCode = saved;
    signInAndAttach();
  } else {
    syncState = "needs-code";
    loaded = true;
    render();
  }
}

function signInAndAttach() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userId = user.uid;
      attachSnapshotListener();
    } else {
      signInAnonymously(auth).catch((e) => {
        console.error("Anonymous sign-in failed", e);
        syncState = "error";
        loadLocalFallback();
      });
    }
  });
  signInAnonymously(auth).catch((e) => {
    console.error("Anonymous sign-in failed", e);
    syncState = "error";
    loadLocalFallback();
  });
}

// Called when the person submits a sync code on the setup screen.
async function connectWithSyncCode(code) {
  if (!code || !code.trim()) return;
  syncCode = code.trim();
  saveSyncCodeLocally(syncCode);
  syncState = "connecting";
  loaded = false;
  render();
  signInAndAttach();
}

async function cookbookDocRef() {
  const docId = await hashSyncCode(syncCode);
  return doc(db, "cookbooks", docId);
}

async function attachSnapshotListener() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  const ref = await cookbookDocRef();

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // Brand new sync code nobody has used before -- seed with starters.
      await setDoc(ref, { recipes: STARTER_RECIPES });
    }
  } catch (e) {
    console.error("Initial fetch failed", e);
  }

  unsubscribeSnapshot = onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        recipes = snap.data().recipes || [];
      } else {
        recipes = [];
      }
      loaded = true;
      syncState = "synced";
      render();
    },
    (err) => {
      console.error("Snapshot error", err);
      syncState = "error";
      render();
    }
  );
}

async function persistRecipes() {
  if (!db || !syncCode) {
    saveLocalFallback();
    render();
    return;
  }
  try {
    const ref = await cookbookDocRef();
    await setDoc(ref, { recipes });
    syncState = "synced";
  } catch (e) {
    console.error("Save failed", e);
    syncState = "offline";
    saveLocalFallback();
  }
  render();
}

// ---------- Local fallback (only used if Firebase isn't configured yet) ----------
const LOCAL_KEY = "cookbook_recipes_fallback";
function loadLocalFallback() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    recipes = raw ? JSON.parse(raw) : STARTER_RECIPES;
  } catch (e) {
    recipes = STARTER_RECIPES;
  }
  loaded = true;
  render();
}
function saveLocalFallback() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(recipes));
  } catch (e) {
    console.error("Local fallback save failed", e);
  }
}

// ---------- Helpers ----------
function fmtAmount(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  if (Number.isInteger(num)) return num.toString();
  const fracs = { 0.25: "¼", 0.5: "½", 0.75: "¾", 0.33: "⅓", 0.67: "⅔", 0.125: "⅛" };
  const whole = Math.floor(num);
  const rem = +(num - whole).toFixed(2);
  if (fracs[rem]) return (whole > 0 ? whole + " " : "") + fracs[rem];
  return (Math.round(num * 100) / 100).toString();
}

function scaledAmount(amount, baseServings, currentServings) {
  if (amount === "" || amount === null || amount === undefined) return "";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num * (currentServings / baseServings);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + s.toString().padStart(2, "0");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function syncPillHtml() {
  const labels = {
    connecting: "Connecting…",
    synced: "Synced",
    offline: "Saved on device",
    error: "Setup needed"
  };
  const dotClass = syncState === "synced" ? "" : syncState === "connecting" ? "offline" : syncState === "offline" ? "offline" : "error";
  return `
    <button class="sync-pill" id="syncPill">
      <span class="sync-dot ${dotClass}"></span>${labels[syncState] || ""}
    </button>
  `;
}

// ---------- Render dispatcher ----------
function render() {
  const app = document.getElementById("app");

  if (syncState === "needs-code") {
    renderSyncCodeSetup(app);
    return;
  }

  if (!loaded) {
    app.innerHTML = '<div class="loading">Loading your cookbook…</div>';
    return;
  }
  if (currentView.name === "list") renderList(app);
  else if (currentView.name === "detail") renderDetail(app);
  else if (currentView.name === "cook") renderCook(app);
  else if (currentView.name === "add") renderAddForm(app);
  else if (currentView.name === "assign-categories") renderAssignCategories(app);

  // Always clear any existing modal nodes before deciding whether to draw
  // one fresh. This guarantees DOM state can never drift from app state,
  // even if render() is called multiple times in a row (e.g. once from
  // a sync callback, once from a user action) before a flag is flipped.
  document.querySelectorAll("#importOverlay, #settingsOverlay").forEach((el) => el.remove());
  if (showImportModal) renderImportModal();
  if (showSettingsModal) renderSettingsModal();
}

// ---------- Sync Code Setup Screen ----------
function renderSyncCodeSetup(appEl) {
  const reliable = storageIsReliable();
  appEl.innerHTML = `
    <div class="content" style="padding-top:60px;">
      <div class="hero-block" style="border-bottom:none;">
        <div class="title display" style="font-size:1.7rem;">Connect your cookbook</div>
        <p class="desc">Enter your sync code to load your recipes on this device. If you've never set one up, choose a memorable word or phrase now — anyone who enters the same code (like a family member) will share this exact cookbook.</p>
      </div>
      ${!reliable ? `
        <div class="modal-error" style="margin-bottom:18px;">
          This browser tab doesn't seem to allow saved data — this usually means you're in Private/Incognito Browsing. The sync code won't be remembered, and recipes may appear to be missing even though they're safe on your account. Switch to a regular (non-private) tab or your Home Screen icon for this to work reliably.
        </div>
      ` : ""}
      <div class="form-group">
        <label>Sync code</label>
        <input type="text" id="syncCodeInput" placeholder="e.g. BethKitchen" autocapitalize="none" autocorrect="off">
      </div>
      <button class="save-btn" id="syncCodeSubmit">Connect</button>
      <p class="hint" id="syncCodeError" style="color: var(--tomato-deep);"></p>
    </div>
  `;
  document.getElementById("syncCodeSubmit").addEventListener("click", () => {
    const val = document.getElementById("syncCodeInput").value;
    if (!val.trim()) {
      document.getElementById("syncCodeError").textContent = "Please enter a sync code.";
      return;
    }
    connectWithSyncCode(val);
  });
  document.getElementById("syncCodeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("syncCodeSubmit").click();
  });
}

// ---------- List View ----------
function recipeCardHtml(r) {
  const stepCount = r.steps.length;
  return `
    <div class="recipe-card" data-id="${r.id}">
      <button class="delete-x" data-delete="${r.id}">✕</button>
      <div class="title display">${escapeHtml(r.title)}</div>
      <div class="desc">${escapeHtml(r.description || "")}</div>
      <div class="meta">${r.baseServings} servings · ${stepCount} step${stepCount !== 1 ? "s" : ""}</div>
    </div>
  `;
}

function renderList(appEl) {
  let html = `
    <div class="topbar">
      <div class="brand"><span class="accent">My</span> Cookbook</div>
      <div class="topbar-right">
        ${syncPillHtml()}
        <button class="icon-btn" id="settingsBtn" style="font-size:1.1rem;">⚙</button>
      </div>
    </div>
    <div class="content">
  `;
  if (recipes.length === 0) {
    html += `
      <div class="empty-state">
        <div class="display">No recipes yet</div>
        <div>Tap + to add one, or import one Claude gave you.</div>
      </div>
    `;
  } else {
    const uncategorized = recipes.filter((r) => !r.category);
    if (uncategorized.length > 0) {
      html += `
        <div class="uncategorized-banner">
          <strong>${uncategorized.length} recipe${uncategorized.length !== 1 ? "s" : ""}</strong> need a category.
          <button class="small-btn" id="assignCategoriesBtn">Assign now</button>
        </div>
      `;
    }

    const collapsed = getCollapsedCategories();
    CATEGORIES.forEach((cat) => {
      const inCat = recipes.filter((r) => r.category === cat);
      if (inCat.length === 0) return;
      const isCollapsed = collapsed.includes(cat);
      html += `
        <div class="category-section">
          <button class="category-header" data-cat="${escapeHtml(cat)}">
            <span class="category-name">${escapeHtml(cat)}</span>
            <span class="category-count">${inCat.length}</span>
            <span class="category-chevron ${isCollapsed ? "collapsed" : ""}">▾</span>
          </button>
          <div class="category-body ${isCollapsed ? "hidden" : ""}">
            ${inCat.slice().reverse().map((r) => recipeCardHtml(r)).join("")}
          </div>
        </div>
      `;
    });
  }
  html += `</div><button class="fab fab-import" id="fabImport" title="Import from Claude">⬇</button><button class="fab" id="fabAdd">+</button>`;
  appEl.innerHTML = html;

  appEl.querySelectorAll(".recipe-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".delete-x")) return;
      openDetail(card.dataset.id);
    });
  });
  appEl.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      if (confirm("Delete this recipe?")) {
        recipes = recipes.filter((r) => r.id !== id);
        persistRecipes();
      }
    });
  });
  appEl.querySelectorAll(".category-header").forEach((header) => {
    header.addEventListener("click", () => {
      toggleCategoryCollapsed(header.dataset.cat);
      render();
    });
  });
  const assignBtn = document.getElementById("assignCategoriesBtn");
  if (assignBtn) {
    assignBtn.addEventListener("click", () => {
      currentView = { name: "assign-categories" };
      render();
    });
  }
  document.getElementById("fabAdd").addEventListener("click", () => {
    currentView = { name: "add" };
    render();
  });
  document.getElementById("fabImport").addEventListener("click", () => {
    showImportModal = true;
    render();
  });
  document.getElementById("settingsBtn").addEventListener("click", () => {
    showSettingsModal = true;
    render();
  });
  const pill = document.getElementById("syncPill");
  if (pill) pill.addEventListener("click", () => { showSettingsModal = true; render(); });
}

function openDetail(id) {
  currentView = { name: "detail", id, servings: recipes.find((r) => r.id === id).baseServings, checked: {} };
  render();
}

// ---------- Assign Categories (for pre-existing recipes) ----------
function renderAssignCategories(appEl) {
  const uncategorized = recipes.filter((r) => !r.category);
  appEl.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="backFromAssign">‹ Cookbook</button>
    </div>
    <div class="content">
      <h2 class="display" style="margin-top:4px;">Assign categories</h2>
      <p class="hint" style="margin-bottom:20px;">Pick a category for each recipe below. Changes save as you go.</p>
      ${uncategorized.length === 0 ? `<p class="hint">All recipes are categorized.</p>` : ""}
      ${uncategorized.map((r) => `
        <div class="settings-row" style="align-items:flex-start;">
          <span class="label" style="max-width:55%;">${escapeHtml(r.title)}</span>
          ${categorySelectHtml("", "assign-" + r.id)}
        </div>
      `).join("")}
    </div>
  `;
  document.getElementById("backFromAssign").addEventListener("click", () => {
    currentView = { name: "list" };
    render();
  });
  uncategorized.forEach((r) => {
    const sel = document.getElementById("assign-" + r.id);
    if (sel) {
      sel.addEventListener("change", async (e) => {
        const recipe = recipes.find((rec) => rec.id === r.id);
        if (recipe) recipe.category = e.target.value;
        await persistRecipes();
        render();
      });
    }
  });
}

// ---------- Detail View ----------
function renderDetail(appEl) {
  const recipe = recipes.find((r) => r.id === currentView.id);
  if (!recipe) { currentView = { name: "list" }; return render(); }
  const servings = currentView.servings;

  let html = `
    <div class="topbar">
      <button class="back-btn" id="backBtn">‹ Cookbook</button>
    </div>
    <div class="content">
      <div class="hero-block">
        <div class="title display">${escapeHtml(recipe.title)}</div>
        <p class="desc">${escapeHtml(recipe.description || "")}</p>
      </div>

      <div class="servings-row">
        <span class="label">Servings</span>
        <div class="stepper">
          <button id="servDown">−</button>
          <span class="count">${servings}</span>
          <button id="servUp">+</button>
        </div>
      </div>

      <div class="section-label">Ingredients</div>
  `;

  recipe.ingredients.forEach((ing) => {
    const amt = scaledAmount(ing.amount, recipe.baseServings, servings);
    const amtStr = amt === "" ? "" : fmtAmount(amt) + (ing.unit ? " " + ing.unit : "");
    const isChecked = !!currentView.checked[ing.id];
    html += `
      <div class="ingredient-row ${isChecked ? "checked" : ""}" data-ing="${ing.id}">
        <div class="checkbox ${isChecked ? "checked" : ""}">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M4 12l5 5L20 7"/></svg>
        </div>
        <div class="ingredient-text">
          ${amtStr ? `<span class="ingredient-amt">${escapeHtml(amtStr)}</span> ` : ""}${escapeHtml(ing.name)}
        </div>
      </div>
    `;
  });

  html += `<div class="section-label">Steps</div>`;
  recipe.steps.forEach((step, i) => {
    html += `
      <div class="step-preview">
        <div class="step-num">${i + 1}</div>
        <div>
          <p class="step-title">${escapeHtml(step.title)}</p>
          <p class="step-content">${escapeHtml(step.content)}</p>
          ${step.timerSeconds ? `<span class="step-timer-tag">⏱ ${fmtTime(step.timerSeconds)}</span>` : ""}
        </div>
      </div>
    `;
  });

  if (recipe.notes) {
    html += `<div class="notes-block"><div class="section-label">Notes</div>${escapeHtml(recipe.notes)}</div>`;
  }

  html += `<button class="start-cooking-btn" id="startCookBtn">Start Cooking Mode →</button></div>`;
  appEl.innerHTML = html;

  document.getElementById("backBtn").addEventListener("click", () => { currentView = { name: "list" }; render(); });
  document.getElementById("servUp").addEventListener("click", () => { currentView.servings = Math.min(99, currentView.servings + 1); render(); });
  document.getElementById("servDown").addEventListener("click", () => { currentView.servings = Math.max(1, currentView.servings - 1); render(); });
  appEl.querySelectorAll(".ingredient-row").forEach((row) => {
    row.addEventListener("click", () => {
      currentView.checked[row.dataset.ing] = !currentView.checked[row.dataset.ing];
      render();
    });
  });
  document.getElementById("startCookBtn").addEventListener("click", () => {
    currentView = {
      name: "cook", id: recipe.id, servings: currentView.servings, stepIndex: 0,
      timerRemaining: recipe.steps[0].timerSeconds || 0, timerRunning: false
    };
    render();
  });
}

// ---------- Cook Mode ----------
let activeInterval = null;
function clearActiveInterval() {
  if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
}

// ---------- Voice: read-aloud (Text-to-Speech) ----------
// Works in Safari and Chrome on iOS/Android -- no special permissions needed.
let speaking = false;

function speak(text, onDone) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // stop anything currently being read
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  speaking = true;
  utter.onend = () => { speaking = false; if (onDone) onDone(); };
  utter.onerror = () => { speaking = false; };
  window.speechSynthesis.speak(utter);

  // iOS Safari sometimes drops speak() silently if it isn't satisfied the
  // call originated from a direct user gesture (this is more likely for
  // voice-triggered speech than for the tap-the-speaker-icon path). If
  // nothing is actually speaking shortly after we asked it to, surface
  // that instead of leaving the person wondering why it's silent.
  setTimeout(() => {
    if (speaking && !window.speechSynthesis.speaking) {
      speaking = false;
      const transcriptEl = document.getElementById("voiceTranscript");
      if (transcriptEl) {
        transcriptEl.textContent = "Voice reply didn't play — tap 🔊 above to hear this step instead.";
      }
    }
  }, 150);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  speaking = false;
}

// Strip {0001}-style ingredient tokens down to their plain-language label
// for speech, the same way the visual highlight does for display.
function spokenStepText(recipe, step) {
  let text = step.content;
  recipe.ingredients.forEach((ing) => {
    const token = "{" + ing.id + "}";
    if (text.includes(token)) {
      const amt = scaledAmount(ing.amount, recipe.baseServings, currentView.servings);
      const amtStr = amt === "" ? "" : fmtAmount(amt) + (ing.unit ? " " + ing.unit : "");
      const label = (amtStr ? amtStr + " " : "") + ing.name;
      text = text.split(token).join(label);
    }
  });
  return `${step.title}. ${text}`;
}

function spokenIngredientsText(recipe) {
  const lines = recipe.ingredients.map((ing) => {
    const amt = scaledAmount(ing.amount, recipe.baseServings, currentView.servings);
    const amtStr = amt === "" ? "" : fmtAmount(amt) + (ing.unit ? " " + ing.unit : "");
    return `${amtStr ? amtStr + " " : ""}${ing.name}`;
  });
  return "Here's what you need: " + lines.join(". ");
}

// ---------- Voice: tap-to-talk (Speech Recognition) ----------
// iOS Safari only supports short, tap-triggered listening sessions --
// not continuous background listening like a smart speaker. This sets
// up one listening session per tap, which is the realistic ceiling
// for this browser.
let recognizer = null;
let listening = false;

function getRecognizer() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  if (!recognizer) {
    recognizer = new SpeechRecognition();
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.lang = "en-US";
  }
  return recognizer;
}

function voiceCommandSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Maps a heard phrase to one of a fixed set of intents. Kept deliberately
// simple and forgiving (substring match) since voice transcripts are noisy.
function parseVoiceCommand(transcript) {
  const t = transcript.toLowerCase();
  if (t.includes("repeat") || t.includes("again") || t.includes("say that")) return "repeat";
  if (t.includes("ingredient")) return "ingredients";
  if (t.includes("previous") || t.includes("back") || t.includes("go back")) return "previous";
  if (t.includes("next") || t.includes("continue") || t.includes("forward")) return "next";
  if (t.includes("stop") || t.includes("quiet") || t.includes("cancel")) return "stop";
  return null;
}

function renderCook(appEl) {
  const recipe = recipes.find((r) => r.id === currentView.id);
  if (!recipe) { currentView = { name: "list" }; return render(); }
  const idx = currentView.stepIndex;
  const step = recipe.steps[idx];
  const total = recipe.steps.length;
  const pct = ((idx + 1) / total) * 100;

  let contentHtml = escapeHtml(step.content);
  recipe.ingredients.forEach((ing) => {
    const token = "{" + ing.id + "}";
    if (step.content.includes(token)) {
      const amt = scaledAmount(ing.amount, recipe.baseServings, currentView.servings);
      const amtStr = amt === "" ? "" : fmtAmount(amt) + (ing.unit ? " " + ing.unit : "");
      const label = (amtStr ? amtStr + " " : "") + ing.name;
      contentHtml = contentHtml.split(escapeHtml(token)).join(`<span class="ing-highlight">${escapeHtml(label)}</span>`);
    }
  });

  const timeDone = currentView.timerRemaining <= 0 && step.timerSeconds;
  const voiceSupported = voiceCommandSupported();
  // iOS exposes navigator.standalone === true only when launched from a
  // Home Screen icon. Voice recognition is documented to be unreliable
  // specifically in that mode, even though it works fine in a normal tab.
  const isStandalonePWA = window.navigator.standalone === true;

  appEl.innerHTML = `
    <div class="cook-mode">
      <div class="cook-top">
        <button class="close-btn" id="closeCook">✕</button>
        <div class="cook-progress">Step ${idx + 1} of ${total}</div>
        <button class="close-btn" id="speakStepBtn" title="Read this step aloud">${speaking ? "⏸" : "🔊"}</button>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="cook-body">
        <div class="cook-step-title display">${escapeHtml(step.title)}</div>
        <p class="cook-step-content">${contentHtml}</p>
        ${step.timerSeconds ? `
          <div class="timer-block">
            <div class="timer-display ${timeDone ? "done" : ""}">${timeDone ? "Time's up!" : fmtTime(currentView.timerRemaining)}</div>
            <div class="timer-controls">
              <button class="start-pause" id="timerToggle">${currentView.timerRunning ? "Pause" : (currentView.timerRemaining === step.timerSeconds ? "Start Timer" : "Resume")}</button>
              <button class="reset" id="timerReset">Reset</button>
            </div>
          </div>` : ""}
        ${voiceSupported ? `
          <div class="voice-block">
            ${isStandalonePWA ? `
              <button class="voice-safari-btn" id="openInSafariBtn">↗ Open in Safari for voice commands</button>
              <p class="voice-hint" style="margin-top:8px;">Voice commands are unreliable from the Home Screen icon on iPhone. Tap above to continue in a regular Safari tab — read-aloud (🔊) works fine right here either way.</p>
            ` : `
              <button class="voice-mic-btn ${listening ? "listening" : ""}" id="voiceMicBtn">
                ${listening ? "🎙 Listening…" : "🎤 Tap & say a command"}
              </button>
              <p class="voice-hint">Try: "next step", "repeat", "ingredients", "go back"</p>
              <p class="voice-transcript" id="voiceTranscript"></p>
            `}
          </div>
        ` : `
          <p class="voice-hint" style="margin-top:20px;">Voice commands aren't supported in this browser — read-aloud (🔊 above) still works.</p>
        `}
      </div>
      <div class="cook-nav">
        <button class="nav-prev" id="prevStep" ${idx === 0 ? "disabled" : ""}>← Back</button>
        <button class="nav-next" id="nextStep">${idx === total - 1 ? "Finish 🎉" : "Next Step →"}</button>
      </div>
    </div>
  `;

  function goToStep(newIdx) {
    clearActiveInterval();
    stopSpeaking();
    const newStep = recipe.steps[newIdx];
    currentView.stepIndex = newIdx;
    currentView.timerRemaining = newStep.timerSeconds || 0;
    currentView.timerRunning = false;
    render();
  }

  // Same as goToStep but used after a voice command that has already
  // queued speech for the destination step -- must NOT cancel that speech.
  function goToStepKeepingSpeech(newIdx) {
    clearActiveInterval();
    const newStep = recipe.steps[newIdx];
    currentView.stepIndex = newIdx;
    currentView.timerRemaining = newStep.timerSeconds || 0;
    currentView.timerRunning = false;
    render();
  }

  document.getElementById("closeCook").addEventListener("click", () => {
    clearActiveInterval();
    stopSpeaking();
    currentView = { name: "detail", id: recipe.id, servings: currentView.servings, checked: {} };
    render();
  });
  document.getElementById("prevStep").addEventListener("click", () => {
    if (idx > 0) goToStep(idx - 1);
  });
  document.getElementById("nextStep").addEventListener("click", () => {
    if (idx === total - 1) {
      clearActiveInterval();
      stopSpeaking();
      currentView = { name: "detail", id: recipe.id, servings: currentView.servings, checked: {} };
      render();
      return;
    }
    goToStep(idx + 1);
  });

  document.getElementById("speakStepBtn").addEventListener("click", () => {
    if (speaking) {
      stopSpeaking();
      render();
    } else {
      speak(spokenStepText(recipe, step), () => render());
      render();
    }
  });

  if (step.timerSeconds) {
    document.getElementById("timerToggle").addEventListener("click", () => {
      if (currentView.timerRunning) {
        clearActiveInterval();
        currentView.timerRunning = false;
        render();
      } else {
        currentView.timerRunning = true;
        render();
        activeInterval = setInterval(() => {
          if (currentView.timerRemaining > 0) {
            currentView.timerRemaining -= 1;
            const disp = document.querySelector(".timer-display");
            if (disp) {
              if (currentView.timerRemaining <= 0) {
                disp.textContent = "Time's up!";
                disp.classList.add("done");
                clearActiveInterval();
                currentView.timerRunning = false;
                const tb = document.getElementById("timerToggle");
                if (tb) tb.textContent = "Resume";
                speak("Time's up!");
              } else {
                disp.textContent = fmtTime(currentView.timerRemaining);
              }
            }
          }
        }, 1000);
      }
    });
    document.getElementById("timerReset").addEventListener("click", () => {
      clearActiveInterval();
      currentView.timerRemaining = step.timerSeconds;
      currentView.timerRunning = false;
      render();
    });
  }

  if (isStandalonePWA && voiceSupported) {
    document.getElementById("openInSafariBtn").addEventListener("click", () => {
      // Opening the current URL as a normal link (rather than via the
      // standalone PWA shell) routes it into an actual Safari tab on iOS,
      // where speech recognition is reliable.
      window.open(window.location.href, "_blank");
    });
  } else if (voiceSupported) {
    document.getElementById("voiceMicBtn").addEventListener("click", () => {
      if (listening) return; // ignore taps while already listening
      const rec = getRecognizer();
      if (!rec) return;
      stopSpeaking();
      listening = true;
      render();

      const transcriptEl = () => document.getElementById("voiceTranscript");

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcriptEl()) transcriptEl().textContent = `Heard: "${transcript}"`;
        const intent = parseVoiceCommand(transcript);
        handleVoiceIntent(intent, recipe, idx, total, step, goToStepKeepingSpeech);
      };
      rec.onerror = () => {
        listening = false;
        render();
      };
      rec.onend = () => {
        listening = false;
        // Don't re-render here if onresult already triggered a navigation
        // re-render -- only clean up the mic button if nothing else did.
        const micBtn = document.getElementById("voiceMicBtn");
        if (micBtn) render();
      };

      try {
        rec.start();
      } catch (e) {
        listening = false;
        render();
      }
    });
  }
}

function handleVoiceIntent(intent, recipe, idx, total, step, goToStep) {
  switch (intent) {
    case "next":
      if (idx === total - 1) {
        speak("That was the last step. Nice work!");
      } else {
        const newStep = recipe.steps[idx + 1];
        speak(spokenStepText(recipe, newStep));
        goToStep(idx + 1);
      }
      break;
    case "previous":
      if (idx === 0) {
        speak("You're already on the first step.");
      } else {
        const newStep = recipe.steps[idx - 1];
        speak(spokenStepText(recipe, newStep));
        goToStep(idx - 1);
      }
      break;
    case "repeat":
      speak(spokenStepText(recipe, step));
      break;
    case "ingredients":
      speak(spokenIngredientsText(recipe));
      break;
    case "stop":
      stopSpeaking();
      break;
    default:
      speak("Sorry, I didn't catch that. You can say next step, repeat, ingredients, or go back.");
  }
}

// ---------- Add Recipe Form ----------
let draft = null;
function freshDraft() {
  return {
    title: "", description: "", baseServings: 4, notes: "", category: "",
    ingredients: [{ localId: uid(), amount: "", unit: "", name: "" }],
    steps: [{ localId: uid(), title: "", content: "", hasTimer: false, timerMinutes: "" }]
  };
}

function categorySelectHtml(selectedValue, idAttr) {
  return `
    <select id="${idAttr}">
      <option value="" ${!selectedValue ? "selected" : ""} disabled>Choose a category…</option>
      ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${selectedValue === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
    </select>
  `;
}

function renderAddForm(appEl) {
  if (!draft) draft = freshDraft();

  appEl.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="cancelAdd">‹ Cancel</button>
    </div>
    <div class="content">
      <h2 class="display" style="margin-top:4px;">New Recipe</h2>
      <p class="hint" style="margin-bottom:18px;">Building one by hand? Use this form. Got a recipe from Claude? Use the Import button below instead — it's faster.</p>

      <div class="form-group">
        <label>Title</label>
        <input type="text" id="f-title" placeholder="e.g. Lime Turkey Meatballs" value="${escapeHtml(draft.title)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="f-desc" placeholder="A short one-liner about the dish">${escapeHtml(draft.description)}</textarea>
      </div>
      <div class="form-group">
        <label>Category</label>
        ${categorySelectHtml(draft.category, "f-category")}
      </div>
      <div class="form-group">
        <label>Base servings</label>
        <input type="number" id="f-servings" min="1" value="${draft.baseServings}" style="max-width:100px;">
      </div>

      <div class="section-label">Ingredients</div>
      <div id="ingList"></div>
      <button class="add-row-btn" id="addIngBtn">+ Add ingredient</button>

      <div class="section-label">Steps</div>
      <div id="stepList"></div>
      <button class="add-row-btn" id="addStepBtn">+ Add step</button>

      <div class="form-group" style="margin-top:24px;">
        <label>Notes (optional)</label>
        <textarea id="f-notes" placeholder="Tips, substitutions, serving suggestions">${escapeHtml(draft.notes)}</textarea>
      </div>

      <button class="save-btn" id="saveBtn">Save Recipe</button>
    </div>
  `;

  renderIngredientRows();
  renderStepRows();

  document.getElementById("cancelAdd").addEventListener("click", () => {
    if (confirm("Discard this recipe?")) { draft = null; currentView = { name: "list" }; render(); }
  });
  document.getElementById("f-title").addEventListener("input", (e) => (draft.title = e.target.value));
  document.getElementById("f-desc").addEventListener("input", (e) => (draft.description = e.target.value));
  document.getElementById("f-category").addEventListener("change", (e) => (draft.category = e.target.value));
  document.getElementById("f-servings").addEventListener("input", (e) => (draft.baseServings = parseInt(e.target.value) || 1));
  document.getElementById("f-notes").addEventListener("input", (e) => (draft.notes = e.target.value));
  document.getElementById("addIngBtn").addEventListener("click", () => {
    draft.ingredients.push({ localId: uid(), amount: "", unit: "", name: "" });
    renderIngredientRows();
  });
  document.getElementById("addStepBtn").addEventListener("click", () => {
    draft.steps.push({ localId: uid(), title: "", content: "", hasTimer: false, timerMinutes: "" });
    renderStepRows();
  });
  document.getElementById("saveBtn").addEventListener("click", saveDraft);
}

function renderIngredientRows() {
  const container = document.getElementById("ingList");
  if (!container) return;
  container.innerHTML = draft.ingredients.map((ing) => `
    <div class="dyn-row" data-ing-row="${ing.localId}">
      <input class="amt-input" type="text" placeholder="Amt" value="${escapeHtml(ing.amount)}" data-field="amount">
      <input class="unit-input" type="text" placeholder="Unit" value="${escapeHtml(ing.unit)}" data-field="unit">
      <input type="text" placeholder="Ingredient name" value="${escapeHtml(ing.name)}" data-field="name">
      ${draft.ingredients.length > 1 ? `<button class="remove-row-btn" data-remove-ing="${ing.localId}">✕</button>` : ""}
    </div>
  `).join("");

  container.querySelectorAll("[data-ing-row]").forEach((row) => {
    const ing = draft.ingredients.find((i) => i.localId === row.dataset.ingRow);
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => { ing[e.target.dataset.field] = e.target.value; });
    });
  });
  container.querySelectorAll("[data-remove-ing]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.ingredients = draft.ingredients.filter((i) => i.localId !== btn.dataset.removeIng);
      renderIngredientRows();
    });
  });
}

function renderStepRows() {
  const container = document.getElementById("stepList");
  if (!container) return;
  container.innerHTML = draft.steps.map((step, i) => `
    <div style="border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px;" data-step-row="${step.localId}">
      <div class="dyn-row" style="margin-bottom:8px;">
        <input type="text" placeholder="Step ${i + 1} title" value="${escapeHtml(step.title)}" data-field="title">
        ${draft.steps.length > 1 ? `<button class="remove-row-btn" data-remove-step="${step.localId}">✕</button>` : ""}
      </div>
      <textarea placeholder="What to do in this step" data-field="content" style="width:100%; margin-bottom:8px;">${escapeHtml(step.content)}</textarea>
      <div class="timer-toggle-row">
        <input type="checkbox" data-field="hasTimer" ${step.hasTimer ? "checked" : ""}>
        <span style="font-size:0.88rem;">Needs a timer</span>
        ${step.hasTimer ? `<input class="mins-input" type="number" min="0" placeholder="min" value="${escapeHtml(step.timerMinutes)}" data-field="timerMinutes">` : ""}
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-step-row]").forEach((row) => {
    const step = draft.steps.find((s) => s.localId === row.dataset.stepRow);
    row.querySelectorAll("input[type=text], textarea").forEach((input) => {
      input.addEventListener("input", (e) => { step[e.target.dataset.field] = e.target.value; });
    });
    const cb = row.querySelector("input[type=checkbox]");
    if (cb) cb.addEventListener("change", (e) => { step.hasTimer = e.target.checked; renderStepRows(); });
    const minsInput = row.querySelector(".mins-input");
    if (minsInput) minsInput.addEventListener("input", (e) => { step.timerMinutes = e.target.value; });
  });
  container.querySelectorAll("[data-remove-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.steps = draft.steps.filter((s) => s.localId !== btn.dataset.removeStep);
      renderStepRows();
    });
  });
}

async function saveDraft() {
  if (!draft.title.trim()) { alert("Please give the recipe a title."); return; }
  if (!draft.category) { alert("Please choose a category."); return; }
  const validIngredients = draft.ingredients.filter((i) => i.name.trim());
  const validSteps = draft.steps.filter((s) => s.content.trim());
  if (validSteps.length === 0) { alert("Please add at least one step."); return; }

  const recipe = {
    id: uid(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category,
    baseServings: draft.baseServings || 4,
    notes: draft.notes.trim(),
    ingredients: validIngredients.map((i) => ({ id: i.localId, amount: i.amount.trim(), unit: i.unit.trim(), name: i.name.trim() })),
    steps: validSteps.map((s) => ({
      title: s.title.trim() || "Step",
      content: s.content.trim(),
      timerSeconds: s.hasTimer && s.timerMinutes ? Math.round(parseFloat(s.timerMinutes) * 60) : 0
    }))
  };

  recipes.push(recipe);
  await persistRecipes();
  draft = null;
  currentView = { name: "list" };
  render();
}

// ---------- Import from Claude (JSON paste) Modal ----------
let importCategory = "";

function renderImportModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "importOverlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="display">Import a recipe</h2>
      <p class="helper">Ask Claude for a recipe and say "give me the JSON for my cookbook app." Paste what it gives you below.</p>
      <textarea class="json-input" id="importTextarea" placeholder='{"title": "...", "ingredients": [...], "steps": [...]}'>${escapeHtml(importText)}</textarea>
      <div class="form-group" style="margin-top:14px;">
        <label>Category</label>
        ${categorySelectHtml(importCategory, "importCategorySelect")}
      </div>
      ${importError ? `<div class="modal-error">${escapeHtml(importError)}</div>` : ""}
      <div class="modal-actions">
        <button class="modal-cancel" id="importCancel">Cancel</button>
        <button class="modal-confirm" id="importConfirm">Add Recipe</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("importTextarea").addEventListener("input", (e) => (importText = e.target.value));
  document.getElementById("importCategorySelect").addEventListener("change", (e) => (importCategory = e.target.value));
  document.getElementById("importCancel").addEventListener("click", () => {
    showImportModal = false; importText = ""; importError = ""; importCategory = "";
    document.getElementById("importOverlay").remove();
  });
  document.getElementById("importConfirm").addEventListener("click", handleImportConfirm);
}

function normalizeImportedRecipe(obj, chosenCategory) {
  if (!obj.title || !Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new Error("Needs at least a title and one step.");
  }
  const category = obj.category && CATEGORIES.includes(obj.category) ? obj.category : chosenCategory;
  if (!category) {
    throw new Error("Please choose a category before adding this recipe.");
  }
  const ingredients = (obj.ingredients || []).map((ing) => ({
    id: ing.id || uid(),
    amount: ing.amount !== undefined && ing.amount !== null ? String(ing.amount) : "",
    unit: ing.unit || "",
    name: ing.name || ""
  })).filter(i => i.name);

  const steps = obj.steps.map((s) => ({
    title: s.title || "Step",
    content: s.content || "",
    timerSeconds: s.timer_seconds || s.timerSeconds || 0
  })).filter(s => s.content);

  if (steps.length === 0) throw new Error("No valid steps found.");

  return {
    id: uid(),
    title: String(obj.title),
    description: obj.description || "",
    category,
    baseServings: obj.base_servings || obj.baseServings || 4,
    notes: obj.notes || "",
    ingredients,
    steps
  };
}

async function handleImportConfirm() {
  importError = "";
  let parsed;
  try {
    parsed = JSON.parse(importText);
  } catch (e) {
    importError = "That doesn't look like valid JSON. Make sure you copied the whole thing, including the { } at each end.";
    render();
    return;
  }
  try {
    const recipe = normalizeImportedRecipe(parsed, importCategory);
    recipes.push(recipe);
    showImportModal = false;
    importText = "";
    importError = "";
    importCategory = "";
    currentView = { name: "list" };
    await persistRecipes();
  } catch (e) {
    importError = e.message || "Couldn't read that recipe format.";
    render();
  }
}

// ---------- Settings Modal ----------
function renderSettingsModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "settingsOverlay";
  const statusText = {
    connecting: "Connecting to your synced cookbook…",
    synced: "Your recipes are synced and backed up.",
    offline: "Saved on this device only — check your Firebase setup in firebase-config.js.",
    error: "Sync isn't set up yet. Recipes are saved on this device only until firebase-config.js is filled in."
  };
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="display">Settings</h2>
      <div class="settings-row">
        <span class="label">Sync status</span>
        <span class="value">${statusText[syncState] || ""}</span>
      </div>
      ${syncCode ? `
        <div class="settings-row">
          <span class="label">Sync code</span>
          <span class="value">${escapeHtml(syncCode)}</span>
        </div>
        <p class="hint">Enter this same code on another device (or have your husband enter it) to share this exact cookbook.</p>
        <div class="settings-row">
          <span class="label">Document ID (debug)</span>
          <span class="value" id="debugDocId">loading…</span>
        </div>
        <p class="hint">If this ID matches across two browsers/tabs that both used the same sync code, they're definitely looking at the same cookbook.</p>
      ` : ""}
      <div class="settings-row">
        <span class="label">Recipes saved</span>
        <span class="value">${recipes.length}</span>
      </div>
      <div class="settings-row">
        <span class="label">Add a recipe from Claude</span>
        <button class="small-btn" id="openImportFromSettings">Import</button>
      </div>
      ${syncCode ? `
        <div class="settings-row" style="border-bottom:none;">
          <span class="label">Switch to a different sync code</span>
          <button class="small-btn" id="switchSyncCodeBtn">Switch</button>
        </div>
      ` : ""}
      <div class="modal-actions" style="margin-top:20px;">
        <button class="modal-cancel" id="settingsClose">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (syncCode) {
    hashSyncCode(syncCode).then((docId) => {
      const el = document.getElementById("debugDocId");
      if (el) el.textContent = docId;
    });
  }
  document.getElementById("settingsClose").addEventListener("click", () => {
    showSettingsModal = false;
    document.getElementById("settingsOverlay").remove();
  });
  document.getElementById("openImportFromSettings").addEventListener("click", () => {
    showSettingsModal = false;
    document.getElementById("settingsOverlay").remove();
    showImportModal = true;
    render();
  });
  const switchBtn = document.getElementById("switchSyncCodeBtn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      if (!confirm("Switch to a different sync code? This device will disconnect from the current cookbook until you enter a code again.")) return;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      try { localStorage.removeItem(SYNC_CODE_KEY); } catch (e) {}
      syncCode = null;
      syncState = "needs-code";
      loaded = false;
      showSettingsModal = false;
      document.getElementById("settingsOverlay").remove();
      currentView = { name: "list" };
      render();
    });
  }
}

// ---------- Boot ----------
startFirebase();
render();