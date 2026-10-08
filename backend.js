// Backend HRD Sopandi untuk Vercel: Firebase (Firestore + Authentication).
// File ini menyediakan objek yang sama dengan database versi Claude, supaya aplikasi tidak perlu diubah.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const cfg = window.FIREBASE_CONFIG || {};
const configured = cfg.apiKey && !String(cfg.apiKey).includes("ISI_");

function mapErr(e) {
  const c = e && e.code;
  if (c === "permission-denied") return { code: "invalid_argument", message: "Akun ini tidak punya izin menulis data." };
  if (c === "resource-exhausted") return { code: "quota_exceeded", message: e.message };
  if (c === "unavailable") return { code: "unavailable", message: e.message };
  return { code: c || "unavailable", message: (e && e.message) || "Gagal" };
}
const wrapDoc = (s) => ({ id: s.id, exists: s.exists(), data: () => (s.exists() ? s.data() : undefined),
  metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });

function makeDb(fs) {
  const docRef = (path) => {
    const ref = doc(fs, path);
    return {
      id: ref.id, path,
      get: () => getDoc(ref).then(wrapDoc).catch((e) => { throw mapErr(e); }),
      set: (data) => setDoc(ref, data).catch((e) => { throw mapErr(e); }),
      // merge bertingkat, sama seperti update() di versi Claude
      update: (data) => setDoc(ref, data, { merge: true }).catch((e) => { throw mapErr(e); }),
      delete: () => deleteDoc(ref).catch((e) => { throw mapErr(e); }),
      onSnapshot: (next, error) => onSnapshot(ref, (s) => next(wrapDoc(s)), (e) => error && error(mapErr(e))),
    };
  };
  const collRef = (path) => ({
    path,
    doc: (id) => docRef(path + "/" + id),
    onSnapshot: (next, error) => onSnapshot(collection(fs, path), (qs) => {
      const docs = qs.docs.map(wrapDoc);
      next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: qs.metadata });
    }, (e) => error && error(mapErr(e))),
  });
  return { doc: docRef, collection: collRef };
}

// Unduhan biasa lewat browser (di Vercel tidak ada pembatasan seperti di Claude)
const downloads = {
  save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: "saved" };
  },
};

// Impor data awal (hasil ekspor dari versi Claude) ke Firestore
async function importData(fs, json, onProgress) {
  const all = [];
  for (const col of Object.keys(json)) for (const id of Object.keys(json[col])) all.push([col, id, json[col][id]]);
  for (let i = 0; i < all.length; i += 400) {
    const b = writeBatch(fs);
    all.slice(i, i + 400).forEach(([col, id, data]) => b.set(doc(fs, col + "/" + id), data));
    await b.commit();
    onProgress && onProgress(Math.min(i + 400, all.length), all.length);
  }
  return all.length;
}

window.HRD_BACKEND = new Promise((resolve) => {
  if (!configured) { resolve({ error: "config" }); return; }
  const app = initializeApp(cfg);
  const fs = getFirestore(app);
  const auth = getAuth(app);
  const db = makeDb(fs);
  let resolved = false;
  onAuthStateChanged(auth, (user) => {
    if (user && !resolved) {
      resolved = true;
      resolve({
        db, dl: downloads, email: user.email,
        logout: () => signOut(auth).then(() => location.reload()),
        isEmpty: async () => (await getDocs(collection(fs, "employees"))).empty,
        importData: (json, cb) => importData(fs, json, cb),
      });
    } else if (!user) {
      if (resolved) { location.reload(); return; }
      window.HRD_SHOW_LOGIN({
        login: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
        reset: (email) => sendPasswordResetEmail(auth, email),
      });
    }
  });
});
