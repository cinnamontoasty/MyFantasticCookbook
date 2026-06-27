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
let firebaseReady = false;
let syncState = "connecting"; // connecting | synced | offline | error
let unsubscribeSnapshot = null;

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

// ---------- Auth + Firestore wiring ----------
function startFirebase() {
  if (!auth) {
    // Config not filled in yet -- fall back to local-only so the app
    // is still usable, and tell the user via the sync pill.
    syncState = "error";
    loadLocalFallback();
    return;
  }
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

function cookbookDocRef() {
  return doc(db, "cookbooks", userId);
}

async function attachSnapshotListener() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  const ref = cookbookDocRef();

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // First time ever opening the app on this Firebase project --
      // seed with the starter recipes.
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
  if (!db || !userId) {
    saveLocalFallback();
    return;
  }
  try {
    await setDoc(cookbookDocRef(), { recipes });
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
  if (!loaded) {
    app.innerHTML = '<div class="loading">Loading your cookbook…</div>';
    return;
  }
  if (currentView.name === "list") renderList(app);
  else if (currentView.name === "detail") renderDetail(app);
  else if (currentView.name === "cook") renderCook(app);
  else if (currentView.name === "add") renderAddForm(app);

  if (showImportModal) renderImportModal();
  if (showSettingsModal) renderSettingsModal();
}

// ---------- List View ----------
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
    recipes.slice().reverse().forEach((r) => {
      const stepCount = r.steps.length;
      html += `
        <div class="recipe-card" data-id="${r.id}">
          <button class="delete-x" data-delete="${r.id}">✕</button>
          <div class="title display">${escapeHtml(r.title)}</div>
          <div class="desc">${escapeHtml(r.description || "")}</div>
          <div class="meta">${r.baseServings} servings · ${stepCount} step${stepCount !== 1 ? "s" : ""}</div>
        </div>
      `;
    });
  }
  html += `</div><button class="fab" id="fabAdd">+</button>`;
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
  document.getElementById("fabAdd").addEventListener("click", () => {
    currentView = { name: "add" };
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

  appEl.innerHTML = `
    <div class="cook-mode">
      <div class="cook-top">
        <button class="close-btn" id="closeCook">✕</button>
        <div class="cook-progress">Step ${idx + 1} of ${total}</div>
        <div style="width:36px"></div>
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
      </div>
      <div class="cook-nav">
        <button class="nav-prev" id="prevStep" ${idx === 0 ? "disabled" : ""}>← Back</button>
        <button class="nav-next" id="nextStep">${idx === total - 1 ? "Finish 🎉" : "Next Step →"}</button>
      </div>
    </div>
  `;

  document.getElementById("closeCook").addEventListener("click", () => {
    clearActiveInterval();
    currentView = { name: "detail", id: recipe.id, servings: currentView.servings, checked: {} };
    render();
  });
  document.getElementById("prevStep").addEventListener("click", () => {
    clearActiveInterval();
    const newIdx = idx - 1, newStep = recipe.steps[newIdx];
    currentView.stepIndex = newIdx;
    currentView.timerRemaining = newStep.timerSeconds || 0;
    currentView.timerRunning = false;
    render();
  });
  document.getElementById("nextStep").addEventListener("click", () => {
    clearActiveInterval();
    if (idx === total - 1) {
      currentView = { name: "detail", id: recipe.id, servings: currentView.servings, checked: {} };
      render();
      return;
    }
    const newIdx = idx + 1, newStep = recipe.steps[newIdx];
    currentView.stepIndex = newIdx;
    currentView.timerRemaining = newStep.timerSeconds || 0;
    currentView.timerRunning = false;
    render();
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
}

// ---------- Add Recipe Form ----------
let draft = null;
function freshDraft() {
  return {
    title: "", description: "", baseServings: 4, notes: "",
    ingredients: [{ localId: uid(), amount: "", unit: "", name: "" }],
    steps: [{ localId: uid(), title: "", content: "", hasTimer: false, timerMinutes: "" }]
  };
}

function renderAddForm(appEl) {
  if (!draft) draft = freshDraft();

  appEl.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="cancelAdd">‹ Cancel</button>
    </div>
    <div class="content">
      <h2 class="display" style="margin-top:4px;">New Recipe</h2>
      <p class="hint" style="margin-bottom:18px;">Building one by hand? Use this form. Got a recipe from Claude? Tap ⚙ on the main screen and use "Import from Claude" instead — it's faster.</p>

      <div class="form-group">
        <label>Title</label>
        <input type="text" id="f-title" placeholder="e.g. Lime Turkey Meatballs" value="${escapeHtml(draft.title)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="f-desc" placeholder="A short one-liner about the dish">${escapeHtml(draft.description)}</textarea>
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
  const validIngredients = draft.ingredients.filter((i) => i.name.trim());
  const validSteps = draft.steps.filter((s) => s.content.trim());
  if (validSteps.length === 0) { alert("Please add at least one step."); return; }

  const recipe = {
    id: uid(),
    title: draft.title.trim(),
    description: draft.description.trim(),
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
function renderImportModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "importOverlay";
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="display">Import a recipe</h2>
      <p class="helper">Ask Claude for a recipe and say "give me the JSON for my cookbook app." Paste what it gives you below.</p>
      <textarea class="json-input" id="importTextarea" placeholder='{"title": "...", "ingredients": [...], "steps": [...]}'>${escapeHtml(importText)}</textarea>
      ${importError ? `<div class="modal-error">${escapeHtml(importError)}</div>` : ""}
      <div class="modal-actions">
        <button class="modal-cancel" id="importCancel">Cancel</button>
        <button class="modal-confirm" id="importConfirm">Add Recipe</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("importTextarea").addEventListener("input", (e) => (importText = e.target.value));
  document.getElementById("importCancel").addEventListener("click", () => {
    showImportModal = false; importText = ""; importError = "";
    document.getElementById("importOverlay").remove();
  });
  document.getElementById("importConfirm").addEventListener("click", handleImportConfirm);
}

function normalizeImportedRecipe(obj) {
  if (!obj.title || !Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new Error("Needs at least a title and one step.");
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
    reattachImportModal();
    return;
  }
  try {
    const recipe = normalizeImportedRecipe(parsed);
    recipes.push(recipe);
    await persistRecipes();
    showImportModal = false;
    importText = "";
    document.getElementById("importOverlay")?.remove();
    currentView = { name: "list" };
    render();
  } catch (e) {
    importError = e.message || "Couldn't read that recipe format.";
    render();
    reattachImportModal();
  }
}

function reattachImportModal() {
  document.getElementById("importOverlay")?.remove();
  renderImportModal();
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
      <div class="settings-row">
        <span class="label">Recipes saved</span>
        <span class="value">${recipes.length}</span>
      </div>
      <div class="settings-row">
        <span class="label">Add a recipe from Claude</span>
        <button class="small-btn" id="openImportFromSettings">Import</button>
      </div>
      <div class="modal-actions" style="margin-top:20px;">
        <button class="modal-cancel" id="settingsClose">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
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
}

// ---------- Boot ----------
startFirebase();
render();
