export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." });
  }

  const { topic, notes = "", duration = "45–60 segundos", platform = "Reels" } = req.body || {};
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500) {
    return res.status(400).json({ error: "Escribe un tema válido (máximo 500 caracteres)." });
  }

  const safeNotes = typeof notes === "string" ? notes.slice(0, 6000) : "";
  const prompt = `
Eres el director editorial, guionista y estratega de retención de J.A.I. Viral Studio.
Diseña un plan de producción de alta calidad para un video educativo vertical 9:16.
Objetivo: maximizar interés, comprensión, retención y potencial de compartirse sin prometer viralidad ni usar engaños.

REGLAS EDITORIALES:
- No inventes cifras, estudios, citas, fuentes ni hechos. Distingue hechos conocidos de hipótesis y señala qué requiere verificación.
- Las notas del usuario son material de partida, no hechos automáticamente confirmados.
- Abre con un hook potente de 1–3 segundos que cree curiosidad concreta.
- Estructura: hook, promesa, contexto breve, explicación progresiva, revelación/detalle memorable y cierre con pregunta o llamada a interacción natural.
- Evita relleno, repeticiones, clickbait engañoso y frases genéricas.
- Escribe narración natural en español, con ritmo y frases fáciles de decir en voz alta.
- Diseña 5 a 8 escenas visuales sencillas pero de acabado profesional. La IA debe poder crear fotogramas 2D originales y animarlos con paneos, zooms, capas, parallax suave, entradas, salidas, diagramas y transiciones.
- No solicites actores reales, simulaciones físicas complejas, multitudes, escenas hiperrealistas ni 3D difícil. Mantén continuidad de paleta, estilo y elementos.
- Cada escena debe incluir: tiempo, objetivo narrativo, descripción del fotograma, movimiento/animación, texto en pantalla y transición.
- Incluye sugerencias de ritmo de edición, subtítulos y diseño sonoro que puedan implementarse con herramientas gratuitas.
- Ajusta el guion a la duración elegida.

Devuelve SOLAMENTE JSON válido con estas claves:
category, angle, hook, script, story, verification, quality_check.
category: categoría breve.
angle: enfoque editorial en 2-3 frases.
hook: hook inicial.
script: guion completo con marcas [HOOK], [PROMESA], [CONTEXTO], [EXPLICACIÓN], [REVELACIÓN], [CIERRE].
story: storyboard detallado de 5 a 8 escenas.
verification: lista de afirmaciones/datos que deben verificarse y qué evidencia falta.
quality_check: checklist de calidad editorial, viralidad responsable y producción.

Tema: ${topic.trim()}
Duración objetivo: ${duration}
Plataforma: ${platform}
Notas del usuario:
${safeNotes}
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.75,
            maxOutputTokens: 3500
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      const status = response.status;
      const message = status === 429
        ? "Gemini alcanzó su límite gratuito temporal. Espera a que se restablezca la cuota y vuelve a intentarlo."
        : status === 403
        ? "Google no autorizó esta solicitud. Revisa que la clave pertenezca al proyecto correcto y que Gemini API esté disponible."
        : status === 400
        ? "Gemini rechazó el formato de la solicitud. Inténtalo de nuevo."
        : "Gemini no pudo completar la solicitud en este momento. Inténtalo más tarde.";
      return res.status(status >= 400 && status < 500 ? status : 502).json({ error: message });
    }

    const output = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!output) {
      return res.status(502).json({ error: "Gemini devolvió una respuesta vacía. Inténtalo otra vez." });
    }

    const plan = JSON.parse(output);
    return res.status(200).json(plan);
  } catch (error) {
    return res.status(502).json({ error: "No se pudo procesar la respuesta de Gemini. Inténtalo de nuevo." });
  }
}
