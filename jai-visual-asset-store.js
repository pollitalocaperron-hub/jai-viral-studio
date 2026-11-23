const DB_NAME = "jai-visual-assets-v2";
const STORE = "media";
const MAX_BYTES = 24 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "asset_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function digest(buffer) {
  return crypto.subtle.digest("SHA-256", buffer).then(value =>
    [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("")
  );
}
function put(record) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(record); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("No se pudo guardar el recurso.")); };
  }));
}
export async function importOpenverseAsset(asset) {
  if (!asset || !/^https:\/\//i.test(String(asset.original_url || ""))) throw new Error("Openverse no proporcionó una URL original HTTPS.");
  const response = await fetch(asset.original_url, { mode: "cors", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("El servidor del recurso respondió HTTP " + response.status + ".");
  const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.has(mime)) throw new Error("Tipo de archivo no admitido: " + (mime || "desconocido") + ".");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error("El archivo supera el límite local de 24 MB.");
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_BYTES) throw new Error("El archivo está vacío o supera el límite local de 24 MB.");
  const bytes = await blob.arrayBuffer();
  const sha256 = await digest(bytes);
  const bitmap = await createImageBitmap(blob);
  const record = {
    asset_id: "ov-" + String(asset.id || sha256.slice(0, 20)).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    blob, mime_type: mime, width: bitmap.width, height: bitmap.height, sha256,
    title: String(asset.title || "Recurso Openverse").slice(0, 220),
    creator: String(asset.creator || "Autor no indicado").slice(0, 180),
    source_url: String(asset.source_url || "").slice(0, 1200),
    creator_url: String(asset.creator_url || "").slice(0, 1200),
    license: String(asset.license || "").slice(0, 30),
    license_version: String(asset.license_version || "").slice(0, 20),
    attribution: String(asset.attribution || "").slice(0, 500),
    imported_at: new Date().toISOString()
  };
  bitmap.close();
  return put(record);
}
export async function getStoredAsset(assetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(assetId);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function listStoredAssets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result || []); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function deleteStoredAsset(assetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(assetId);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
