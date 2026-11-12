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
  // Investigación académica abierta mediante OpenAlex; no requiere clave ni tarjeta.
  async function fetchResearchSources(query) {
    try {
      const url = "https://api.openalex.org/works?search=" + encodeURIComponent(query) + "&filter=type:article,from_publication_date:2000-01-01&sort=relevance_score:desc&per-page=6&select=id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count";
      const response = await fetch(url, { signal: AbortSignal.timeout(3500), headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error("OpenAlex HTTP " + response.status);
      const body = await response.json();
      return (body.results || []).slice(0, 6).map((work, index) => {
        let abstract = "";
        if (work.abstract_inverted_index && typeof work.abstract_inverted_index === "object") {
          const words = [];
          for (const [word, positions] of Object.entries(work.abstract_inverted_index)) for (const position of positions || []) words[position] = word;
          abstract = words.filter(Boolean).join(" ").slice(0, 1100);
        }
        const authors = (work.authorships || []).slice(0, 3).map(a => a.author && a.author.display_name).filter(Boolean).join(", ");
        return { id: "S" + (index + 1), title: work.title || "Título no disponible", year: work.publication_year || null, authors, doi: work.doi || "", url: (work.primary_location && work.primary_location.landing_page_url) || work.doi || "", cited_by_count: work.cited_by_count || 0, abstract };
      }).filter(item => item.title && (item.url || item.abstract));
    } catch (error) { console.warn("[JAI][Research] OpenAlex no disponible:", error && error.message); return []; }
  }
  const researchQuery = topic.trim();
  const researchSources = await fetchResearchSources(researchQuery);
  const researchContext = researchSources.length ? researchSources.map(s => "[" + s.id + "] " + s.title + " (" + (s.year || "año no indicado") + "). Autores: " + (s.authors || "no disponibles") + ". DOI/URL: " + (s.url || "no disponible") + ". Resumen: " + (s.abstract || "sin resumen recuperado")).join("\n") : "No se recuperaron fuentes académicas. No afirmes que la investigación fue verificada."
  const prompt = `FUENTES ACADÉMICAS RECUPERADAS AUTOMÁTICAMENTE (OpenAlex):
${researchContext}
REGLAS DE FUENTES: solo cita IDs [S1], [S2], etc. que aparezcan en esta lista. Nunca inventes títulos, autores, DOI ni enlaces. Cada afirmación central de fact_audit debe incluir source_ids (array) y evidence. Si ninguna fuente respalda directamente la afirmación, source_ids=[] y no la presentes como verificada. Añade research_sources al JSON copiando únicamente las fuentes listadas. Descarta resultados irrelevantes.


Eres el director editorial, guionista y estratega de retención de J.A.I. Viral Studio.
Diseña un plan de producción de alta calidad para un video educativo vertical 9:16.
Objetivo: maximizar interés, comprensión, retención y potencial de compartirse sin prometer viralidad ni usar engaños.

REGLAS EDITORIALES Y CIENTÍFICAS:
ARQUITECTURA EDITORIAL OBLIGATORIA — TRABAJA EN ETAPAS INTERNAS ANTES DE ESCRIBIR:
A. INVESTIGADOR: descompón la pregunta en subpreguntas; identifica mecanismo, condiciones, excepciones y consenso. Usa primero las notas del usuario como pistas, nunca como evidencia automática. Si no tienes acceso real a fuentes externas durante esta solicitud, NO afirmes haber buscado, consultado ni verificado fuentes. No inventes nombres de estudios, autores, enlaces, instituciones ni referencias. Separa "hecho establecido", "dato que requiere fuente" y "incertidumbre".
B. PROFESOR: explica el fenómeno desde lo intuitivo hasta lo molecular/técnico. Define los términos inevitables en lenguaje cotidiano. Construye una cadena causal explícita: condición inicial → qué cambia → por qué cambia → consecuencia observable → qué límites/excepciones existen. Cada frase del guion debe enseñar un hecho, responder una pregunta o preparar una revelación; elimina frases que solo suenen científicas.
C. AUDITOR: revisa cada afirmación del guion contra tu conocimiento fiable y las notas aportadas. Si no puedes respaldarla con seguridad, rebájala, matízala o márcala como pendiente; nunca la presentes como verificada. Distingue cambio físico, cambio químico, mecanismo y correlación. No fabriques valores numéricos para llenar escenas.
D. DIRECTOR VISUAL: solo después de cerrar la explicación, asigna a cada escena una demostración que haga visible la causa o consecuencia explicada. Cada imagen debe aportar evidencia visual conceptual, no decoración. Si una escena no enseña nada nuevo, elimínala o rediseñala.
E. EDITOR: comprueba que la narración realmente explica el tema completo dentro de la duración, sin sacrificar precisión para meter más estímulos.
F. ALCANCE UNIVERSAL: antes de escribir, identifica las ramas, procesos y preguntas esenciales que contiene el tema. Separa lo imprescindible, lo complementario y lo que queda fuera del alcance.
G. DELIMITACIÓN: si el tema reúne varios procesos independientes o demasiado contenido para la duración, no los comprimas a la fuerza. Propón una visión general honesta o una serie de episodios conectados y define qué explica este episodio.
H. PERTINENCIA DE EVIDENCIA: una fuente encontrada por búsqueda temática o coincidencia de palabras es solo una candidata. No digas que respalda una afirmación hasta comprobar que el título/resumen o el texto leído trata directamente esa afirmación. Distingue fuente candidata, respaldo directo y afirmación sin verificar.
- La profundidad informativa tiene prioridad sobre el vocabulario técnico, la espectacularidad y la cantidad de escenas.
- No uses términos como moléculas, enlaces, energía, presión, ondas o reacción sin explicar qué papel desempeñan en el mecanismo.
- No conviertas una hipótesis explicativa simplificada en una descripción literal de lo que ocurre a escala molecular.
- En temas con cambio de estado, distingue claramente cambio físico de transformación química; no asumas que todos los materiales tienen un punto de fusión simple ni que el material permanece químicamente intacto.
- Para cada idea central, responde "¿por qué ocurre?" y "¿qué observaríamos si no ocurriera?". Incluye límites relevantes cuando cambien la conclusión.
- No presentes la lista verification como evidencia ya consultada. Cada elemento debe declarar afirmación, estado ("respaldada por notas", "conocimiento general pendiente de fuente" o "no resuelta"), evidencia concreta disponible y qué falta. Si no hay fuente aportada, dilo claramente.
- Añade research_brief (4–7 puntos), causal_chain (pasos ordenados), concept_explanations (término + explicación sencilla + función en el fenómeno) y fact_audit (afirmación + estado + justificación + tratamiento editorial + source_ids + evidence).
- Guion: explica mecanismos con ejemplos concretos; no encadenes frases grandilocuentes. Incluye al menos dos capas de explicación: intuición cotidiana y mecanismo real. La narración debe poder enseñarse sin imágenes.
- STORYBOARD DIDÁCTICO: cada escena debe responder a una frase concreta del guion. Añade en cada escena "teaching_point" (qué aprende el espectador) y "visual_proof" (qué elemento visible demuestra o aclara esa idea). Prohíbe termómetros, cifras, etiquetas o instrumentos si el dato no está respaldado.
- RETENTION MAP: estímulo nuevo no significa solo cambio visual; cada bloque debe avanzar la comprensión. En visual_action indica qué mecanismo o contraste se hace visible, no solo un movimiento decorativo.
- No inventes cifras, estudios, citas, fuentes ni hechos. Distingue hechos conocidos de hipótesis y señala qué requiere verificación.
- Las notas del usuario son material de partida, no hechos automáticamente confirmados.
- En ciencia, explica el mecanismo con precisión y evita simplificaciones que cambien la causa física. No confundas absorción, reflexión, dispersión, refracción o emisión. Si hay varios mecanismos, indica cuál predomina y bajo qué condiciones.
- No presentes como universal una explicación que dependa de profundidad, composición, iluminación, escala u otras condiciones.
- AUDITORÍA ANTI-FALSA PRECISIÓN: una cifra marcada como "pendiente de fuente", "media", "provisional" o "no resuelta" NO puede aparecer como hecho en angle, hook, script, story, retention_map ni on_screen_text. Tampoco puede aparecer en voz ni en un fotograma. Si es importante, exprésala cualitativamente o exclúyela hasta contar con fuente.
- No inventes mecanismos microscópicos para hacer una escena más espectacular. Una visualización molecular es un modelo didáctico, no una observación directa; identifícala como esquema conceptual cuando corresponda.
- No describas la fusión como ruptura súbita de enlaces intermoleculares individuales salvo que sea una explicación rigurosa y respaldada para el material concreto. Evita "la vibración supera la fuerza de los enlaces" como explicación universal.
- DURACIÓN Y FORMATO DE TIEMPOS: para cada escena story.time escribe SIEMPRE un intervalo explícito "0:00 - 0:06", nunca solo un segundo inicial. Las escenas deben cubrir exactamente el mismo intervalo total que retention_map. retention_map usa bloques consecutivos de máximo 3 segundos y su último bloque termina exactamente al final de la última escena. Para 30–45 s, guion de 75–90 palabras y duración final concreta de 36–42 s; no declares 30 s si el texto hablado requiere más.

- No inventes microgotas, diámetros, escalas, termómetros, temperaturas, porcentajes o tiempos microscópicos ("0.5 mm", etc.) sin respaldo explícito. Usa escalas cualitativas si no hay evidencia.
- CONTROL DE DURACIÓN: la duración declarada debe coincidir entre guion, storyboard y mapa. Estima el guion hablado a 130–145 palabras/minuto en español. Si la duración objetivo es 30–45 s, apunta a 75–90 palabras narradas y elige una duración final de 36–42 segundos y storyboard/mapa deben cubrir esa misma duración. No declares 36 s si el guion narrado requiere 48.5 s. Si la locución generada luego dura más, la interfaz debe adaptar el montaje o advertirlo sin afirmar sincronía exacta.
- Antes de devolver JSON, realiza una auditoría cruzada: cualquier dato marcado pendiente no debe reaparecer como certeza en el guion ni en los visuales; comprueba duración estimada y cronología; comprueba que cada visual_proof sea demostrable y no un detalle inventado.
- No afirmes que verificaste fuentes externas si no se proporcionaron fuentes en las notas.
- Abre con un hook potente de 1–3 segundos que cree curiosidad concreta, pero no llames "mentira" a una explicación parcialmente cierta sin matizarla.
- RITMO Y SEGMENTACIÓN: organiza la explicación en unidades de avance comprensibles. El mapa de retención puede usar bloques consecutivos de máximo 3 segundos para planificar microavances, pero eso NO obliga a cortar el plano cada 3 segundos. Mantén un plano cuando la continuidad ayude a comprender; cambia encuadre, escala o escena cuando aporte información nueva.
- COHERENCIA: cada elemento visual, efecto sonoro, rótulo y frase debe contribuir al objetivo de aprendizaje. Elimina adornos, datos laterales y estímulos que compitan con el mecanismo central.
- Cada bloque debe aportar una pieza distinta de comprensión, una pregunta concreta, una demostración o una revelación verificable. No cuenta como avance cambiar solo el color, mover una barra o repetir el mismo plano.
- Cada 6–9 segundos, si la estructura del tema lo permite, ofrece una revelación, contraste o respuesta parcial que abra una pregunta nueva; no fuerces giros si perjudican la explicación.
- La segmentación debe seguir límites conceptuales o causales, no cortes arbitrarios. Deja pausas cuando el espectador necesite procesar una relación compleja.
- Cuando se nombre un componente, coordina la señal visual con ese mismo componente en el momento de la narración. No resaltes un objeto antes o después de que se explique si eso genera confusión.
- retention_map debe cubrir toda la duración con bloques consecutivos de máximo 3 segundos, sin huecos ni solapamientos. Cada bloque debe incluir time, new_stimulus, narrative_advance, curiosity, visual_action y on_screen_text.
- El vídeo debe poder entenderse sin depender de efectos llamativos. La narración debe explicar la cadena causal y el visual debe aclarar exactamente el paso que se está contando.
- Añade en quality_check una pregunta breve de recuperación o predicción que permita comprobar si se entendió la causa, no solo si el vídeo resultó atractivo. Esta pregunta es una actividad posterior a la visualización, no una afirmación científica ni una obligación de incluirla en la locución.
- No uses retención, agrado, vistas o potencial viral como sustitutos de aprendizaje. Distingue calidad de contenido, precisión científica, atención y comprensión.
- BLOQUEO SEMÁNTICO: identifica el dominio del tema y conserva ese dominio visual en todos los bloques. Cada objeto, entorno, material y acción debe pertenecer al tema o funcionar como comparación relevante y explicada.
- La narración y el visual_action deben describir el mismo fenómeno. Comprueba bloque por bloque: sujeto narrado = sujeto visible; acción narrada = acción representada; resultado visual = resultado explicado. Si no coinciden, reescribe el bloque.
- DIRECCIÓN VISUAL OBLIGATORIA PARA TODO EL VIDEO: cada fotograma debe pertenecer al mismo universo de visualización científica cinematográfica CGI 3D, con iluminación volumétrica, profundidad real, materiales detallados, fondo oscuro elegante y acentos luminosos cian/turquesa/ámbar cuando sean científicamente pertinentes. La paleta y el acabado se mantienen; el contenido, objeto protagonista, escala, perspectiva y encuadre cambian según cada bloque. No repetir la misma imagen, personaje, plano ni composición. No usar estética vintage, retro, sepia, ilustración infantil, cartoon, fotografía de archivo ni personajes humanos innecesarios.\n- En cada visual_action nombra objetos concretos y su disposición espacial. Evita conceptos visuales genéricos como "energía", "fenómeno", "partículas" o "moléculas flotando" si no especificas qué representan, cómo se relacionan y qué transformación muestran.
- Si el tema no tiene una plantilla visual especializada, diseña una escena editorial específica basada en los sustantivos y verbos del bloque; no sustituyas el tema por una animación genérica de otro dominio.
- DIFERENCIA ENTRE IMAGEN Y ANIMACIÓN: el campo visual describe el fotograma final que debe ver el espectador: sujeto protagonista, entorno, materiales, escala, profundidad, iluminación y fenómeno físico. Debe leerse como una dirección de arte cinematográfica, no como una orden de producción ni como una transcripción literal de la narración.
- El campo animation describe qué cambia entre el inicio y el final del plano: movimiento del sujeto, transformación, desplazamiento, expansión, colisión, apertura, reacción o revelación. Nunca uses la cámara como sujeto protagonista.
- La imagen NO debe representar literalmente palabras de instrucciones como "observa", "mira", "acerca", "revela", "toma", "plano" o "cámara". Interpreta la intención y diseña una representación visual del fenómeno que explique el contenido.
- PROHIBIDO incluir cámaras, lentes, trípodes, operadores, monitores, claquetas o equipo de filmación en los fotogramas. Las referencias a cámara solo sirven para escoger el punto de vista y jamás deben convertirse en objetos visibles.
- Si el concepto es abstracto, tradúcelo a una visualización científica concreta y comprensible: estructuras, sustancias, fuerzas, campos, cambios de estado o relaciones causales que pertenezcan al tema. No recurras a decoración aleatoria ni a metáforas sin explicación.
- Cada visual debe poder funcionar como una imagen fija potente y reconocible incluso sin texto. La animación se añade después y no debe ser necesaria para entender qué representa el fotograma.
- visual_action debe describir una acción física visible y realizable (por ejemplo: la cámara atraviesa una capa, un objeto cae y rebota, una esfera se abre y revela su interior, dos elementos chocan o una comparación aparece lado a lado). No uses instrucciones abstractas como 'hacerlo interesante'.
- No encadenes más de dos bloques con el mismo objeto protagonista. Alterna plano general, demostración física, macro, comparación, vista interna, entorno y escala humana cuando el tema lo permita.
- visual_action debe describir un movimiento físico observable con inicio y resultado; evita acciones vagas como "flota", "brilla" o "se mueve" sin explicar qué cambia.
- Escribe visual como descripción de arte de una imagen final: "Escena: [entorno y sujeto físico]. Fenómeno: [qué está ocurriendo]. Composición: [perspectiva y escala]. Acabado: CGI científico cinematográfico 3D". Escribe animation y visual_action por separado como instrucciones de movimiento físico del sujeto: "Inicio: [...]. Movimiento: [...]. Final: [cambio visible]". No conviertas el movimiento de cámara en el contenido de la imagen.
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

Devuelve SOLAMENTE JSON válido con estas claves:
category, research_sources, research_brief, causal_chain, concept_explanations, fact_audit, angle, hook, script, story, retention_map, verification, quality_check.
category: categoría breve.
angle: enfoque editorial en 2-3 frases.
hook: hook inicial.
script: guion completo con marcas [HOOK], [PROMESA], [CONTEXTO], [EXPLICACIÓN], [REVELACIÓN], [CIERRE].
research_brief: lista de 4 a 7 hallazgos concisos con su nivel de certeza. causal_chain: pasos numerados de causa y efecto. concept_explanations: lista de objetos con term, plain_explanation y role. fact_audit: lista de objetos con claim, status, rationale y editorial_treatment. story: arreglo de 5 a 8 objetos de escena; cada objeto debe tener time, objective, teaching_point, visual_proof, visual, animation, on_screen_text, transition.
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
          signal: AbortSignal.timeout(26000)
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
            signal: AbortSignal.timeout(20000)
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

    const validSourceIds = new Set(researchSources.map(source => source.id));
    plan.research_sources = researchSources;
    const auditStopWords = new Set(["cuando","porque","sobre","durante","entre","despues","proceso","afirmacion","conocimiento","general","temperatura","molecular","cambio","forma"]);
    if (Array.isArray(plan.fact_audit)) plan.fact_audit = plan.fact_audit.map(item => {
      const claimTokens = String(item.claim || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z]{5,}/g) || [];
      const keyTerms = [...new Set(claimTokens)].filter(word => !auditStopWords.has(word));
      const aliases = { caramelizacion: ["caramelization"], fusion: ["melting","fusion"], calor: ["heat","heating","thermal"], enlaces: ["bonds"], hidrogeno: ["hydrogen"], vibracion: ["vibration"], descomposicion: ["decomposition"], cristalina: ["crystalline","crystal"], moleculas: ["molecules"], humedad: ["moisture","water"], temperatura: ["temperature"] };
      const expandedTerms = keyTerms.flatMap(word => [word, ...(aliases[word] || [])]);
      const ids = (Array.isArray(item.source_ids) ? item.source_ids : []).filter(id => {
        const source = researchSources.find(entry => entry.id === id);
        if (!source) return false;
        const sourceText = (source.title + " " + source.abstract).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return expandedTerms.filter(word => sourceText.includes(word)).length >= 2;
      });
      const originalStatus = String(item.status || "").toLowerCase();
      const unresolved = /pendient|pending|no resuelt|no verific|provisional|incertid|bajo|moderad/.test(originalStatus);
      return { ...item, source_ids: ids, status: ids.length ? "fuente relacionada recuperada; pertinencia pendiente de revisión" : (unresolved ? "no verificada" : "conocimiento general; sin fuente específica"), evidence: ids.length ? String(item.evidence || "La fuente coincide en términos; revisar el resumen para confirmar que respalda la afirmación.") : "No hay una fuente recuperada cuya ficha coincida con esta afirmación." };
    });
    // Las afirmaciones sin cita específica no son automáticamente falsas.
    // Se muestran como pendientes de documentación, pero no se bloquea el plan por coincidencias léxicas.
    plan.editorial_warnings = (Array.isArray(plan.fact_audit) ? plan.fact_audit : [])
      .filter(item => item.status === "no verificada")
      .map(item => ({ claim: item.claim, reason: "No se vinculó una fuente académica recuperada; requiere revisión antes de publicar como dato especializado." }));
    const spokenText = String(plan.script || "").replace(/\\[[^\\]]+\\]/g, " ");
    const wordCount = (spokenText.match(/[a-záéíóúüñ0-9]+/gi) || []).length;
    const estimatedSeconds = Math.round(wordCount / 140 * 60);
    const parseClock = value => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const text = String(value || "").trim();
      if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
      const match = text.match(/(\d+):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
    };
    const parseRange = value => {
      const match = String(value || "").match(/(\d+):(\d{2})\s*[-–—]\s*(\d+):(\d{2})/);
      return match ? { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) } : null;
    };
    const scenes = Array.isArray(plan.story) ? plan.story : [];
    const parsedScenes = scenes.map(scene => {
      const range = parseRange(scene && scene.time);
      return range || { start: parseClock(scene && scene.time), end: NaN };
    }).filter(scene => Number.isFinite(scene.start)).sort((a,b) => a.start-b.start);
    const mapBlocks = Array.isArray(plan.retention_map) ? plan.retention_map : [];
    const mapRanges = mapBlocks.map(beat => parseRange(beat && beat.time));
    const mapEnd = mapRanges.length && mapRanges.every(Boolean) ? mapRanges[mapRanges.length - 1].end : 0;
    const inferredSceneEnds = parsedScenes.map((scene,index) => {
      if (Number.isFinite(scene.end) && scene.end > scene.start) return scene.end;
      const next = parsedScenes[index+1];
      return next && next.start > scene.start ? next.start : (mapEnd > scene.start ? mapEnd : scene.start + 6);
    });
    const storyboardSeconds = parsedScenes.length
      ? Math.max(...inferredSceneEnds)
      : mapEnd;
    const mapCoverageValid = mapRanges.length > 0 &&
      mapRanges.every((range, index) => range && range.end > range.start && range.end - range.start <= 3 &&
        (index === 0 ? range.start === 0 : range.start === mapRanges[index - 1].end)) &&
      mapEnd === storyboardSeconds;
    const narrationDifference = Math.abs(estimatedSeconds - storyboardSeconds);
    const narrationWithinTolerance = storyboardSeconds > 0 &&
      narrationDifference <= Math.max(8, storyboardSeconds * 0.25);
    const durationConsistent = storyboardSeconds > 0 && mapCoverageValid && narrationWithinTolerance;
    plan.duration_validation = {
      script_word_count: wordCount,
      estimated_narration_seconds: estimatedSeconds,
      storyboard_seconds: storyboardSeconds,
      retention_blocks: mapBlocks.length,
      retention_map_valid: mapCoverageValid,
      narration_within_tolerance: narrationWithinTolerance,
      within_tolerance: durationConsistent,
      status: durationConsistent ? "duración estimada coherente; confirmar con el audio real" : "requiere ajuste de montaje o locución",
      warning: durationConsistent ? "" : "El plan se muestra para revisión. La duración hablada es una estimación; ajusta los tiempos al audio real antes de exportar."
    };
    if (!mapCoverageValid) {
      plan.editorial_warnings = [...(Array.isArray(plan.editorial_warnings) ? plan.editorial_warnings : []),
        { claim: "Cronología del mapa de retención", reason: "Los bloques no cubren la duración del storyboard en intervalos consecutivos de hasta 3 segundos; revisar antes de producir." }];
    }
    if (!narrationWithinTolerance) {
      plan.editorial_warnings = [...(Array.isArray(plan.editorial_warnings) ? plan.editorial_warnings : []),
        { claim: "Duración de la narración", reason: "La estimación por número de palabras difiere del montaje previsto; ajustar la locución o el montaje usando la duración del audio real." }];
    }
    console.info("[JAI] Plan generado y validado con", providerUsed);
    return res.status(200).json(plan);
  } catch (error) {
    console.error("[JAI] Error de conexión:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo completar la generación. Revisa Runtime Logs; no compartas claves ni secretos.", diagnosticCode: "AI_GENERATION_ERROR" });
  }
}
