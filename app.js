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