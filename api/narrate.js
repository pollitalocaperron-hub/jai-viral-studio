export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel.", diagnosticCode: "MISSING_API_KEY" });
  }

  const { text, voice = "Kore" } = req.body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 12000) {
    return res.status(400).json({ error: "El guion debe tener entre 1 y 12,000 caracteres." });
  }

  const allowedVoices = new Set(["Kore", "Puck", "Charon"]);
  if (!allowedVoices.has(voice)) {
    return res.status(400).json({ error: "La voz seleccionada no está disponible." });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `Lee exactamente el siguiente guion en español de México. No traduzcas, no resumas y no agregues palabras. Interprétalo como una narración documental cálida, clara y natural, con ritmo dinámico y pausas breves entre ideas. Texto:\n\n${text.trim()}`
            }]
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice }
              }
            }
          }
        })
        signal: AbortSignal.timeout(45000)
      }
    );

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch {
      console.error("[JAI][TTS] Respuesta no JSON. HTTP", response.status, raw.slice(0, 500));
      return res.status(502).json({ error: "Gemini devolvió una respuesta inesperada al generar la voz." });
    }

    if (!response.ok) {
      const providerMessage = data?.error?.message || "Sin detalle";
      console.error("[JAI][TTS] HTTP", response.status, providerMessage.slice(0, 700));
      const message = response.status === 429
        ? "Se alcanzó el límite gratuito de generación de voz. Intenta más tarde."
        : response.status === 403
        ? "Google no habilitó este modelo para la clave actual. No actives facturación; revisaremos el acceso gratuito."
        : response.status === 404
        ? "El modelo gratuito de voz no está disponible actualmente."
        : "Gemini no pudo generar la narración (HTTP " + response.status + ").";
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
        error: message,
        diagnosticCode: data?.error?.status || "GEMINI_TTS_ERROR"
      });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find(part => part.inlineData?.data);
    if (!audioPart) {
      console.error("[JAI][TTS] Gemini no devolvió audio. finishReason:", data?.candidates?.[0]?.finishReason || "unknown");
      return res.status(502).json({ error: "Gemini respondió, pero no devolvió el audio. Intenta otra vez." });
    }

    return res.status(200).json({
      audioBase64: audioPart.inlineData.data,
      mimeType: audioPart.inlineData.mimeType || "audio/L16;codec=pcm;rate=24000",
      sampleRate: 24000
    });
  } catch (error) {
    console.error("[JAI][TTS] Error de conexión:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo conectar con el servicio gratuito de voz de Gemini." });
  }
}
