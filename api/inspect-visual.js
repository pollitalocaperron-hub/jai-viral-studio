import { applyApiCors } from "../cors.js";
import { resolveVisualStyleProfile } from "./visual-style-profiles.js";
export default async function handler(req, res) {
  if (!applyApiCors(req, res)) {
    return res.status(403).json({ error: "Origen no autorizado." });
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "El inspector necesita GEMINI_API_KEY; no se configuró ningún proveedor adicional." });

  const images = req.body?.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > 4) {
    return res.status(400).json({ error: "Envía entre 1 y 4 fotogramas para inspección." });
  }
  const styleProfile = resolveVisualStyleProfile(req.body?.style_profile_id || images[0]?.style_profile_id, req.body?.topic || "", req.body?.script || "");
  if (images.some(item => item?.style_profile_id && item.style_profile_id !== styleProfile.id)) return res.status(400).json({ error: "Todas las tomas de una auditoría deben usar el mismo perfil visual." });
  const totalImageChars = images.reduce((sum, item) => sum + (typeof item?.image_base64 === "string" ? item.image_base64.length : 0), 0);
  if (totalImageChars > 1100000) return res.status(413).json({ error: "Las imágenes superan 1.1 MB de datos codificados. Reduce la resolución o divide la auditoría en lotes." });

  for (const [index, item] of images.entries()) {
    if (!item || typeof item.image_base64 !== "string" || item.image_base64.length > 300000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(item.image_base64)) {
      return res.status(400).json({ error: "El fotograma " + (index + 1) + " no es una imagen JPEG base64 válida o supera 300 KB." });
    }
  }

  const instructions = `Eres el inspector visual independiente de J.A.I. Evalúas imágenes de un vídeo educativo de CUALQUIER dominio. El perfil audiovisual de esta producción es "${styleProfile.label}". ${styleProfile.audit}
Ignora la interfaz de reproducción de redes sociales que pueda aparecer en capturas de referencia: no evalúes ni reproduzcas barras de estado, botones de interacción, perfiles, comentarios, navegación o marcas de agua. Evalúa únicamente el contenido creativo del vídeo. Compara CADA imagen con el sujeto, estado material, acción y prueba visual solicitados. La coincidencia del tema es un requisito eliminatorio: si el tema pedido son tablas de cortar, una imagen de cohetes, maquinaria, anatomía, laboratorios o cualquier objeto no relacionado DEBE recibir status "revise", aunque sea bonita o tenga buena calidad técnica. No apruebes por estética cuando falla la identidad del sujeto.
Criterios: (1) el sujeto principal es reconocible y coincide con el solicitado; (2) el estado y la acción física son visibles; (3) la imagen demuestra la idea de la escena, no solo la decora; (4) no hay objetos ajenos, composición confusa, nubes abstractas ni manchas luminosas sin forma; (5) la imagen tiene un sujeto claro y legible en encuadre vertical; (6) conserva los rasgos observables del perfil audiovisual indicado, con sujeto legible, capas coherentes y composición vertical.
Mapas, líneas temporales, diagramas, personajes, procesos naturales y gráficos son válidos cuando estén dibujados dentro del mismo lenguaje editorial 2D. Marca revise solo si la toma contradice de forma visible el perfil seleccionado o la enseñanza. No penalices una aproximación vectorial 2.5D cuando el perfil lo permita. No inventes errores que no puedas observar.
Devuelve SOLO JSON con esta forma: {"results":[{"scene_index":0,"status":"pass"|"revise","score":0,"reason":"explicación breve en español","issues":["problema observable"]}]}.
Aprueba solo si la imagen comunica correctamente la escena. Si falta evidencia o el sujeto no coincide, usa revise. Un score de 80 o más no obliga a aprobar.`;

  const parts = [{ text: instructions }];
  images.forEach((item, index) => {
    parts.push({ text: "ESCENA " + index + " (" + String(item.subject || "").slice(0, 220) + "). Estado: " + String(item.state || "").slice(0, 220) + ". Acción: " + String(item.action || "").slice(0, 220) + ". Prueba visual requerida: " + String(item.proof || "").slice(0, 220) });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: item.image_base64 } });
  });

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1800 }
      }),
      signal: AbortSignal.timeout(35000)
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      console.error("[JAI][Visual QA] Respuesta no JSON. HTTP", response.status, raw.slice(0, 400));
      return res.status(502).json({ error: "Gemini devolvió una respuesta inesperada al inspeccionar las imágenes." });
    }
    if (!response.ok) {
      const message = data?.error?.message || "Sin detalle del proveedor";
      console.error("[JAI][Visual QA] HTTP", response.status, message.slice(0, 500));
      return res.status(response.status === 429 ? 429 : 502).json({
        error: response.status === 429 ? "Se alcanzó el límite gratuito del inspector visual. Inténtalo más tarde." : "Gemini no pudo inspeccionar los fotogramas (HTTP " + response.status + ")."
      });
    }
    const text = data?.candidates?.[0]?.content?.parts?.find(part => typeof part.text === "string")?.text || "";
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      console.error("[JAI][Visual QA] Gemini no devolvió el JSON esperado:", text.slice(0, 500));
      return res.status(502).json({ error: "El inspector no devolvió un informe estructurado válido." });
    }
    if (!Array.isArray(parsed.results) || parsed.results.length !== images.length) {
      return res.status(502).json({ error: "El inspector no devolvió exactamente un resultado por fotograma." });
    }
    const indexedResults = new Map();
    for (const item of parsed.results) {
      const sceneIndex = Number(item?.scene_index);
      if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= images.length || indexedResults.has(sceneIndex)) {
        return res.status(502).json({ error: "El inspector devolvió índices ausentes, duplicados o fuera de orden." });
      }
      indexedResults.set(sceneIndex, item);
    }
    if (indexedResults.size !== images.length) {
      return res.status(502).json({ error: "La auditoría visual dejó escenas sin evaluar." });
    }
    const results = images.map((_, index) => {
      const result = indexedResults.get(index);
      const numericScore = Number(result.score);
      const score = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : 0;
      const reason = typeof result.reason === "string" ? result.reason.trim() : "";
      const issuesValid = Array.isArray(result.issues);
      const issues = issuesValid ? result.issues.slice(0, 5).map(issue => String(issue).slice(0, 180)) : ["El inspector no devolvió una lista válida de problemas."];
      // Fallo seguro: campos ausentes o mal formados nunca se interpretan como evidencia limpia.
      const status = result.status === "pass" && score >= 80 && reason.length >= 18 && issuesValid && issues.length === 0 ? "pass" : "revise";
      return {
        scene_index: index,
        status,
        score,
        reason: (reason || "No se pudo justificar la evaluación.").slice(0, 500),
        issues
      };
    });
    return res.status(200).json({ results, model: "gemini-3.8-flash", style_profile_id: styleProfile.id, style_profile_label: styleProfile.label });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[JAI][Visual QA] Error:", error?.name || "Error", error?.message || "");
    return res.status(502).json({ error: timedOut ? "El inspector visual tardó demasiado. Inténtalo de nuevo." : "No se pudo conectar con el inspector visual de Gemini." });
  }
}
