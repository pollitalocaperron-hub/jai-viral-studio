const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

export function normalizeLegacyShot(shot, index = 0) {
  if (!shot || typeof shot !== "object") throw new TypeError("La toma heredada no es un objeto.");
  const start = Number(shot.start_seconds), end = Number(shot.end_seconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error("La toma heredada tiene un intervalo temporal inválido.");
  }
  const layers = Array.isArray(shot.layers) ? shot.layers : [];
  if (layers.length < 3 || layers.some(layer => typeof layer?.path_d !== "string" || layer.path_d.length < 10)) {
    throw new Error("La toma heredada no contiene capas vectoriales completas.");
  }
  const shotId = String(shot.shot_id || "shot-" + String(index + 1).padStart(2, "0"));
  return {
    schema_version: "jai.scene.v1",
    scene_id: "scene-" + String(Number(shot.scene_index) + 1).padStart(2, "0"),
    shot_id: shotId,
    engine: "legacy-vector",
    time: { start, end, fps: 30 },
    canvas: { width: 720, height: 1280, aspect_ratio: "9:16" },
    visual: {
      source_type: "vector_scene",
      assets: [],
      vector_layers: layers,
      character_ids: [...new Set(layers.map(layer => String(layer.character_id || "")).filter(Boolean))],
      environment_id: null,
      continuity_anchor: String(shot.continuity_anchor || ""),
      camera: { movement: "static_or_layer_transform" },
      motion: Array.isArray(shot.animation_steps) ? shot.animation_steps : []
    },
    audio: {
      narration_segment: String(shot.narration_segment || ""),
      subtitle: String(shot.subtitle || ""),
      sync_events: Array.isArray(shot.narration_sync) ? shot.narration_sync : []
    },
    transition: {
      type: ["cut", "fade", "wipe", "dissolve"].includes(shot.transition) ? shot.transition : "fade",
      duration: Math.max(0, Math.min(2, Number(shot.transition_duration) || 0.3))
    },
    validation: { assets_verified: false, continuity_verified: false, render_verified: false }
  };
}

export function validateSceneContract(scene) {
  const errors = [];
  if (!scene || scene.schema_version !== "jai.scene.v1") errors.push("schema_version no compatible");
  if (!scene?.scene_id || !scene?.shot_id) errors.push("faltan identificadores de escena/toma");
  const start = Number(scene?.time?.start), end = Number(scene?.time?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) errors.push("intervalo temporal inválido");
  if (scene?.canvas?.width !== 720 || scene?.canvas?.height !== 1280 || scene?.canvas?.aspect_ratio !== "9:16") errors.push("lienzo distinto de 720x1280 9:16");
  const source = scene?.visual?.source_type;
  if (!["image", "image_sequence", "video_clip", "vector_scene"].includes(source)) errors.push("source_type no admitido");
  const assets = Array.isArray(scene?.visual?.assets) ? scene.visual.assets : [];
  if (["image", "image_sequence", "video_clip"].includes(source) && assets.length === 0) errors.push("faltan recursos visuales");
  for (const asset of assets) {
    if (!asset?.asset_id || !asset?.uri || !Number.isInteger(asset.width) || asset.width < 1 ||
        !Number.isInteger(asset.height) || asset.height < 1 || !SHA256.test(String(asset.sha256 || ""))) {
      errors.push("recurso sin URI, dimensiones o SHA-256 verificables");
      break;
    }
    if (source === "video_clip" && (!VIDEO_TYPES.has(asset.mime_type) || !(Number(asset.duration) > 0))) {
      errors.push("clip de vídeo sin MIME o duración válida");
      break;
    }
    if (source !== "video_clip" && !IMAGE_TYPES.has(asset.mime_type)) {
      errors.push("recurso de imagen con MIME no admitido");
      break;
    }
  }
  if (!scene?.visual?.continuity_anchor) errors.push("falta ancla de continuidad");
  if (!Array.isArray(scene?.visual?.motion)) errors.push("motion debe ser una lista");
  if (!Array.isArray(scene?.audio?.sync_events)) errors.push("faltan eventos de sincronía");
  return { valid: errors.length === 0, errors };
}

export function getSceneReadiness(scene) {
  const result = validateSceneContract(scene);
  if (!result.valid) return { status: "invalid", cinematic_ready: false, errors: result.errors };
  const source = scene.visual.source_type;
  if (source === "vector_scene") {
    return { status: "vector_preview_only", cinematic_ready: false, errors: ["Una escena vectorial no equivale a metraje o imagen cinematográfica generada."] };
  }
  const assetsVerified = scene.validation?.assets_verified === true;
  const continuityVerified = scene.validation?.continuity_verified === true;
  const renderVerified = scene.validation?.render_verified === true;
  const ready = assetsVerified && continuityVerified && renderVerified;
  return { status: ready ? "cinematic_ready" : "awaiting_visual_qc", cinematic_ready: ready, errors: ready ? [] : ["Falta verificar recursos, continuidad y render."] };
}
