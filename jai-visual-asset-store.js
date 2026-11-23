const DB_NAME = "jai-visual-assets-v2";
const STORE = "media";
const MAX_BYTES = 24 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm"]);

function safeRemoteMediaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return "";
    return url.toString();
  } catch { return ""; }
}
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
  const originalUrl = safeRemoteMediaUrl(asset?.original_url);
  if (!originalUrl) throw new Error("Openverse no proporcionó una URL original HTTPS pública válida.");
  const response = await fetch(originalUrl, { mode: "cors", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(12000) });
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
  if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error("La imagen supera el límite de 40 megapíxeles."); }
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

export async function importLocalMediaFile(file) {
  if (!file || !(ALLOWED.has(file.type) || ALLOWED_VIDEO.has(file.type))) throw new Error("Selecciona una imagen PNG/JPEG/WebP o un vídeo MP4/WebM.");
  if (!file.size || file.size > MAX_BYTES) throw new Error("El archivo está vacío o supera el límite local de 24 MB.");
  const bytes = await file.arrayBuffer();
  const sha256 = await digest(bytes);
  let width = 0, height = 0, duration = null;
  if (ALLOWED.has(file.type)) {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width; height = bitmap.height; bitmap.close();
    if (width * height > 40000000) throw new Error("La imagen supera el límite de 40 megapíxeles.");
  } else {
    const url = URL.createObjectURL(file);
    try {
      const metadata = await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata"; video.muted = true; video.src = url;
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        video.onerror = () => reject(new Error("No se pudo leer la metadata del vídeo."));
      });
      width = metadata.width; height = metadata.height; duration = metadata.duration;
      if (width * height > 40000000 || duration > 180) throw new Error("El vídeo supera 40 megapíxeles o 180 segundos.");
    } finally { URL.revokeObjectURL(url); }
  }
  if (!width || !height || (duration !== null && (!Number.isFinite(duration) || duration <= 0))) throw new Error("El archivo no contiene dimensiones o duración válidas.");
  const record = {
    asset_id: "local-" + sha256.slice(0, 24), blob: file.slice(0, file.size, file.type),
    mime_type: file.type, width, height, duration, sha256,
    title: String(file.name || "Archivo local").slice(0, 220), creator: "Archivo proporcionado localmente",
    source_url: "", creator_url: "", license: "user-provided", license_version: "",
    attribution: "Archivo importado por el usuario; verifica que tienes derechos de uso.",
    imported_at: new Date().toISOString()
  };
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
