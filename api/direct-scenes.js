import { applyApiCors } from "../cors.js";

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
  if (!Array.isArray(shots) || shots.length < story.length * 2 || shots.length > 24) {
    return "El director debe entregar entre 2 y 5 tomas visuales por escena conceptual, con un máximo de 24 tomas.";
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
    if (!Array.isArray(shot.layers) || shot.layers.length < 2 || shot.layers.length > 10) return "La toma " + (index + 1) + " necesita entre 2 y 10 elementos visuales identificables.";
    if (!Array.isArray(shot.animation_steps) || shot.animation_steps.length < 2 || shot.animation_steps.length > 6) return "La toma " + (index + 1) + " necesita entre 2 y 6 acciones de animación.";
    const list = byScene.get(sceneIndex) || [];
    list.push({ start, end }); byScene.set(sceneIndex, list);
  }
  for (let sceneIndex = 0; sceneIndex < story.length; sceneIndex++) {
    const range = parseRange(story[sceneIndex]?.time), list = (byScene.get(sceneIndex) || []).sort((a, b) => a.start - b.start);
    if (!range || list.length < 2) return "La escena conceptual " + (sceneIndex + 1) + " no tiene suficientes tomas.";
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
  const { topic, script, story, retention_map = [] } = req.body || {};
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500 || typeof script !== "string" || !script.trim() || script.length > 8000) {
    return res.status(400).json({ error: "Se requiere un tema y una narración válidos." });
  }
  if (!Array.isArray(story) || story.length < 4 || story.length > 5 || story.some(scene => !parseRange(scene?.time))) {
    return res.status(400).json({ error: "Se requiere un storyboard válido de 4 o 5 escenas conceptuales." });
  }
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return res.status(503).json({ error: "No hay un proveedor editorial configurado." });

  const prompt = [
    "Eres el DIRECTOR DE ESCENAS Y SUPERVISOR DE ANIMACIÓN de J.A.I. Convierte el storyboard conceptual en un plan de tomas ejecutable. Devuelve SOLO JSON válido con la propiedad shots.",
    "No generes una imagen final ni describas movimientos de cámara como sustituto de acciones. Cada toma debe mostrar un nuevo estado o acción didáctica.",
    "Divide cada escena conceptual en 2 a 5 tomas, según la complejidad real. El total debe ser 8 a 24. No uses una cantidad fija por vídeo.",
    "Las tomas de cada escena deben cubrir exactamente su intervalo, en orden, sin huecos ni solapamientos. Usa start_seconds y end_seconds numéricos absolutos dentro del vídeo.",
    "Cada toma debe incluir: scene_index (índice base cero), start_seconds, end_seconds, narration_segment (fragmento literal de la narración que se escucha ahí), subtitle (frase breve), subject, visual_state, visual_action, visual_prompt_en (25–100 palabras, imagen vertical 9:16 para la toma concreta, estilo de ilustración educativa 2D editorial coherente), continuity_anchor, layers (2–10 objetos con id, description, role), animation_steps (2–6 pasos con target_id, action, from_state, to_state, start_progress y end_progress entre 0 y 1).",
    "Los elementos deben ser concretos y separables: no uses 'todo el motor' como una sola capa si necesitas mover pistón, válvula y bujía independientemente. Mantén la misma identidad, geometría, paleta y orientación de objetos repetidos entre tomas.",
    "La imagen generada es un fotograma maestro de referencia; el plan de capas y animación se entregará a un motor posterior que segmentará o reconstruirá los elementos y ejecutará acciones. Nunca afirmes que una imagen plana ya contiene capas editables.",
    "Usa el estilo de producción fijo de J.A.I.: ilustración educativa 2D limpia, formas reconocibles, paleta limitada coherente, contornos y jerarquía visual claros, composición vertical, movimiento motivado por la explicación. Adapta los objetos al tema; no reutilices objetos ni plantillas ajenas.",
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
  let parsed;
  try { parsed = JSON.parse(output.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()); }
  catch { return res.status(502).json({ error: "El director de escenas no devolvió JSON válido.", diagnosticCode: "SCENE_DIRECTOR_INVALID_JSON" }); }
  const shots = parsed?.shots;
  const validationError = validateShots(shots, story);
  if (validationError) return res.status(502).json({ error: validationError, diagnosticCode: "SCENE_DIRECTOR_INVALID_SHOTS" });
  const normalized = shots.map((shot, index) => ({
    ...shot, shot_id: "shot-" + String(index + 1).padStart(2, "0"),
    scene_index: Number(shot.scene_index), start_seconds: Number(shot.start_seconds), end_seconds: Number(shot.end_seconds),
    layers: shot.layers.map((layer, layerIndex) => ({ id: clean(layer?.id, 60) || "layer-" + (layerIndex + 1), description: clean(layer?.description, 260), role: clean(layer?.role, 120) })),
    animation_steps: shot.animation_steps.map(step => ({ target_id: clean(step?.target_id, 60), action: clean(step?.action, 180), from_state: clean(step?.from_state, 140), to_state: clean(step?.to_state, 140), start_progress: Math.max(0, Math.min(1, Number(step?.start_progress) || 0)), end_progress: Math.max(0, Math.min(1, Number(step?.end_progress) || 1)) }))
  }));
  return res.status(200).json({ shots: normalized, shot_count: normalized.length, conceptual_scene_count: story.length, provider, animation_ready: true });
}
