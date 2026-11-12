export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const { topic, notes = "", duration = "45–60 segundos", platform = "Reels", learning_memory = "" } = req.body || {};
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error("[JAI] No hay claves de proveedor configuradas.");
    return res.status(500).json({ error: "Falta configurar un proveedor de IA en Vercel.", diagnosticCode: "NO_AI_PROVIDER" });
  }
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500) {
    return res.status(400).json({ error: "Escribe un tema válido (máximo 500 caracteres)." });
  }

  const safeNotes = typeof notes === "string" ? notes.slice(0, 6000) : "";
  const safeLearningMemory = typeof learning_memory === "string" ? learning_memory.slice(0, 9000) : "";
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
- BLOQUEO SEMÁNTICO ABSOLUTO: identifica primero el tema central del usuario y conserva ese mismo dominio visual en TODOS los bloques. Cada objeto, entorno, material y acción que aparezca debe pertenecer al tema o explicarse explícitamente como comparación relevante. Está PROHIBIDO insertar océanos, olas, rayos solares, vasos, gotas, partículas abstractas o cualquier recurso de otro tema si el usuario no los pidió y no son necesarios para explicar el concepto.
- La narración y el visual_action de cada bloque deben describir exactamente el mismo fenómeno. Antes de entregar el JSON, comprueba bloque por bloque: sujeto narrado = sujeto visible; acción narrada = acción representada; resultado visual = resultado explicado. Si no coinciden, reescribe el bloque.
${/maillard|carne|bistec|filete|cocina|alimento/i.test(topic) ? `- Para la reacción de Maillard, usa una progresión de cocina y química de alimentos: alimento crudo y su superficie; sartén/plancha y contacto con calor; cambio gradual de color y formación de costra; explicación molecular contextual de aminoácidos y azúcares reductores; alimento dorado terminado. No insertes mar, sol ni rayos de luz.` : ""}
- DIRECCIÓN VISUAL OBLIGATORIA PARA TODO EL VIDEO: cada fotograma debe pertenecer al mismo universo de visualización científica cinematográfica CGI 3D, con iluminación volumétrica, profundidad real, materiales detallados, fondo oscuro elegante y acentos luminosos cian/turquesa/ámbar cuando sean científicamente pertinentes. La paleta y el acabado se mantienen; el contenido, objeto protagonista, escala, perspectiva y encuadre cambian según cada bloque. No repetir la misma imagen, personaje, plano ni composición. No usar estética vintage, retro, sepia, ilustración infantil, cartoon, fotografía de archivo ni personajes humanos innecesarios.\n- En cada visual_action nombra objetos concretos y su disposición espacial. Evita conceptos visuales genéricos como "energía", "fenómeno", "partículas" o "moléculas flotando" si no especificas qué representan, cómo se relacionan y qué transformación muestran.
- Si el tema no tiene una plantilla visual especializada, diseña una escena editorial específica basada en los sustantivos y verbos del bloque; no sustituyas el tema por una animación genérica de otro dominio.
- visual_action debe describir una acción física visible y realizable (por ejemplo: la cámara atraviesa una capa, un objeto cae y rebota, una esfera se abre y revela su interior, dos elementos chocan o una comparación aparece lado a lado). No uses instrucciones abstractas como 'hacerlo interesante'.
- No encadenes más de dos bloques con el mismo objeto protagonista. Alterna plano general, demostración física, macro, comparación, vista interna, entorno y escala humana cuando el tema lo permita.
- visual_action debe describir un movimiento físico observable con inicio y resultado; evita acciones vagas como "flota", "brilla" o "se mueve" sin explicar qué cambia.
- Escribe visual_action como una instrucción de animación concreta en español, con esta estructura: "Composición: [tipo de plano]. Sujeto: [objeto/personaje]. Acción: [verbo físico y trayectoria]. Resultado: [cambio visible al terminar]".
- Usa verbos visuales literales que puedan representarse en una visualización científica cinematográfica tridimensional: entra, sale, cae, rebota, choca, se abre, se divide, atraviesa, se acerca, se aleja, gira, orbita, se desplaza, fluye, se expande, se contrae, se compara o revela. Evita metáforas que no indiquen qué debe aparecer en pantalla.
- La acción debe ser específica al tema y al bloque; no reutilices la misma acción cambiando únicamente el adjetivo. Identifica un sujeto visual claro y un resultado observable.
- Cuando una acción implique comparación, muestra dos estados simultáneos claramente rotulados. Cuando implique revelar, empieza ocultando el detalle y termina mostrándolo. Cuando implique movimiento, muestra posición inicial, desplazamiento y posición final.
- No describas solo "la cámara hace zoom": el cambio de cámara debe revelar un detalle o información nueva y estar acompañado por un elemento visual temático.
- Describe escenas físicamente plausibles y visualmente concretas para CGI científico tridimensional: objetos, materiales, estructuras internas, procesos a escala macro y micro. Evita círculos, rectángulos, flechas decorativas e infografías planas.
- Propón profundidad y variedad de encuadre: primer plano, plano medio, plano general, perspectiva lateral, corte transversal y elementos en primer término.
- No inventes acciones físicamente imposibles ni datos numéricos para hacer espectacular una escena.
- Cada bloque consecutivo debe cambiar al menos dos aspectos visuales: composición/encuadre, escala, perspectiva, objeto protagonista, acción, entorno o esquema de color. No repitas el mismo plano con una pequeña oscilación.
- on_screen_text debe ser una frase editorial breve de 2 a 6 palabras, comprensible para el espectador. Nunca debe contener instrucciones de producción ni resumir el objetivo técnico de la escena.
- Comprueba que el mapa cubre toda la duración y que cada bloque aporta una imagen o acción diferente y un avance narrativo real.
- Estructura: hook, promesa, contexto breve, explicación progresiva, revelación memorable y cierre.
- Evita relleno, repeticiones, clickbait engañoso y frases genéricas. Escribe narración natural en español.
- Diseña de 5 a 8 escenas maestras con continuidad de dirección de arte: visualización científica cinematográfica CGI 3D, materiales físicamente creíbles, profundidad, iluminación volumétrica y paleta coherente. Cada bloque de retención debe convertirse en un fotograma independiente, con encuadre y momento distintos.
- Cada escena maestra debe incluir: time, objective, visual, animation, on_screen_text y transition. La animación debe especificar qué elemento se mueve, hacia dónde, cómo y qué revela.
- Usa composiciones editoriales completas: primer plano, plano general, corte transversal, comparación, diagrama, cambio de perspectiva y detalle. No bases el video en círculos, líneas decorativas o elementos flotando sin función científica explícita.
- No solicites actores, personajes, avatares ni multitudes salvo que el tema dependa esencialmente de una persona. Prioriza objetos, sustancias, estructuras y mecanismos. La dirección de arte debe parecer un documental científico CGI cinematográfico de alta calidad, no una plantilla, caricatura ni fotografía antigua. Incluye ritmo de edición, subtítulos y diseño sonoro gratuitos.
- Ajusta el guion a la duración elegida.
- COHERENCIA TEMPORAL OBLIGATORIA: elige una duración final concreta dentro del rango solicitado y úsala idéntica en script, storyboard y retention_map. La última escena del storyboard y el último bloque de retention_map deben terminar en el mismo segundo. No entregues un storyboard de 39 segundos con un mapa de solo 30 segundos.
- retention_map debe cubrir desde 0:00 hasta el final exacto del storyboard, en bloques consecutivos de máximo 3 segundos, sin huecos ni solapamientos. Para 39 segundos, por ejemplo, debe contener 13 bloques; para 36 segundos, 12 bloques.
- Cada bloque de retención debe describir una composición y acción realmente distintas. No reutilices el mismo rayo solar, vaso, gota, ojo, columna o esquema en bloques consecutivos ni en el cierre. Si el tema requiere volver a un elemento anterior, cambia claramente la escala, perspectiva y acción, y explica qué información nueva revela.
${/oceano|mar|agua azul|color del agua/i.test(topic) ? `- PRECISIÓN SOBRE EL COLOR DEL OCÉANO: explica que el agua absorbe con mayor intensidad las longitudes de onda rojas y anaranjadas, mientras que la luz azul puede penetrar más y parte de ella se dispersa de vuelta hacia el observador. No digas que el azul se acumula por rebotar en el fondo ni que los rayos rebotan repetidamente como mecanismo general. El reflejo del cielo puede contribuir, pero no es la explicación principal del azul del agua limpia y profunda.
- En el ejemplo del océano, termina con una comparación física entre una pequeña cantidad de agua y una gran columna de agua, no con kilómetros de agua que acumulan luz azul.` : ""}

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

MEMORIA EDITORIAL ACUMULADA DE J.A.I. (solo para diversidad y mejora creativa; NO es fuente científica):
${safeLearningMemory || "Todavía no hay planes anteriores registrados."}
- Revisa esta memoria antes de diseñar el plan.
- Evita repetir literalmente temas, hooks, ángulos, revelaciones, secuencias, objetos protagonistas y composiciones visuales recientes.
- Si el tema actual coincide con uno anterior, aporta un enfoque nuevo y explica un mecanismo o perspectiva diferente; no cambies solo el título.
- Alterna estructuras narrativas, escalas, acciones y encuadres. No repitas fórmulas visuales por inercia.
- La memoria registra lo que J.A.I. produjo, no demuestra que algo funcionó ni verifica hechos. No uses sus afirmaciones como evidencia.
- Si el usuario incluye correcciones en sus notas, dales prioridad y conviértelas en reglas para este plan.
`;

  try {
    // Proveedor principal: Groq GPT-OSS 120B. Gemini queda como respaldo.
    let output = "";
    let finishReason = "unknown";
    let providerUsed = "";
    let groqFailure = "";

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [
              { role: "system", content: "Eres el motor editorial y de producción de J.A.I. Devuelve exclusivamente un objeto JSON válido, sin Markdown ni texto fuera del JSON." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.55,
            max_completion_tokens: 7000
          }),
          signal: AbortSignal.timeout(42000)
        });
        const groqBody = await groqResponse.text();
        let groqData;
        try { groqData = JSON.parse(groqBody); }
        catch { throw new Error(`Groq devolvió contenido no JSON (HTTP ${groqResponse.status}).`); }

        if (!groqResponse.ok) {
          const detail = groqData?.error?.message || "Sin detalle del proveedor";
          throw new Error(`Groq HTTP ${groqResponse.status}: ${detail.slice(0, 350)}`);
        }

        output = groqData.choices?.[0]?.message?.content?.trim() || "";
        finishReason = groqData.choices?.[0]?.finish_reason || "unknown";
        if (!output) throw new Error("Groq respondió sin contenido.");
        providerUsed = "Groq GPT-OSS 120B";
      } catch (error) {
        groqFailure = error?.message || "Fallo desconocido de Groq";
        console.warn("[JAI][Groq] Falló el proveedor principal; se intentará Gemini:", groqFailure.slice(0, 500));
      }
    } else {
      groqFailure = "GROQ_API_KEY no está configurada.";
      console.warn("[JAI][Groq] GROQ_API_KEY no está configurada; se intentará Gemini.");
    }

    // Respaldo Gemini: se usa solo si Groq no está disponible.
    if (!output) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        console.error("[JAI] No hay proveedor configurado. Groq:", groqFailure);
        return res.status(500).json({
          error: "No hay un proveedor de IA disponible. Revisa GROQ_API_KEY y GEMINI_API_KEY en Vercel.",
          diagnosticCode: "NO_AI_PROVIDER"
        });
      }

      const geminiModel = "gemini-2.5-flash";
      let geminiResponse;
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": geminiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.55,
                maxOutputTokens: 7000
              }
            }),
            signal: AbortSignal.timeout(14000)
          }
        );
      } catch (error) {
        console.error("[JAI][Gemini] Falló también el respaldo:", error?.name || "Error", error?.message || "");
        return res.status(502).json({
          error: "Groq y Gemini no pudieron completar la generación. Inténtalo de nuevo en unos momentos.",
          diagnosticCode: "ALL_AI_PROVIDERS_FAILED"
        });
      }

      const geminiBody = await geminiResponse.text();
      let geminiData;
      try { geminiData = JSON.parse(geminiBody); }
      catch {
        console.error("[JAI][Gemini] Respuesta no JSON. HTTP", geminiResponse.status, geminiBody.slice(0, 400));
        return res.status(502).json({ error: "El proveedor de respaldo devolvió una respuesta ilegible.", diagnosticCode: "GEMINI_NON_JSON_RESPONSE" });
      }

      if (!geminiResponse.ok) {
        const detail = geminiData?.error?.message || "Sin detalle";
        console.error("[JAI][Gemini] HTTP", geminiResponse.status, detail.slice(0, 500));
        return res.status(502).json({
          error: "Groq no estuvo disponible y Gemini también respondió con un error. Vuelve a intentarlo.",
          diagnosticCode: "ALL_AI_PROVIDERS_FAILED",
          providerStatus: geminiResponse.status
        });
      }

      output = geminiData.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
      finishReason = geminiData.candidates?.[0]?.finishReason || "unknown";
      if (!output) {
        console.error("[JAI][Gemini] Respuesta sin texto. finishReason:", finishReason);
        return res.status(502).json({ error: "El proveedor de respaldo respondió sin contenido.", diagnosticCode: "EMPTY_GEMINI_RESPONSE" });
      }
      providerUsed = "Gemini 2.5 Flash (respaldo)";
    }

    console.info("[JAI] Proveedor utilizado:", providerUsed);
    let plan;
    try {
      // Primero intenta la respuesta íntegra. Después tolera fences Markdown,
      // texto incidental y comas finales sin alterar el contenido editorial.
      const candidates = [output];
      const unfenced = output
        .replace(/^\uFEFF/, "")
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      if (unfenced !== output) candidates.push(unfenced);

      for (const candidate of candidates) {
        try {
          plan = JSON.parse(candidate);
          break;
        } catch {}
        const first = candidate.indexOf("{");
        if (first < 0) continue;
        let depth = 0, inString = false, escaped = false, end = -1;
        for (let i = first; i < candidate.length; i++) {
          const ch = candidate[i];
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') inString = true;
          else if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) { end = i + 1; break; }
          }
        }
        if (end > first) {
          const jsonText = candidate.slice(first, end).replace(/,\s*([}\]])/g, "$1");
          try { plan = JSON.parse(jsonText); break; } catch {}
        }
      }
      if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
        throw new Error("No se encontró un objeto JSON completo.");
      }
    } catch (parseError) {
      console.error("[JAI] No se pudo recuperar el JSON:", parseError.message, "Proveedor:", providerUsed, "finishReason:", finishReason, "Contenido:", output.slice(0, 700));
      const incomplete = finishReason === "MAX_TOKENS";
      return res.status(502).json({
        error: incomplete
          ? "El modelo cortó la respuesta por su límite de longitud. Intenta generar el plan otra vez."
          : "El modelo devolvió un formato que J.A.I. no pudo recuperar. Intenta generar el plan otra vez.",
        diagnosticCode: incomplete ? "INCOMPLETE_MODEL_JSON" : "INVALID_MODEL_JSON",
        finishReason
      });
    }

    console.info("[JAI] Plan generado correctamente con", providerUsed);
    return res.status(200).json(plan);
  } catch (error) {
    console.error("[JAI] Error de conexión:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo completar la generación. Revisa Runtime Logs; no compartas claves ni secretos.", diagnosticCode: "AI_GENERATION_ERROR" });
  }
}
