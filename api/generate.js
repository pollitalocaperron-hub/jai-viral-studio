export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("[JAI][Gemini] GEMINI_API_KEY no está configurada.");
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel.", diagnosticCode: "MISSING_API_KEY" });
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

REGLAS EDITORIALES Y CIENTÍFICAS:
- No inventes cifras, estudios, citas, fuentes ni hechos. Distingue hechos conocidos de hipótesis y señala qué requiere verificación.
- Las notas del usuario son material de partida, no hechos automáticamente confirmados.
- En ciencia, explica el mecanismo con precisión y evita simplificaciones que cambien la causa física. No confundas absorción, reflexión, dispersión, refracción o emisión. Si hay varios mecanismos, indica cuál predomina y bajo qué condiciones.
- No presentes como universal una explicación que dependa de profundidad, composición, iluminación, escala u otras condiciones.
- No afirmes que verificaste fuentes externas si no se proporcionaron fuentes en las notas.
- Abre con un hook potente de 1–3 segundos que cree curiosidad concreta, pero no llames "mentira" a una explicación parcialmente cierta sin matizarla.
- REGLA OBLIGATORIA DE RETENCIÓN: el video debe volverse más interesante cada 3 segundos, desde el inicio hasta el cierre. Divide toda la duración en bloques consecutivos de máximo 3 segundos (0–3, 3–6, 6–9, etc.; el último puede ser más corto).
- En CADA bloque debe ocurrir un estímulo nuevo y perceptible que haga querer seguir viendo: una nueva imagen o composición, movimiento significativo, pregunta concreta, dato sorprendente verificado, demostración visual, cambio de escala/perspectiva, contraste o avance de la explicación. No cuenta como estímulo suficiente cambiar únicamente el color, mover una barra o repetir el mismo plano.
- Cada bloque debe aportar información o curiosidad distinta; evita repetir el mismo recurso visual o reformular la misma idea. Alterna recursos visuales y narrativos para que el ritmo no se vuelva mecánico.
- Cada 6–9 segundos introduce una revelación, contraste, mini-giro o respuesta parcial que abra una nueva pregunta. El cierre debe entregar una recompensa clara y memorable que responda la promesa inicial.
- Crea retention_map con bloques consecutivos de máximo 3 segundos, cubriendo toda la duración sin huecos ni solapamientos. Cada bloque debe incluir time, new_stimulus, narrative_advance, curiosity, visual_action y on_screen_text.
- visual_action debe describir una acción física visible y realizable (por ejemplo: la cámara atraviesa una capa, un objeto cae y rebota, una esfera se abre y revela su interior, dos elementos chocan o una comparación aparece lado a lado). No uses instrucciones abstractas como 'hacerlo interesante'.
- Cada bloque consecutivo debe cambiar al menos dos aspectos visuales: composición/encuadre, escala, perspectiva, objeto protagonista, acción, entorno o esquema de color. No repitas el mismo plano con una pequeña oscilación.
- on_screen_text debe ser una frase editorial breve de 2 a 6 palabras, comprensible para el espectador. Nunca debe contener instrucciones de producción ni resumir el objetivo técnico de la escena.
- Comprueba que el mapa cubre toda la duración y que cada bloque aporta una imagen o acción diferente y un avance narrativo real.
- Estructura: hook, promesa, contexto breve, explicación progresiva, revelación memorable y cierre.
- Evita relleno, repeticiones, clickbait engañoso y frases genéricas. Escribe narración natural en español.
- Diseña de 5 a 8 escenas maestras 2D con continuidad de estilo, pero exige que cada bloque de retención se convierta en un plano visual distinto dentro de esas escenas.
- Cada escena maestra debe incluir: time, objective, visual, animation, on_screen_text y transition. La animación debe especificar qué elemento se mueve, hacia dónde, cómo y qué revela.
- Usa composiciones editoriales completas: primer plano, plano general, corte transversal, comparación, diagrama, cambio de perspectiva y detalle. No bases el video en círculos, líneas decorativas o elementos flotando.
- No solicites actores reales, simulaciones físicas complejas, multitudes, hiperrealismo ni 3D difícil. Incluye ritmo de edición, subtítulos y diseño sonoro gratuitos.
- Ajusta el guion a la duración elegida.

Devuelve SOLAMENTE JSON válido con estas claves:
category, angle, hook, script, story, retention_map, verification, quality_check.
category: categoría breve.
angle: enfoque editorial en 2-3 frases.
hook: hook inicial.
script: guion completo con marcas [HOOK], [PROMESA], [CONTEXTO], [EXPLICACIÓN], [REVELACIÓN], [CIERRE].
story: arreglo de 5 a 8 objetos de escena; cada objeto debe tener los campos time, objective, visual, animation, on_screen_text, transition.
retention_map: arreglo cronológico de bloques de máximo 3 segundos; cada objeto debe tener time, new_stimulus, narrative_advance, curiosity, visual_action y on_screen_text (frase visible de 2 a 6 palabras).
verification: lista de afirmaciones/datos que deben verificarse y qué evidencia falta.
quality_check: lista de comprobaciones editoriales, científicas y de producción.

Tema: ${topic.trim()}
Duración objetivo: ${duration}
Plataforma: ${platform}
Notas del usuario:
${safeNotes}
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
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

    const rawBody = await response.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      console.error("[JAI][Gemini] Respuesta no JSON. HTTP", response.status, "Body:", rawBody.slice(0, 500));
      return res.status(502).json({ error: "Gemini devolvió una respuesta que no pudimos interpretar. Revisa Runtime Logs.", diagnosticCode: "NON_JSON_PROVIDER_RESPONSE", providerStatus: response.status });
    }

    if (!response.ok) {
      const providerMessage = data?.error?.message || "Sin detalle del proveedor";
      console.error("[JAI][Gemini] HTTP", response.status, "Status:", data?.error?.status || "unknown", "Message:", providerMessage.slice(0, 700));
      const status = response.status;
      const message = status === 429
        ? "Gemini alcanzó un límite de uso (429). No se realizará ningún cobro; podemos probar un proveedor alternativo."
        : status === 403
        ? "Google rechazó el acceso (403). Hay que revisar permisos o disponibilidad del nivel gratuito; no actives facturación."
        : status === 400
        ? "Gemini rechazó la solicitud (400). El registro técnico ya contiene el detalle para corregirla."
        : status === 404
        ? "El modelo o endpoint de Gemini no está disponible (404). Revisaremos el nombre del modelo."
        : status === 503
        ? "Gemini está temporalmente saturado (503). Podemos reintentar o usar un proveedor alternativo."
        : status === 504
        ? "Gemini tardó demasiado en responder (504). Reduciremos la carga o reintentaremos."
        : "Gemini respondió con un error HTTP " + status + ". Revisa Runtime Logs para conocer el detalle.";
      return res.status(status >= 400 && status < 500 ? status : 502).json({ error: message, diagnosticCode: data?.error?.status || "GEMINI_HTTP_ERROR", providerStatus: status });
    }

    const output = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!output) {
      console.error("[JAI][Gemini] Respuesta sin texto. finishReason:", data.candidates?.[0]?.finishReason || "unknown");
      return res.status(502).json({ error: "Gemini respondió sin contenido. Revisa Runtime Logs.", diagnosticCode: "EMPTY_GEMINI_RESPONSE" });
    }

    let plan;
    try {
      plan = JSON.parse(output);
    } catch (parseError) {
      console.error("[JAI][Gemini] El modelo no devolvió JSON válido:", parseError.message, "Contenido:", output.slice(0, 500));
      return res.status(502).json({ error: "Gemini generó contenido, pero el formato no fue válido. Podemos ajustar el formato automáticamente.", diagnosticCode: "INVALID_MODEL_JSON" });
    }

    console.info("[JAI][Gemini] Plan generado correctamente.");
    return res.status(200).json(plan);
  } catch (error) {
    console.error("[JAI][Gemini] Error de conexión:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo conectar con Gemini. Revisa Runtime Logs; no compartas claves ni secretos.", diagnosticCode: "GEMINI_CONNECTION_ERROR" });
  }
}
