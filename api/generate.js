export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Falta configurar OPENAI_API_KEY en el servidor." });
  }

  const { topic, notes = "", duration = "45–60 segundos", platform = "Reels" } = req.body || {};
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500) {
    return res.status(400).json({ error: "Escribe un tema válido (máximo 500 caracteres)." });
  }

  const safeNotes = typeof notes === "string" ? notes.slice(0, 6000) : "";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: "Eres el cerebro editorial de J.A.I. Viral Studio. Crea planes para vídeos verticales educativos, rigurosos, atractivos y visuales. No inventes cifras, estudios, citas ni fuentes. Si falta evidencia, dilo claramente y propone qué verificar. Responde SOLO con un objeto JSON válido con estas claves: category, angle, hook, script, story. category: categoría temática breve. angle: enfoque editorial en 2-3 frases. hook: apertura de máximo 2 frases, sin repetir literalmente la pregunta. script: guion completo con marcas [HOOK], [CONTEXTO], [EXPLICACIÓN], [DETALLE], [CIERRE], con narración natural y adecuada a la duración. story: storyboard de 5 escenas con tiempos aproximados, visuales 2D y texto en pantalla.",
        input: `Tema: ${topic.trim()}\nDuración: ${duration}\nPlataforma: ${platform}\nNotas del usuario (trátalas como material a verificar, no como hechos automáticamente):\n${safeNotes}`,
        text: { format: { type: "json_object" } },
        max_output_tokens: 1800
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status === 429 ? 429 : 502).json({
        error: "La IA no pudo completar la solicitud. Revisa el saldo y los límites de tu cuenta API."
      });
    }

    const output = data.output_text;
    if (!output) return res.status(502).json({ error: "La IA devolvió una respuesta vacía." });
    return res.status(200).json(JSON.parse(output));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo conectar con el servicio de IA. Inténtalo de nuevo." });
  }
}
