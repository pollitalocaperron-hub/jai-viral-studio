import { applyApiCors } from "../cors.js";

export default async function handler(req, res) {
  if (!applyApiCors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método no permitido." }); }
  const { text, voice = "Kore" } = req.body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 12000) return res.status(400).json({ error: "El guion debe tener entre 1 y 12,000 caracteres." });
  if (!new Set(["Kore", "Puck", "Charon"]).has(voice)) return res.status(400).json({ error: "La voz seleccionada no está disponible." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "La narración requiere GEMINI_API_KEY. No se activará ningún proveedor alternativo.", diagnosticCode: "GEMINI_TTS_NOT_CONFIGURED" });
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
      method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Lee exactamente el siguiente guion en español de México. No traduzcas, no resumas y no agregues palabras. Interprétalo como una narración documental cálida, clara y natural, con ritmo dinámico y pausas breves entre ideas. Texto:\n\n${text.trim()}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
      }), signal: AbortSignal.timeout(28000)
    });
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { throw Object.assign(new Error("Gemini devolvió una respuesta no JSON (HTTP " + response.status + ")."), { status: response.status }); }
    if (!response.ok) throw Object.assign(new Error("Gemini HTTP " + response.status + ": " + String(data?.error?.message || "sin detalle").slice(0, 220)), { status: response.status });
    const audioPart = (data?.candidates?.[0]?.content?.parts || []).find(part => part.inlineData?.data);
    if (!audioPart || typeof audioPart.inlineData.data !== "string" || !audioPart.inlineData.data.length) throw new Error("Gemini respondió sin audio.");
    return res.status(200).json({ audioBase64: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType || "audio/L16;codec=pcm;rate=24000", sampleRate: 24000, provider: "Gemini 2.5 Flash TTS" });
  } catch (error) {
    const status = Number(error?.status || 0), message = String(error?.message || "Error de Gemini").slice(0, 300);
    console.error("[JAI][TTS] Gemini no pudo generar la narración:", message);
    if (status === 429) return res.status(429).json({ error: "La cuota disponible de Gemini TTS está temporalmente agotada. No se realizará ningún cobro ni se activará otro proveedor; conserva tu proyecto y vuelve a intentarlo cuando se renueve la cuota.", diagnosticCode: "GEMINI_TTS_QUOTA_EXHAUSTED" });
    return res.status(502).json({ error: "Gemini no pudo generar la narración. No se activó ningún proveedor alternativo.", diagnosticCode: "GEMINI_TTS_FAILED", providerFailure: message });
  }
}
