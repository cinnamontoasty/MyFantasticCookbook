# My Cookbook — Setup Guide

A personal recipe app with step-by-step cooking mode, timers, and servings
scaling. Recipes sync through Firebase so they survive a cleared browser
and follow you across devices.

This is a one-time setup. After today you'll never need to touch GitHub
or Firebase again to add a recipe — that part happens inside the app.

---

## Part 1 — Create your Firebase project (~10 min)

1. Go to **console.firebase.google.com** and click **Add project**.
2. Name it anything (e.g. `my-cookbook`). Decline Google Analytics if asked
   (not needed). Click **Create project**.
3. In the left sidebar: **Build → Firestore Database → Create database**.
   - Choose any region close to you.
   - Select **Start in production mode**, then **Create**.
4. Still in Firestore, click the **Rules** tab. Delete everything there and
   paste in the contents of `firestore.rules.txt` (included in this folder).
   Click **Publish**.
5. In the left sidebar: **Build → Authentication → Get started**.
   Click the **Sign-in method** tab, click **Anonymous**, toggle it **Enable**,
   click **Save**.
   *(This lets the app quietly identify "you" without a login screen —
   you'll never see or type a password.)*
6. Click the gear icon next to **Project Overview** → **Project settings**.
   Scroll down to **Your apps** → click the **`</>`** (web) icon.
   Give it any nickname → **Register app**. Skip the "Firebase Hosting" checkbox.
7. Firebase will show you a code block that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "my-cookbook-xxxx.firebaseapp.com",
     projectId: "my-cookbook-xxxx",
     storageBucket: "my-cookbook-xxxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Copy those six values into `firebase-config.js` in this folder, replacing
   each `REPLACE_ME`.

---

## Part 2 — Push to GitHub (~5 min)

1. Go to **github.com** → **New repository**. Name it e.g. `my-cookbook`.
   Keep it **Public** (required for free GitHub Pages) — this is fine,
   since your actual recipe data lives in Firebase, not in this code, and
   the Firestore rules mean only you can read or write it.
2. On your computer, in this folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial cookbook app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/my-cookbook.git
   git push -u origin main
   ```
3. On GitHub, go to your repo's **Settings → Pages**.
   Under **Source**, choose **Deploy from a branch**, branch `main`,
   folder `/ (root)`. Click **Save**.
4. Wait about a minute, then refresh that page — it'll show your live URL,
   something like `https://YOUR-USERNAME.github.io/my-cookbook/`.

---

## Part 3 — Add to your Home Screen (~1 min)

1. Open the GitHub Pages URL from step 4 above in your phone's browser
   (Safari on iPhone, Chrome on Android).
2. Tap the share/menu icon → **Add to Home Screen**.
3. You now have a Cookbook icon that opens straight into the app, synced
   through Firebase.

---

## Adding new recipes later

Just ask Claude for a recipe as normal, then add:

> "Give me that as JSON for my cookbook app"

Claude will give you a JSON block. In the app, tap the **⚙** icon on the
main screen → **Import** → paste the JSON → **Add Recipe**. Done — no
GitHub or code editing required for this part, ever.

---

## Files in this folder

| File | What it's for |
|---|---|
| `index.html` | The app's page shell |
| `style.css` | All visual styling |
| `app.js` | App logic, Firestore sync, cooking mode |
| `firebase-config.js` | **You edit this once** with your project's keys |
| `firestore.rules.txt` | Paste into Firebase Console → Firestore → Rules |
| `starter-recipes.js` | The 3 recipes that load on first run only |
| `manifest.json` / `icon.png` | Makes "Add to Home Screen" behave like a real app |

## Troubleshooting

- **Settings shows "Setup needed"**: `firebase-config.js` still has
  `REPLACE_ME` placeholders, or a value was copied wrong. Recipes still
  save locally to that device in the meantime.
- **Recipes don't show up on a second device**: make sure you opened the
  *same* GitHub Pages URL there, and that `firebase-config.js` was pushed
  to GitHub with your real keys (not the placeholder version).
