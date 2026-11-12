export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "La transcripción sincronizada requiere GROQ_API_KEY en Vercel." });
  }

  const { audioBase64, mimeType = "audio/wav" } = req.body || {};
  if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
    return res.status(400).json({ error: "No se recibió el audio de la narración." });
  }
  const encoded = audioBase64.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, "");
  if (encoded.length > 7_000_000) {
    return res.status(413).json({ error: "El audio supera el límite seguro para transcribir. Usa una narración más corta." });
  }

  try {
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length) return res.status(400).json({ error: "El audio recibido está vacío." });
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType }), "jai-narration.wav");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "es");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
      signal: AbortSignal.timeout(55000)
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch {
      console.error("[JAI][ASR] Respuesta no JSON. HTTP", response.status, raw.slice(0, 400));
      return res.status(502).json({ error: "El servicio de transcripción devolvió una respuesta inesperada." });
    }
    if (!response.ok) {
      console.error("[JAI][ASR] HTTP", response.status, data?.error?.message || "Sin detalle");
      const message = response.status === 429
        ? "Se alcanzó el límite temporal de transcripción. Intenta más tarde."
        : response.status === 401 || response.status === 403
        ? "Groq rechazó la clave de transcripción. Revisa su configuración en Vercel."
        : "No se pudo transcribir el audio (HTTP " + response.status + ").";
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({ error: message });
    }

    const words = Array.isArray(data.words) ? data.words
      .filter(w => Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)) && String(w.word || "").trim())
      .map(w => ({ start: Number(w.start), end: Number(w.end), text: String(w.word).trim() }))
      : [];
    const segments = Array.isArray(data.segments) ? data.segments
      .filter(s => Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && String(s.text || "").trim())
      .map(s => ({ start: Number(s.start), end: Number(s.end), text: String(s.text).trim() }))
      : [];
    if (!words.length && !segments.length) {
      return res.status(422).json({ error: "La transcripción no devolvió marcas de tiempo utilizables." });
    }
    return res.status(200).json({
      text: String(data.text || ""),
      duration: Number(data.duration) || null,
      words,
      segments,
      timing: words.length ? "word" : "segment"
    });
  } catch (error) {
    console.error("[JAI][ASR] Error:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo conectar con el servicio de transcripción." });
  }
}
