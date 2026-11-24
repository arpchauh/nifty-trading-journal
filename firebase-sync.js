import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence,
  signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const status = message => {
  if ($("cloudStatus")) $("cloudStatus").textContent = message;
  if ($("cloudHelp")) $("cloudHelp").textContent = message;
};
const configured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId);
let auth = null;
let db = null;
let user = null;
let timer = null;
let busy = false;
let pending = false;
let merging = false;
const dirtyMonths = new Set();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function monthHasEntries(month) {
  if (!month) return false;
  if ((month.days || []).some(day => day && (
    day.tradingDate || day.entry1 || day.entry2 || day.exitPrice1 || day.exitPrice2 ||
    day.result1 === "Target" || day.result1 === "SL" ||
    day.result2 === "Target" || day.result2 === "SL" || day.notes1 || day.notes2
  ))) return true;
  const settings = month.settings || {};
  return Number(settings.initialCapital) !== 10000 || Number(settings.targetCapital) !== 30000 || Number(settings.sessionCount) !== 22;
}
function monthDoc(monthKey) {
  return doc(db, "users", user.uid, "months", monthKey);
}
function setCloudButtons(signedIn) {
  if ($("cloudLogin")) $("cloudLogin").hidden = signedIn;
  if ($("cloudLogout")) {
    $("cloudLogout").hidden = !signedIn;
    $("cloudLogout").disabled = !signedIn;
  }
  if ($("cloudSyncNow")) $("cloudSyncNow").disabled = !signedIn;
}
function localSnapshot() { return clone(window.NJJournal.getData()); }

if (!configured) {
  status("Firebase configuration missing · Local journal remains available");
  if ($("cloudLogin")) $("cloudLogin").disabled = true;
  if ($("cloudSyncNow")) $("cloudSyncNow").disabled = true;
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if ($("cloudLogin")) {
    $("cloudLogin").addEventListener("click", async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        // Use popup on mobile Chrome as well as desktop.
        // This avoids the blank Firebase redirect-handler page seen on some mobile browsers.
        const result = await signInWithPopup(auth, provider);
        if (result?.user) {
          status("Google account verified · Connecting your journal…");
        }
      } catch (error) {
        console.error("Google sign-in failed", error);
        status("Google sign-in failed: " + (error.message || error.code));
      }
    });
  }
  if ($("cloudLogout")) {
    $("cloudLogout").addEventListener("click", async () => {
      try { await signOut(auth); status("Signed out · Local journal remains on this device"); }
      catch (error) { status("Sign-out failed: " + (error.message || error.code)); }
    });
  }
  if ($("cloudSyncNow")) $("cloudSyncNow").addEventListener("click", () => syncNow(true));

  // Popup sign-in is completed by onAuthStateChanged below.

  onAuthStateChanged(auth, async currentUser => {
    user = currentUser;
    setCloudButtons(Boolean(user));
    if (!user) {
      status("Not signed in · Local/offline journal active. Sign in to sync across devices.");
      return;
    }
    status("Signed in as " + (user.email || user.displayName || "Google account") + " · Preparing sync…");
    try {
      await initialMerge();
      status("Cloud connected · " + (user.email || "Google account") + " · Trade screenshots stay on this device");
      await syncNow(false);
    } catch (error) {
      console.error("Initial cloud sync failed", error);
      status("Cloud sync issue: " + (error.message || error.code) + " · Local data is safe");
    }
  });

  window.addEventListener("journal-local-save", event => {
    if (merging || !user) return;
    const key = event.detail?.month || window.NJJournal?.getData()?.activeMonth;
    if (key) dirtyMonths.add(key);
    scheduleSync();
  });
  window.addEventListener("online", scheduleSync);
}

async function readCloudMonths() {
  const snapshot = await getDocs(collection(db, "users", user.uid, "months"));
  const months = {};
  snapshot.forEach(item => {
    const value = item.data();
    if (value?.record) months[item.id] = value.record;
  });
  return months;
}

async function readLegacyCloudJournal() {
  // Compatibility with the earlier single-document prototype, if it was ever synced.
  const oldRef = doc(db, "users", user.uid, "journal", "main");
  const oldSnap = await getDoc(oldRef);
  const oldJournal = oldSnap.exists() ? oldSnap.data()?.journal : null;
  return oldJournal?.months ? oldJournal : null;
}

async function initialMerge() {
  merging = true;
  try {
    const local = localSnapshot();
    const remoteMonths = await readCloudMonths();
    const legacy = Object.keys(remoteMonths).length ? null : await readLegacyCloudJournal();
    const cloudMonths = Object.keys(remoteMonths).length ? remoteMonths : (legacy?.months || {});
    const mergedMonths = { ...cloudMonths };

    // Preserve populated records on the original device; retain every cloud-only month.
    for (const [key, localMonth] of Object.entries(local.months || {})) {
      if (!mergedMonths[key] || monthHasEntries(localMonth) || !monthHasEntries(mergedMonths[key])) {
        mergedMonths[key] = localMonth;
      }
    }

    const metaSnap = await getDoc(doc(db, "users", user.uid, "meta", "state"));
    const remoteMeta = metaSnap.exists() ? metaSnap.data() : {};
    const latestMonth = [local.latestMonth, remoteMeta.latestMonth, ...Object.keys(mergedMonths)]
      .filter(Boolean).sort().at(-1) || local.activeMonth;
    const activeMonth = mergedMonths[local.activeMonth]
      ? local.activeMonth
      : (remoteMeta.activeMonth && mergedMonths[remoteMeta.activeMonth] ? remoteMeta.activeMonth : latestMonth);

    const merged = { ...local, months: mergedMonths, activeMonth, latestMonth };
    window.NJJournal.setData(merged);
    dirtyMonths.clear();

    // First migration: write each month as its own document (small, independently mergeable records).
    for (const [key, record] of Object.entries(mergedMonths)) {
      await setDoc(monthDoc(key), { record, schemaVersion: 2, updatedAt: serverTimestamp() });
    }
    await setDoc(doc(db, "users", user.uid, "meta", "state"), {
      activeMonth, latestMonth, schemaVersion: 2, updatedAt: serverTimestamp()
    }, { merge: true });
  } finally {
    merging = false;
  }
}

function scheduleSync() {
  if (!user || !navigator.onLine) return;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(false), 1400);
}

async function syncNow(manual) {
  if (!user) {
    if (manual) status("Sign in with Google to sync · Local/offline saving is active");
    return;
  }
  if (!navigator.onLine) {
    status("Offline · Journal saved locally. It will sync when internet returns.");
    return;
  }
  if (busy) { pending = true; return; }
  busy = true;
  pending = false;
  try {
    status("Syncing monthly journal records…");
    const local = localSnapshot();
    const remoteMonths = await readCloudMonths();
    const mergedMonths = { ...remoteMonths };
    const uploadKeys = new Set();

    for (const [key, localMonth] of Object.entries(local.months || {})) {
      if (dirtyMonths.has(key) || !remoteMonths[key]) {
        mergedMonths[key] = localMonth;
        uploadKeys.add(key);
      }
    }

    // Cloud is authoritative for untouched months; apply remote-only updates locally.
    const merged = { ...local, months: mergedMonths };
    const remoteMetaSnap = await getDoc(doc(db, "users", user.uid, "meta", "state"));
    const remoteMeta = remoteMetaSnap.exists() ? remoteMetaSnap.data() : {};
    merged.latestMonth = [local.latestMonth, remoteMeta.latestMonth, ...Object.keys(mergedMonths)]
      .filter(Boolean).sort().at(-1) || local.latestMonth;
    if (!mergedMonths[merged.activeMonth]) merged.activeMonth = merged.latestMonth;

    merging = true;
    window.NJJournal.setData(merged);
    merging = false;

    for (const key of uploadKeys) {
      await setDoc(monthDoc(key), { record: mergedMonths[key], schemaVersion: 2, updatedAt: serverTimestamp() });
    }
    await setDoc(doc(db, "users", user.uid, "meta", "state"), {
      activeMonth: merged.activeMonth,
      latestMonth: merged.latestMonth,
      schemaVersion: 2,
      updatedAt: serverTimestamp()
    }, { merge: true });

    for (const key of uploadKeys) dirtyMonths.delete(key);
    status("Journal synced · " + new Date().toLocaleTimeString() + " · Screenshots remain stored locally on this device");
  } catch (error) {
    console.error("Cloud sync failed", error);
    status("Sync failed: " + (error.message || error.code) + " · Local journal and screenshots remain on this device");
  } finally {
    busy = false;
    if (pending) scheduleSync();
  }
}
