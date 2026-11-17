export function parseSceneRange(value) {
  const match = String(value || "").replace(/[–—]/g, "-").match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const toSeconds = part => Number(part.split(":")[0]) * 60 + Number(part.split(":")[1]);
  const parts = [match[1], match[2]].map(part => Number(part.split(":")[1]));
  if (parts.some(seconds => seconds > 59)) return null;
  const start = toSeconds(match[1]), end = toSeconds(match[2]);
  return end > start ? { start, end } : null;
}

function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateVectorPath(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 1600) return false;
  const tokenPattern = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.?\d+)/g;
  const tokens = value.match(tokenPattern) || [];
  const residue = value.replace(tokenPattern, "").replace(/[\s,]/g, "");
  if (residue || tokens[0]?.toUpperCase() !== "M" || tokens[tokens.length - 1]?.toUpperCase() !== "Z") return false;
  const commands = tokens.filter(token => /^[A-Za-z]$/.test(token));
  const numbers = tokens.filter(token => !/^[A-Za-z]$/.test(token)).map(Number);
  const drawingCommands = commands.filter(command => !/[MmZz]/.test(command));
  return commands.length >= 4 && commands.length <= 32 &&
    drawingCommands.length >= 2 && numbers.length >= 8 && numbers.length <= 120 &&
    numbers.every(number => Number.isFinite(number) && Math.abs(number) <= 2000);
}

function validTransform(value) {
  if (!value || typeof value !== "object") return false;
  const keys = ["x", "y", "rotation", "scale", "opacity"];
  if (!keys.every(key => typeof value[key] === "number" && Number.isFinite(value[key]))) return false;
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


function layerPoseAtProgress(steps, layerId, progress) {
  const list = steps.filter(step => step.target_id === layerId)
    .sort((a, b) => Number(a.start_progress) - Number(b.start_progress));
  if (!list.length) return null;
  const p = Math.max(0, Math.min(1, progress));
  let selected = list.find(step => p >= Number(step.start_progress) && p <= Number(step.end_progress));
  if (!selected) {
    const completed = list.filter(step => p > Number(step.end_progress));
    selected = p < Number(list[0].start_progress) ? list[0] : (completed[completed.length - 1] || list[0]);
  }
  if (p < Number(selected.start_progress)) return { transform: selected.from_transform, state: selected.from_state };
  if (p > Number(selected.end_progress)) return { transform: selected.to_transform, state: selected.to_state };
  const span = Math.max(0.001, Number(selected.end_progress) - Number(selected.start_progress));
  const raw = Math.max(0, Math.min(1, (p - Number(selected.start_progress)) / span));
  // Boundary checks use the exact endpoint poses, independent of easing.
  return raw >= 1
    ? { transform: selected.to_transform, state: selected.to_state }
    : { transform: selected.from_transform, state: selected.from_state };
}

function validateShotBoundaryContinuity(previousShot, nextShot, sceneIndex) {
  const previousSubject = previousShot.layers.find(layer => clean(layer.role, 120).toLowerCase() === "subject");
  const nextSubject = nextShot.layers.find(layer => clean(layer.role, 120).toLowerCase() === "subject");
  if (!previousSubject || !nextSubject) return "La escena " + (sceneIndex + 1) + " no conserva su sujeto principal al cambiar de toma.";
  const previousPose = layerPoseAtProgress(previousShot.animation_steps, previousSubject.id, 1);
  const nextPose = layerPoseAtProgress(nextShot.animation_steps, nextSubject.id, 0);
  if (!previousPose || !nextPose || !transformsMatch(previousPose.transform, nextPose.transform) ||
      clean(previousPose.state, 140).toLowerCase() !== clean(nextPose.state, 140).toLowerCase()) {
    return "La escena " + (sceneIndex + 1) + " presenta un salto de pose del sujeto entre tomas: la pose final debe coincidir con la pose inicial siguiente.";
  }
  return null;
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
  if (!Array.isArray(shots) || shots.length < story.length * 2 || shots.length > story.length * 5) {
    return "El director debe entregar entre 2 y 5 tomas visuales por escena conceptual.";
  }

  const byScene = new Map();
  const shotCounts = new Map();
  for (const [index, shot] of shots.entries()) {
    const sceneIndex = shot?.scene_index;
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= story.length) {
      return "La toma " + (index + 1) + " no está vinculada a una escena válida.";
    }
    const sceneRange = sceneRanges[sceneIndex];
    const start = shot.start_seconds, end = shot.end_seconds;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || end - start < 1 || end - start > 6 ||
        start < sceneRange.start - 0.05 || end > sceneRange.end + 0.05) {
      return "La toma " + (index + 1) + " debe durar entre 1 y 6 segundos y permanecer dentro de su escena conceptual.";
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
      const strokeWidth = layer?.stroke_width, pivotX = layer?.pivot_x, pivotY = layer?.pivot_y;
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || layerIds.has(id) ||
          !clean(layer?.description, 260) || !clean(layer?.role, 120)) {
        return "La capa " + (layerIndex + 1) + " de la toma " + (index + 1) + " tiene un identificador duplicado o datos incompletos.";
      }
      if (!validateVectorPath(path)) {
        return "La capa " + id + " de la toma " + (index + 1) + " no contiene una ruta vectorial segura y cerrada.";
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(fill) && fill !== "none") return "La capa " + id + " tiene un relleno no válido.";
      if (!/^#[0-9a-fA-F]{6}$/.test(stroke) && stroke !== "none") return "La capa " + id + " tiene un contorno no válido.";
      if (typeof strokeWidth !== "number" || !Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 24 ||
          typeof pivotX !== "number" || !Number.isFinite(pivotX) || pivotX < 0 || pivotX > 720 ||
          typeof pivotY !== "number" || !Number.isFinite(pivotY) || pivotY < 0 || pivotY > 1280) {
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
      const from = step?.start_progress, to = step?.end_progress;
      if (!layerIds.has(target) || !action || (step?.easing !== undefined && !["linear","ease-in","ease-out","ease-in-out","smoothstep"].includes(step.easing)) || !clean(step?.from_state, 140) || !clean(step?.to_state, 140) ||
          typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > 1 || to <= from ||
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
    list.push({ start, end, shot });
    byScene.set(sceneIndex, list);
    shotCounts.set(sceneIndex, (shotCounts.get(sceneIndex) || 0) + 1);
  }

  for (let sceneIndex = 0; sceneIndex < story.length; sceneIndex++) {
    const range = sceneRanges[sceneIndex];
    const list = (byScene.get(sceneIndex) || []).sort((a, b) => a.start - b.start);
    const count = shotCounts.get(sceneIndex) || 0;
    if (count < 2 || count > 5) return "La escena conceptual " + (sceneIndex + 1) + " debe contener entre 2 y 5 tomas.";
    let cursor = range.start;
    const orderedShots = list.slice().sort((a, b) => a.start - b.start);
    const normalizeIdentity = value => clean(value, 260).toLowerCase().replace(/\s+/g, " ");
    for (let shotIndex = 0; shotIndex < orderedShots.length; shotIndex++) {
      const current = orderedShots[shotIndex].shot;
      const anchor = normalizeIdentity(current.continuity_anchor);
      const subjectLayer = current.layers.find(layer => clean(layer.role, 120).toLowerCase() === "subject");
      if (!subjectLayer) return "La toma de la escena " + (sceneIndex + 1) + " no identifica una capa principal persistente (role=subject).";
      if (shotIndex > 0) {
        const previous = orderedShots[shotIndex - 1].shot;
        const previousAnchor = normalizeIdentity(previous.continuity_anchor);
        const previousSubject = previous.layers.find(layer => clean(layer.role, 120).toLowerCase() === "subject");
        if (anchor !== previousAnchor) return "La escena " + (sceneIndex + 1) + " cambia su ancla de continuidad entre tomas.";
        if (!previousSubject || clean(previousSubject.id, 60) !== clean(subjectLayer.id, 60) ||
            normalizeIdentity(previousSubject.description) !== normalizeIdentity(subjectLayer.description) ||
            clean(previousSubject.fill, 16).toLowerCase() !== clean(subjectLayer.fill, 16).toLowerCase() ||
            clean(previousSubject.stroke, 16).toLowerCase() !== clean(subjectLayer.stroke, 16).toLowerCase() ||
            Math.abs(previousSubject.pivot_x - subjectLayer.pivot_x) > 2 ||
            Math.abs(previousSubject.pivot_y - subjectLayer.pivot_y) > 2) {
          return "La escena " + (sceneIndex + 1) + " pierde la identidad, paleta o pivote del sujeto principal entre tomas.";
        }
        const boundaryError = validateShotBoundaryContinuity(previous, current, sceneIndex);
        if (boundaryError) return boundaryError;
      }
    }
    for (const shot of list) {
      if (Math.abs(shot.start - cursor) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " tienen huecos o solapamientos.";
      cursor = shot.end;
    }
    if (Math.abs(cursor - range.end) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " no cubren toda su duración.";
  }
  return null;
}
