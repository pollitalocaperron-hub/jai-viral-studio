import { applyApiCors } from "../cors.js";

function parseRivaPcm(bytes) {
  let data = bytes, sampleRate = 22000, channels = 1, bitsPerSample = 16, audioFormat = 1;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length >= 44 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 12, dataOffset = -1, dataLength = 0;
    while (offset + 8 <= bytes.length) {
      const id = ascii(offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
      if (size > bytes.length - start) throw new Error("El WAV de respaldo contiene un bloque truncado.");
      if (id === "fmt " && size >= 16) {
        audioFormat = view.getUint16(start, true);
        channels = view.getUint16(start + 2, true);
        sampleRate = view.getUint32(start + 4, true);
        bitsPerSample = view.getUint16(start + 14, true);
      } else if (id === "data") { dataOffset = start; dataLength = size; break; }
      offset = start + size + (size % 2);
    }
    if (dataOffset < 0) throw new Error("El WAV de respaldo no contiene audio.");
    if (audioFormat !== 1 || bitsPerSample !== 16 || ![1, 2].includes(channels)) {
      throw new Error("El respaldo devolvió un formato PCM que J.A.I. todavía no admite.");
    }
    data = bytes.subarray(dataOffset, dataOffset + dataLength);
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new Error("Frecuencia de muestreo inválida en la voz de respaldo.");
  if (data.byteLength < 2) throw new Error("El respaldo devolvió un audio vacío.");
  if (channels === 2) {
    const samples = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const frames = Math.floor(data.byteLength / 4), mono = Buffer.alloc(frames * 2);
    for (let i = 0; i < frames; i++) mono.writeInt16LE(Math.round((samples.getInt16(i * 4, true) + samples.getInt16(i * 4 + 2, true)) / 2), i * 2);
    data = new Uint8Array(mono.buffer, mono.byteOffset, mono.byteLength);
  }
  if (data.byteLength % 2) data = data.subarray(0, data.byteLength - 1);
  return { pcm: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64"), sampleRate };
}

async function generateFreeOvhNarration(text, voice) {
  const response = await fetch("https://nvr-tts-es-es.endpoints.kepler.ai.cloud.ovh.net/api/v1/tts/text_to_audio", {
    method: "POST",
    headers: { "Accept": "application/octet-stream", "Content-Type": "application/json" },
    // Catalogued Free Spanish TTS endpoint. No token or payment-backed key is sent.
    body: JSON.stringify({
      encoding: 1, language_code: "es-ES", sample_rate_hz: 22000, text,
      voice_name: voice === "Kore" ? "Spanish-ES-Female-1" : "Spanish-ES-Male-1"
    }),
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 220);
    const error = new Error("OVHcloud Riva HTTP " + response.status + (detail ? ": " + detail : ""));
    error.status = response.status;
    throw error;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { ...parseRivaPcm(bytes), provider: "OVHcloud NVIDIA Riva (respaldo gratuito)" };
}

export default async function handler(req, res) {
  if (!applyApiCors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método no permitido." }); }
  const { text, voice = "Kore" } = req.body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 12000) return res.status(400).json({ error: "El guion debe tener entre 1 y 12,000 caracteres." });
  if (!new Set(["Kore", "Puck", "Charon"]).has(voice)) return res.status(400).json({ error: "La voz seleccionada no está disponible." });

  let geminiFailure = "";
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `Lee exactamente el siguiente guion en español de México. No traduzcas, no resumas y no agregues palabras. Interprétalo como una narración documental cálida, clara y natural, con ritmo dinámico y pausas breves entre ideas. Texto:\n\n${text.trim()}` }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
        }),
        signal: AbortSignal.timeout(28000)
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error("Gemini devolvió una respuesta no JSON (HTTP " + response.status + ")."); }
      if (!response.ok) throw new Error("Gemini HTTP " + response.status + ": " + String(data?.error?.message || "sin detalle").slice(0, 220));
      const audioPart = (data?.candidates?.[0]?.content?.parts || []).find(part => part.inlineData?.data);
      if (!audioPart) throw new Error("Gemini respondió sin audio.");
      return res.status(200).json({ audioBase64: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType || "audio/L16;codec=pcm;rate=24000", sampleRate: 24000, provider: "Gemini 2.5 Flash TTS" });
    } catch (error) {
      geminiFailure = String(error?.message || "Error de Gemini").slice(0, 300);
      console.warn("[JAI][TTS] Gemini no disponible; se activa el respaldo gratuito de OVHcloud:", geminiFailure);
    }
  } else geminiFailure = "GEMINI_API_KEY no está configurada.";

  try {
    const fallback = await generateFreeOvhNarration(text.trim(), voice);
    return res.status(200).json({ audioBase64: fallback.pcm, mimeType: "audio/L16;codec=pcm;rate=" + fallback.sampleRate, sampleRate: fallback.sampleRate, provider: fallback.provider, fallback: true });
  } catch (error) {
    const status = Number(error?.status || 0);
    console.error("[JAI][TTS] También falló el respaldo gratuito:", error?.message || "");
    if (status === 429) return res.status(429).json({ error: "Los motores gratuitos de voz alcanzaron su límite temporal. No se realizará ningún cobro; conserva tu proyecto y vuelve a intentarlo cuando se restablezca la cuota.", diagnosticCode: "FREE_TTS_QUOTA_EXHAUSTED" });
    return res.status(502).json({ error: "No se pudo generar la narración con los motores gratuitos configurados. No se activó ningún servicio de pago.", diagnosticCode: "ALL_FREE_TTS_PROVIDERS_FAILED", providerFailures: [geminiFailure, String(error?.message || "Error del respaldo").slice(0, 220)] });
  }
}
