export function parseSceneRange(value) {
  const match = String(value || "").replace(/[–—]/g, "-").match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const toSeconds = part => Number(part.split(":")[0]) * 60 + Number(part.split(":")[1]);
  const start = toSeconds(match[1]), end = toSeconds(match[2]);
  return end > start ? { start, end } : null;
}

function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validTransform(value) {
  if (!value || typeof value !== "object") return false;
  const keys = ["x", "y", "rotation", "scale", "opacity"];
  if (!keys.every(key => Number.isFinite(Number(value[key])))) return false;
  return Number(value.x) >= -300 && Number(value.x) <= 300 &&
    Number(value.y) >= -300 && Number(value.y) <= 300 &&
    Number(value.rotation) >= -360 && Number(value.rotation) <= 360 &&
    Number(value.scale) >= 0.2 && Number(value.scale) <= 3 &&
    Number(value.opacity) >= 0 && Number(value.opacity) <= 1;
}

function transformsDiffer(a, b) {
  return ["x", "y", "rotation", "scale", "opacity"].some(key => Math.abs(Number(a[key]) - Number(b[key])) > 0.001);
}


function transformsMatch(a, b) {
  return ["x", "y", "rotation", "scale", "opacity"].every(key =>
    Math.abs(Number(a[key]) - Number(b[key])) <= 0.01
  );
}

export function validateAnimationContinuity(steps) {
  const byLayer = new Map();
  for (const step of steps) {
    const list = byLayer.get(step.target_id) || [];
    list.push(step);
    byLayer.set(step.target_id, list);
  }
  for (const [layerId, list] of byLayer) {
    list.sort((a, b) => Number(a.start_progress) - Number(b.start_progress));
    for (let index = 1; index < list.length; index++) {
      const previous = list[index - 1], next = list[index];
      if (!transformsMatch(previous.to_transform, next.from_transform) ||
          previous.to_state.trim() !== next.from_state.trim()) {
        return "La capa " + layerId + " presenta un salto entre acciones: el estado final debe coincidir con el estado inicial siguiente.";
      }
    }
  }
  return null;
}

export function validateShots(shots, story) {
  if (!Array.isArray(story) || story.length < 4 || story.length > 5) {
    return "El storyboard debe contener entre 4 y 5 escenas conceptuales.";
  }
  const sceneRanges = story.map(scene => parseSceneRange(scene?.time));
  if (sceneRanges.some(range => !range)) return "El storyboard contiene un intervalo de escena inválido.";
  for (let index = 1; index < sceneRanges.length; index++) {
    if (Math.abs(sceneRanges[index].start - sceneRanges[index - 1].end) > 0.05) {
      return "Las escenas conceptuales deben formar una línea temporal continua y sin solapamientos.";
    }
  }
  if (!Array.isArray(shots) || shots.length < story.length * 2 || shots.length > 16) {
    return "El director debe entregar entre 2 y 5 tomas visuales por escena conceptual, con un máximo de 16 tomas.";
  }

  const byScene = new Map();
  const shotCounts = new Map();
  for (const [index, shot] of shots.entries()) {
    const sceneIndex = Number(shot?.scene_index);
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= story.length) {
      return "La toma " + (index + 1) + " no está vinculada a una escena válida.";
    }
    const sceneRange = sceneRanges[sceneIndex];
    const start = Number(shot.start_seconds), end = Number(shot.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
        start < sceneRange.start - 0.05 || end > sceneRange.end + 0.05) {
      return "La toma " + (index + 1) + " tiene tiempos inválidos o fuera de su escena conceptual.";
    }
    const required = ["narration_segment", "subtitle", "subject", "visual_state", "visual_action", "visual_prompt_en", "continuity_anchor"];
    for (const key of required) {
      const max = key === "visual_prompt_en" ? 1800 : 700;
      if (!clean(shot[key], max)) return "La toma " + (index + 1) + " no incluye " + key + ".";
    }
    if (clean(shot.visual_prompt_en, 1800).split(/\s+/).length < 25) {
      return "El prompt de la toma " + (index + 1) + " necesita describir un fotograma concreto con mayor precisión.";
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(clean(shot.background_color, 16))) {
      return "La toma " + (index + 1) + " necesita un color de fondo hexadecimal válido.";
    }
    if (!Array.isArray(shot.layers) || shot.layers.length < 3 || shot.layers.length > 6) {
      return "La toma " + (index + 1) + " necesita entre 3 y 6 capas vectoriales independientes.";
    }
    const layerIds = new Set();
    for (const [layerIndex, layer] of shot.layers.entries()) {
      const id = clean(layer?.id, 60), path = typeof layer?.path_d === "string" ? layer.path_d.trim() : "";
      const fill = clean(layer?.fill, 16), stroke = clean(layer?.stroke, 16);
      const strokeWidth = Number(layer?.stroke_width), pivotX = Number(layer?.pivot_x), pivotY = Number(layer?.pivot_y);
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || layerIds.has(id) ||
          !clean(layer?.description, 260) || !clean(layer?.role, 120)) {
        return "La capa " + (layerIndex + 1) + " de la toma " + (index + 1) + " tiene un identificador duplicado o datos incompletos.";
      }
      if (path.length < 10 || path.length > 1600 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\s]+$/.test(path) || !/[Zz]/.test(path)) {
        return "La capa " + id + " de la toma " + (index + 1) + " no contiene una ruta vectorial segura y cerrada.";
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(fill) && fill !== "none") return "La capa " + id + " tiene un relleno no válido.";
      if (!/^#[0-9a-fA-F]{6}$/.test(stroke) && stroke !== "none") return "La capa " + id + " tiene un contorno no válido.";
      if (!Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 24 ||
          !Number.isFinite(pivotX) || pivotX < 0 || pivotX > 720 ||
          !Number.isFinite(pivotY) || pivotY < 0 || pivotY > 1280) {
        return "La capa " + id + " tiene grosor o punto de pivote fuera del lienzo.";
      }
      layerIds.add(id);
    }
    if (!Array.isArray(shot.animation_steps) || shot.animation_steps.length < 2 || shot.animation_steps.length > 4) {
      return "La toma " + (index + 1) + " necesita entre 2 y 4 acciones de animación.";
    }
    const targetedLayers = new Set(), progressByLayer = new Map();
    let hasActualMotion = false;
    for (const [stepIndex, step] of shot.animation_steps.entries()) {
      const target = clean(step?.target_id, 60), action = clean(step?.action, 180);
      const from = Number(step?.start_progress), to = Number(step?.end_progress);
      if (!layerIds.has(target) || !action || !clean(step?.from_state, 140) || !clean(step?.to_state, 140) ||
          !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > 1 || to <= from ||
          !validTransform(step?.from_transform) || !validTransform(step?.to_transform)) {
        return "La acción " + (stepIndex + 1) + " de la toma " + (index + 1) + " no apunta a una capa válida o tiene una transformación/progresión incorrecta.";
      }
      const prior = progressByLayer.get(target) || [];
      if (prior.some(range => from < range.end - 0.001 && to > range.start + 0.001)) {
        return "Las acciones de la toma " + (index + 1) + " se solapan sobre la misma capa.";
      }
      prior.push({ start: from, end: to });
      progressByLayer.set(target, prior);
      targetedLayers.add(target);
      if (transformsDiffer(step.from_transform, step.to_transform)) hasActualMotion = true;
    }
    if (targetedLayers.size < 2) {
      return "La toma " + (index + 1) + " debe animar al menos dos capas independientes, no concentrar toda la acción en un único objeto.";
    }
    if (!hasActualMotion) {
      return "La toma " + (index + 1) + " no contiene ningún cambio real de transformación entre sus fotogramas.";
    }
    const continuityError = validateAnimationContinuity(shot.animation_steps);
    if (continuityError) return "La toma " + (index + 1) + ": " + continuityError;
    const list = byScene.get(sceneIndex) || [];
    list.push({ start, end });
    byScene.set(sceneIndex, list);
    shotCounts.set(sceneIndex, (shotCounts.get(sceneIndex) || 0) + 1);
  }

  for (let sceneIndex = 0; sceneIndex < story.length; sceneIndex++) {
    const range = sceneRanges[sceneIndex];
    const list = (byScene.get(sceneIndex) || []).sort((a, b) => a.start - b.start);
    const count = shotCounts.get(sceneIndex) || 0;
    if (count < 2 || count > 5) return "La escena conceptual " + (sceneIndex + 1) + " debe contener entre 2 y 5 tomas.";
    let cursor = range.start;
    for (const shot of list) {
      if (Math.abs(shot.start - cursor) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " tienen huecos o solapamientos.";
      cursor = shot.end;
    }
    if (Math.abs(cursor - range.end) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " no cubren toda su duración.";
  }
  return null;
}
