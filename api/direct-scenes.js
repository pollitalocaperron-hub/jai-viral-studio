import { applyApiCors } from "../cors.js";
import { resolveVisualStyleProfile } from "./visual-style-profiles.js";

function parseRange(value) {
  const match = String(value || "").replace(/[–—]/g, "-").match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const seconds = value => Number(value.split(":")[0]) * 60 + Number(value.split(":")[1]);
  const start = seconds(match[1]), end = seconds(match[2]);
  return end > start ? { start, end } : null;
}
function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validateShots(shots, story) {
  if (!Array.isArray(shots) || shots.length < story.length * 2 || shots.length > story.length * 5) {
    return "El director debe entregar entre 2 y 5 tomas visuales por cada escena conceptual.";
  }
  const byScene = new Map();
  for (const [index, shot] of shots.entries()) {
    const sceneIndex = Number(shot?.scene_index);
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= story.length) return "La toma " + (index + 1) + " no está vinculada a una escena válida.";
    const sceneRange = parseRange(story[sceneIndex]?.time);
    const start = Number(shot.start_seconds), end = Number(shot.end_seconds);
    if (!sceneRange || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < sceneRange.start || end > sceneRange.end) {
      return "La toma " + (index + 1) + " tiene tiempos inválidos o fuera de su escena conceptual.";
    }
    const required = ["narration_segment", "subtitle", "subject", "visual_state", "visual_action", "visual_prompt_en", "continuity_anchor"];
    for (const key of required) if (!clean(shot[key], key === "visual_prompt_en" ? 1800 : 700)) return "La toma " + (index + 1) + " no incluye " + key + ".";
    if (clean(shot.visual_prompt_en, 1800).split(/\s+/).length < 25) return "El prompt de la toma " + (index + 1) + " necesita describir un fotograma concreto con mayor precisión.";
    if (!/^#[0-9a-fA-F]{6}$/.test(clean(shot.background_color, 16))) return "La toma " + (index + 1) + " necesita un color de fondo hexadecimal válido.";
    if (!Array.isArray(shot.layers) || shot.layers.length < 3 || shot.layers.length > 6) return "La toma " + (index + 1) + " necesita entre 3 y 6 capas vectoriales independientes.";
    const layerIds = new Set();
    for (const [layerIndex, layer] of shot.layers.entries()) {
      const id = clean(layer?.id, 60), path = typeof layer?.path_d === "string" ? layer.path_d.trim() : "";
      const fill = clean(layer?.fill, 16), stroke = clean(layer?.stroke, 16);
      const strokeWidth = Number(layer?.stroke_width), pivotX = Number(layer?.pivot_x), pivotY = Number(layer?.pivot_y);
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || layerIds.has(id) || !clean(layer?.description, 260) || !clean(layer?.role, 120)) {
        return "La capa " + (layerIndex + 1) + " de la toma " + (index + 1) + " tiene un identificador duplicado o datos incompletos.";
      }
      if (path.length < 10 || path.length > 1600 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\s]+$/.test(path) || !/[Zz]/.test(path)) return "La capa " + id + " de la toma " + (index + 1) + " no contiene una ruta vectorial segura y cerrada.";
      if (!/^#[0-9a-fA-F]{6}$/.test(fill) && fill !== "none") return "La capa " + id + " tiene un relleno no válido.";
      if (!/^#[0-9a-fA-F]{6}$/.test(stroke) && stroke !== "none") return "La capa " + id + " tiene un contorno no válido.";
      if (!Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 24 || !Number.isFinite(pivotX) || pivotX < 0 || pivotX > 720 || !Number.isFinite(pivotY) || pivotY < 0 || pivotY > 1280) return "La capa " + id + " tiene grosor o punto de pivote fuera del lienzo.";
      layerIds.add(id);
    }
    if (!Array.isArray(shot.animation_steps) || shot.animation_steps.length < 2 || shot.animation_steps.length > 4) return "La toma " + (index + 1) + " necesita entre 2 y 4 acciones de animación.";
    const validTransform = value => value && ["x", "y", "rotation", "scale", "opacity"].every(key => Number.isFinite(Number(value[key]))) &&
      Number(value.x) >= -300 && Number(value.x) <= 300 && Number(value.y) >= -300 && Number(value.y) <= 300 &&
      Number(value.rotation) >= -360 && Number(value.rotation) <= 360 && Number(value.scale) >= 0.2 && Number(value.scale) <= 3 &&
      Number(value.opacity) >= 0 && Number(value.opacity) <= 1;
    for (const [stepIndex, step] of shot.animation_steps.entries()) {
      const target = clean(step?.target_id, 60), action = clean(step?.action, 180);
      const from = Number(step?.start_progress), to = Number(step?.end_progress);
      if (!layerIds.has(target) || !action || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > 1 || to <= from ||
          !validTransform(step?.from_transform) || !validTransform(step?.to_transform)) {
        return "La acción " + (stepIndex + 1) + " de la toma " + (index + 1) + " no apunta a una capa válida o tiene una transformación/progresión incorrecta.";
      }
    }
    const list = byScene.get(sceneIndex) || [];
    list.push({ start, end }); byScene.set(sceneIndex, list);
  }
  for (let sceneIndex = 0; sceneIndex < story.length; sceneIndex++) {
    const range = parseRange(story[sceneIndex]?.time), list = (byScene.get(sceneIndex) || []).sort((a, b) => a.start - b.start);
    if (!range || list.length < 2 || list.length > 5) return "La escena conceptual " + (sceneIndex + 1) + " debe tener entre 2 y 5 tomas.";
    let cursor = range.start;
    for (const shot of list) {
      if (Math.abs(shot.start - cursor) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " tienen huecos o solapamientos.";
      cursor = shot.end;
    }
    if (Math.abs(cursor - range.end) > 0.05) return "Las tomas de la escena " + (sceneIndex + 1) + " no cubren toda su duración.";
  }
  return null;
}

export default async function handler(req, res) {
  if (!applyApiCors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método no permitido." }); }
  const { topic, script, story, retention_map = [], style_profile_id = "" } = req.body || {};
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500 || typeof script !== "string" || !script.trim() || script.length > 8000) {
    return res.status(400).json({ error: "Se requiere un tema y una narración válidos." });
  }
  if (!Array.isArray(story) || story.length < 4 || story.length > 5 || story.some(scene => !parseRange(scene?.time))) {
    return res.status(400).json({ error: "Se requiere un storyboard válido de 4 o 5 escenas conceptuales." });
  }
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return res.status(503).json({ error: "No hay un proveedor editorial configurado." });

  const styleProfile = resolveVisualStyleProfile(style_profile_id, topic, script);

  const prompt = [
    "Eres el DIRECTOR DE ESCENAS Y SUPERVISOR DE ANIMACIÓN de J.A.I. Convierte el storyboard conceptual en un plan de tomas ejecutable. Devuelve SOLO JSON válido con la propiedad shots.",
    "No generes una imagen final ni describas movimientos de cámara como sustituto de acciones. Cada toma debe mostrar un nuevo estado o acción didáctica.",
    "Divide cada una de las 4 o 5 escenas conceptuales en 2 a 5 tomas, según la complejidad real. El total permitido es de 8 a 25 tomas (máximo 5 por escena). No uses una cantidad fija por vídeo.",
    "Las tomas de cada escena deben cubrir exactamente su intervalo, en orden, sin huecos ni solapamientos. Usa start_seconds y end_seconds numéricos absolutos dentro del vídeo.",
    "Cada toma debe incluir: scene_index (índice base cero), start_seconds, end_seconds, narration_segment (fragmento literal de la narración), subtitle, subject, visual_state, visual_action, visual_prompt_en, continuity_anchor, background_color (#RRGGBB), layers (3–6 objetos independientes con id, description, role, path_d, fill, stroke, stroke_width, pivot_x, pivot_y) y animation_steps (2–4 acciones con target_id, action, from_state, to_state, start_progress, end_progress, from_transform y to_transform).",
    "Los elementos deben ser concretos y separables: no uses 'todo el motor' como una sola capa si necesitas mover pistón, válvula y bujía independientemente. Mantén la misma identidad, geometría, paleta y orientación de objetos repetidos entre tomas.",
    "La ilustración vectorial es la escena de producción: cada objeto debe tener su propio path_d independiente, no agrupes objetos móviles en una sola ruta. Usa coordenadas de un lienzo vertical 720x1280; path_d debe contener SOLO comandos de ruta SVG (M,L,H,V,C,S,Q,T,A,Z) y números, nunca etiquetas XML/SVG ni texto. Ordena las capas de atrás hacia delante. Cada forma debe ser una silueta cerrada y reconocible, con relleno y contorno.",
    "Cada animation_step debe incluir from_transform y to_transform con x, y (desplazamiento en píxeles), rotation (grados), scale (multiplicador) y opacity (0–1). Anima el objeto real descrito por target_id; usa movimientos pequeños y físicamente correctos, no movimiento de cámara ni partículas decorativas. Las capas que no se mueven usan la misma transformación inicial y final.",
    "PERFIL AUDIOVISUAL DE REFERENCIA: " + styleProfile.label + ". " + styleProfile.prompt + " Paleta: " + styleProfile.palette + " Gramática de movimiento y montaje: " + styleProfile.motion,
    "No reproduzcas la interfaz de Instagram/TikTok que aparece alrededor de los clips de referencia: barras de estado, botones de me gusta, comentarios, perfiles, navegación ni marcas de agua. Son elementos de captura, no parte del diseño del vídeo.",
    "No pongas texto dentro de las imágenes. Los subtítulos y etiquetas se añadirán en edición.",
    "Storyboard: " + JSON.stringify(story),
    "Narración: " + script,
    "Mapa de ritmo: " + JSON.stringify(retention_map).slice(0, 10000),
    "Tema: " + topic.trim()
  ].join("\n\n");

  let output = "", provider = "", groqFailure = null, geminiFailure = null;
  // Cascada de proveedores: si Groq agota su cuota gratuita o no responde,
  // se intenta Gemini. No se habilitan planes, compras ni proveedores de pago.
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "system", content: "Devuelve exclusivamente JSON válido." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.35, max_completion_tokens: 7000 }),
        signal: AbortSignal.timeout(18000)
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error("Groq devolvió una respuesta ilegible (HTTP " + response.status + ")."); }
      if (!response.ok) {
        const error = new Error(data?.error?.message || "Groq HTTP " + response.status);
        error.status = response.status;
        throw error;
      }
      output = data.choices?.[0]?.message?.content || "";
      if (!output) throw new Error("Groq respondió sin contenido.");
      provider = "Groq GPT-OSS 120B";
    } catch (error) {
      groqFailure = { status: Number(error?.status || 0), message: String(error?.message || "Error de Groq").slice(0, 260) };
      console.warn("[JAI][Scene Director] Groq no disponible; se activa el respaldo gratuito configurado:", groqFailure.message);
    }
  }
  if (!output && process.env.GEMINI_API_KEY) {
    try {
      const requestGemini = () => fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.35, maxOutputTokens: 7000 } }),
        signal: AbortSignal.timeout(18000)
      });
      let response = await requestGemini();
      // Un 503 suele ser saturación temporal; se permite un único reintento.
      if (response.status === 503) {
        await new Promise(resolve => setTimeout(resolve, 900));
        response = await requestGemini();
      }
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error("Gemini devolvió una respuesta ilegible (HTTP " + response.status + ")."); }
      if (!response.ok) {
        const error = new Error(data?.error?.message || "Gemini HTTP " + response.status);
        error.status = response.status;
        throw error;
      }
      output = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
      if (!output) throw new Error("Gemini respondió sin contenido.");
      provider = "Gemini 3.8 Flash";
    } catch (error) {
      geminiFailure = { status: Number(error?.status || 0), message: String(error?.message || "Error de Gemini").slice(0, 260) };
      console.error("[JAI][Scene Director] El respaldo gratuito tampoco está disponible:", geminiFailure.message);
    }
  }
  if (!output) {
    const quotaLimited = [groqFailure, geminiFailure].some(item => item?.status === 429);
    return res.status(quotaLimited ? 429 : 502).json({
      error: quotaLimited
        ? "Se agotó temporalmente la cuota gratuita de los motores editoriales disponibles. No se realizará ningún cobro; conserva tu proyecto y vuelve a intentarlo cuando se renueven las cuotas."
        : "Los motores editoriales gratuitos configurados no pudieron completar el plan. No se activó ningún servicio de pago.",
      diagnosticCode: quotaLimited ? "FREE_QUOTA_EXHAUSTED" : "SCENE_DIRECTOR_FAILED",
      providerFailures: [groqFailure, geminiFailure].filter(Boolean)
    });
  }
  const parseDirectorOutput = value => {
    try { return JSON.parse(String(value || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()); }
    catch { return null; }
  };
  let parsed = parseDirectorOutput(output), validationError = parsed ? validateShots(parsed?.shots, story) : "El director no devolvió JSON válido.";
  if ((!parsed || validationError) && provider.startsWith("Groq") && process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: 7000 } }),
        signal: AbortSignal.timeout(18000)
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error("Gemini devolvió una respuesta no JSON (HTTP " + response.status + ")."); }
      if (!response.ok) {
        const error = new Error(data?.error?.message || "Gemini HTTP " + response.status);
        error.status = response.status;
        throw error;
      }
      output = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
      parsed = parseDirectorOutput(output);
      validationError = parsed ? validateShots(parsed?.shots, story) : "Gemini no devolvió JSON válido.";
      provider = "Gemini 3.8 Flash (respaldo por validación)";
    } catch (error) {
      const fallbackStatus = Number(error?.status || 0);
      const fallbackMessage = String(error?.message || "Error del respaldo Gemini").slice(0, 240);
      console.warn("[JAI][Scene Director] Groq produjo un plan inválido y Gemini no pudo repararlo:", fallbackMessage);
      if (fallbackStatus === 429) {
        return res.status(429).json({
          error: "El plan de Groq necesitaba reparación y el motor gratuito Gemini alcanzó su cuota temporal. No se realizará ningún cobro; conserva tu proyecto y vuelve a intentarlo cuando se renueve la cuota.",
          diagnosticCode: "FREE_QUOTA_EXHAUSTED",
          providerFailures: [groqFailure, { status: fallbackStatus, message: fallbackMessage }].filter(Boolean)
        });
      }
      return res.status(502).json({
        error: "El plan vectorial no superó la validación: " + validationError + ". El respaldo gratuito no pudo repararlo; no se exportará una animación incompleta.",
        diagnosticCode: "SCENE_DIRECTOR_FALLBACK_FAILED",
        providerFailures: [groqFailure, { status: fallbackStatus, message: fallbackMessage }].filter(Boolean)
      });
    }
  }
  if (!parsed) return res.status(502).json({ error: "El director de escenas no devolvió JSON válido.", diagnosticCode: "SCENE_DIRECTOR_INVALID_JSON" });
  const shots = parsed?.shots;
  if (validationError) return res.status(502).json({ error: validationError, diagnosticCode: "SCENE_DIRECTOR_INVALID_SHOTS" });
  const normalized = shots.map((shot, index) => ({
    ...shot, shot_id: "shot-" + String(index + 1).padStart(2, "0"), style_profile_id: styleProfile.id,
    scene_index: Number(shot.scene_index), start_seconds: Number(shot.start_seconds), end_seconds: Number(shot.end_seconds),
    background_color: clean(shot.background_color, 16),
    layers: shot.layers.map((layer, layerIndex) => ({
      id: clean(layer?.id, 60) || "layer-" + (layerIndex + 1), description: clean(layer?.description, 260), role: clean(layer?.role, 120),
      path_d: layer.path_d.trim(), fill: clean(layer.fill, 16), stroke: clean(layer.stroke, 16), stroke_width: Number(layer.stroke_width),
      pivot_x: Number(layer.pivot_x), pivot_y: Number(layer.pivot_y)
    })),
    animation_steps: shot.animation_steps.map(step => ({
      target_id: clean(step?.target_id, 60), action: clean(step?.action, 180), from_state: clean(step?.from_state, 140), to_state: clean(step?.to_state, 140),
      start_progress: Number(step.start_progress), end_progress: Number(step.end_progress),
      from_transform: Object.fromEntries(["x", "y", "rotation", "scale", "opacity"].map(key => [key, Number(step.from_transform[key])])),
      to_transform: Object.fromEntries(["x", "y", "rotation", "scale", "opacity"].map(key => [key, Number(step.to_transform[key])]))
    }))
  }));
  return res.status(200).json({ shots: normalized, shot_count: normalized.length, conceptual_scene_count: story.length, provider, style_profile_id: styleProfile.id, style_profile_label: styleProfile.label, animation_plan_validated: true, animation_ready: true });
}
