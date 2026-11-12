export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "El inspector necesita GEMINI_API_KEY; no se configuró ningún proveedor adicional." });

  const images = req.body?.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > 8) {
    return res.status(400).json({ error: "Envía entre 1 y 8 fotogramas para inspección." });
  }
  const totalImageChars = images.reduce((sum, item) => sum + (typeof item?.image_base64 === "string" ? item.image_base64.length : 0), 0);
  if (totalImageChars > 3500000) return res.status(413).json({ error: "Las imágenes superan el tamaño seguro de inspección. Reduce la cantidad o resolución de fotogramas." });

  for (const [index, item] of images.entries()) {
    if (!item || typeof item.image_base64 !== "string" || item.image_base64.length > 950000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(item.image_base64)) {
      return res.status(400).json({ error: "El fotograma " + (index + 1) + " no tiene una imagen JPEG válida o supera el tamaño permitido." });
    }
  }

  const instructions = `Eres el inspector visual independiente de J.A.I. Evalúas imágenes de un vídeo educativo científico.
Compara CADA imagen con el sujeto, estado material, acción y prueba visual solicitados.
Criterios: (1) el sujeto principal es reconocible y coincide con el solicitado; (2) el estado y la acción física son visibles; (3) la imagen demuestra la idea de la escena, no solo la decora; (4) no hay objetos ajenos, composición confusa, nubes abstractas ni manchas luminosas sin forma; (5) la imagen tiene un sujeto claro y legible en encuadre vertical.
No exijas fotorealismo literal cuando la escena representa una estructura microscópica: acepta CGI científico si la estructura es reconocible y coherente. No inventes errores que no puedas observar.
Devuelve SOLO JSON con esta forma: {"results":[{"scene_index":0,"status":"pass"|"revise","score":0,"reason":"explicación breve en español","issues":["problema observable"]}]}.
Aprueba solo si la imagen comunica correctamente la escena. Si falta evidencia o el sujeto no coincide, usa revise. Un score de 80 o más no obliga a aprobar.`;

  const parts = [{ text: instructions }];
  images.forEach((item, index) => {
    parts.push({ text: "ESCENA " + index + " (" + String(item.subject || "").slice(0, 220) + "). Estado: " + String(item.state || "").slice(0, 220) + ". Acción: " + String(item.action || "").slice(0, 220) + ". Prueba visual requerida: " + String(item.proof || "").slice(0, 220) });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: item.image_base64 } });
  });

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
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
    if (!Array.isArray(parsed.results)) return res.status(502).json({ error: "El informe visual está incompleto." });
    const results = images.map((_, index) => {
      const result = parsed.results.find(item => Number(item.scene_index) === index) || {};
      const status = result.status === "pass" ? "pass" : "revise";
      return {
        scene_index: index,
        status,
        score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
        reason: String(result.reason || "No se pudo justificar la evaluación.").slice(0, 500),
        issues: Array.isArray(result.issues) ? result.issues.slice(0, 5).map(issue => String(issue).slice(0, 180)) : []
      };
    });
    return res.status(200).json({ results, model: "gemini-2.5-flash" });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[JAI][Visual QA] Error:", error?.name || "Error", error?.message || "");
    return res.status(502).json({ error: timedOut ? "El inspector visual tardó demasiado. Inténtalo de nuevo." : "No se pudo conectar con el inspector visual de Gemini." });
  }
}
