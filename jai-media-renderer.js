const imageCache = new Map();
const videoCache = new Map();

function fitRect(sourceWidth, sourceHeight, width, height, mode = "cover") {
  const scale = mode === "contain" ? Math.min(width / sourceWidth, height / sourceHeight) : Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}
async function decodeImage(asset) {
  if (imageCache.has(asset.asset_id)) return imageCache.get(asset.asset_id);
  const promise = createImageBitmap(asset.blob);
  imageCache.set(asset.asset_id, promise);
  try { return await promise; } catch (error) { imageCache.delete(asset.asset_id); throw error; }
}
async function decodeVideo(asset) {
  if (videoCache.has(asset.asset_id)) return videoCache.get(asset.asset_id);
  const promise = new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "auto";
    const url = URL.createObjectURL(asset.blob);
    video.src = url;
    const timeout = setTimeout(() => { cleanup(); URL.revokeObjectURL(url); reject(new Error("Tiempo agotado al leer la metadata del vídeo.")); }, 10000);
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener("loadedmetadata", ready); video.removeEventListener("error", fail); };
    const ready = () => { cleanup(); resolve({ video, url, duration: video.duration, width: video.videoWidth, height: video.videoHeight }); };
    const fail = () => { cleanup(); URL.revokeObjectURL(url); reject(new Error("No se pudo decodificar el clip de vídeo.")); };
    video.addEventListener("loadedmetadata", ready, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.load();
  });
  videoCache.set(asset.asset_id, promise);
  try { return await promise; } catch (error) { videoCache.delete(asset.asset_id); throw error; }
}
export async function prepareVisualSequence(assets) {
  if (!Array.isArray(assets) || assets.length < 2) throw new Error("Una secuencia necesita al menos dos imágenes verificadas.");
  const frames = await Promise.all(assets.map(asset => decodeImage(asset)));
  return { source_type: "image_sequence", asset_ids: assets.map(asset => asset.asset_id), frames, width: frames[0].width, height: frames[0].height, sha256: assets.map(asset => asset.sha256) };
}
export async function prepareVisualAsset(asset) {
  if (!asset?.asset_id || !asset?.blob) throw new Error("El recurso no contiene archivo local.");
  if (String(asset.mime_type).startsWith("image/")) {
    const image = await decodeImage(asset);
    return { source_type: "image", asset_id: asset.asset_id, image, width: image.width, height: image.height, sha256: asset.sha256 };
  }
  if (String(asset.mime_type).startsWith("video/")) {
    const decoded = await decodeVideo(asset);
    return { source_type: "video_clip", asset_id: asset.asset_id, ...decoded, sha256: asset.sha256 };
  }
  throw new Error("MIME no admitido por el renderer.");
}
export function startPreparedVisualPlayback(prepared, progress = 0) {
  if (prepared?.source_type !== "video_clip") return false;
  const video = prepared.video;
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const targetTime = Math.max(0, Math.min(prepared.duration - 0.04, p * prepared.duration));
  video.pause();
  try { video.currentTime = targetTime; } catch { return false; }
  video.loop = true;
  video.muted = true;
  const playResult = video.play();
  if (playResult?.catch) playResult.catch(() => {});
  return true;
}
export function stopPreparedVisualPlayback(prepared) {
  if (prepared?.source_type !== "video_clip") return;
  prepared.video.pause();
}
export async function awaitPreparedVisualFrame(prepared, progress = 0, timeoutMs = 2500) {
  if (prepared?.source_type !== "video_clip") return true;
  const video = prepared.video;
  const targetTime = Math.max(0, Math.min(prepared.duration - 0.04, Math.max(0, Math.min(1, Number(progress) || 0)) * prepared.duration));
  if (Math.abs(video.currentTime - targetTime) <= 0.04 && video.readyState >= 2 && !video.seeking) return true;
  if (!video.seeking) video.currentTime = targetTime;
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return; settled = true;
      clearTimeout(timer); video.removeEventListener("seeked", onReady); video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    const onReady = () => video.readyState >= 2 && !video.seeking && finish();
    const onError = () => finish(new Error("Falló la decodificación de un fotograma del vídeo."));
    const timer = setTimeout(() => finish(new Error("Tiempo agotado esperando el fotograma del vídeo.")), timeoutMs);
    video.addEventListener("seeked", onReady);
    video.addEventListener("error", onError, { once: true });
    if (video.readyState >= 2 && !video.seeking) finish();
  });
  return video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - targetTime) <= 0.08;
}
export function drawPreparedVisualNow(ctx, width, height, prepared, progress = 0, options = {}) {
  if (!prepared) return false;
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  ctx.save();
  ctx.fillStyle = options.background || "#071326";
  ctx.fillRect(0, 0, width, height);
  if (prepared.source_type === "image" || prepared.source_type === "image_sequence") {
    const image = prepared.source_type === "image_sequence" ? prepared.frames[Math.min(prepared.frames.length - 1, Math.floor(p * prepared.frames.length))] : prepared.image;
    const rect = fitRect(image.width, image.height, width, height, options.fit || "cover");
    const zoom = 1 + p * 0.035;
    const dw = rect.width * zoom, dh = rect.height * zoom;
    ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else if (prepared.source_type === "video_clip") {
    const video = prepared.video;
    if (video.readyState < 2 || video.seeking) { ctx.restore(); return false; }
    const rect = fitRect(prepared.width, prepared.height, width, height, options.fit || "cover");
    ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}
export function clearMediaRendererCache() {
  for (const promise of videoCache.values()) promise.then(value => URL.revokeObjectURL(value.url)).catch(() => {});
  imageCache.clear(); videoCache.clear();
}
