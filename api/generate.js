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

  const safeNotes = typeof notes === "string" ? notes.slice(0, 5000) : "";
  const safeLearningMemory = typeof learning_memory === "string" ? learning_memory.slice(0, 2400) : "";
  // Investigación académica abierta mediante OpenAlex; no requiere clave ni tarjeta.
  async function fetchResearchSources(query) {
    try {
      const url = "https://api.openalex.org/works?search=" + encodeURIComponent(query) + "&filter=type:article,from_publication_date:2000-01-01&sort=relevance_score:desc&per-page=6&select=id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,cited_by_count";
      const response = await fetch(url, { signal: AbortSignal.timeout(3500), headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error("OpenAlex HTTP " + response.status);
      const body = await response.json();
      return (body.results || []).slice(0, 3).map((work, index) => {
        let abstract = "";
        if (work.abstract_inverted_index && typeof work.abstract_inverted_index === "object") {
          const words = [];
          for (const [word, positions] of Object.entries(work.abstract_inverted_index)) for (const position of positions || []) words[position] = word;
          abstract = words.filter(Boolean).join(" ").slice(0, 500);
        }
        const authors = (work.authorships || []).slice(0, 3).map(a => a.author && a.author.display_name).filter(Boolean).join(", ");
        return { id: "S" + (index + 1), title: work.title || "Título no disponible", year: work.publication_year || null, authors, doi: work.doi || "", url: (work.primary_location && work.primary_location.landing_page_url) || work.doi || "", cited_by_count: work.cited_by_count || 0, abstract };
      }).filter(item => item.title && (item.url || item.abstract));
    } catch (error) { console.warn("[JAI][Research] OpenAlex no disponible:", error && error.message); return []; }
  }
  const researchQuery = topic.trim();
  const researchSources = await fetchResearchSources(researchQuery);
  const researchContext = researchSources.length ? researchSources.map(s => "[" + s.id + "] " + s.title + " (" + (s.year || "año no indicado") + "). Autores: " + (s.authors || "no disponibles") + ". DOI/URL: " + (s.url || "no disponible") + ". Resumen: " + (s.abstract || "sin resumen recuperado")).join("\n") : "No se recuperaron fuentes académicas. No afirmes que la investigación fue verificada."
  const prompt = [
    "Eres el equipo editorial científico y director de producción de J.A.I. Crea un plan educativo vertical 9:16. Devuelve SOLO JSON válido.",
    "",
    "PRINCIPIOS UNIVERSALES:",
    "1) Investiga el dominio y reconstruye el mecanismo real: condición inicial → receptor/causa → transmisión o transformación → integración → resultado. No saltes pasos esenciales.",
    "2) Distingue detección, transmisión, integración y experiencia consciente; mecanismo y correlación; hecho establecido e incertidumbre.",
    "3) No inventes datos, cifras, fuentes, anatomía, objetos ni mecanismos. Las notas del usuario son pistas, no evidencia. Una fuente temática solo es candidata: úsala como respaldo directo únicamente si título/resumen la apoya claramente.",
    "4) Si no hay respaldo recuperado, etiqueta la afirmación como conocimiento general pendiente de fuente. Nunca finjas una revisión académica.",
    "5) Explica por qué ocurre cada paso y qué consecuencia observable produce. Define términos técnicos en lenguaje cotidiano. La narración debe enseñar sin depender de imágenes.",
    "6) Si el tema excede el tiempo, delimita honestamente el episodio o propone una serie; no comprimas hasta distorsionar.",
    "7) Cada escena enseña una unidad causal y demuestra exactamente lo narrado. Visuales CGI coherentes, objetos reconocibles, anatomía/materiales plausibles, una acción dominante; no decoración abstracta, nubes ni personajes aleatorios. Declara esquemas conceptuales cuando corresponda.",
    "8) Audita consistencia entre afirmación, evidencia, cadena causal, guion, escena, prueba visual y tiempo.",
    "",
    "FUENTES RECUPERADAS (OpenAlex):",
    researchContext,
    "Solo usa IDs [S1]...[S3] existentes. No atribuyas respaldo directo por coincidencia de palabras. Copia las fuentes usadas en research_sources; descarta las irrelevantes.",
    "",
    "ENTREGABLE:",
    "- category, angle, hook.",
    "- script: 75–90 palabras realmente narradas para 30–45 s; excluye etiquetas [HOOK], [PROMESA], [CONTEXTO], [EXPLICACIÓN], [REVELACIÓN], [CIERRE]. Español claro, mecanismo causal, sin relleno.",
    "- research_brief: 4–6 puntos; causal_chain: pasos ordenados; concept_explanations: objetos con term, plain_explanation, role.",
    "- fact_audit: objetos con claim, status, rationale, editorial_treatment, source_ids (array) y evidence. Usa status explícito: respaldo directo, conocimiento general pendiente de fuente o no resuelto.",
    "- story: exactamente 4 escenas conceptuales (5 solo si es imprescindible), intervalos explícitos consecutivos desde 0:00 hasta el final. Cada escena incluye time, objective, teaching_point, visual_proof, visual, animation, on_screen_text, transition y los campos visual_subject, visual_state, visual_action, visual_composition, visual_environment, visual_prompt_en. Ningún campo vacío.",
    "- Los cinco campos visuales técnicos van en inglés natural y describen sujeto físico concreto, estado, acción observable, encuadre vertical seguro y entorno pertinente. visual_prompt_en: 35–80 palabras en inglés, una sola imagen CGI específica y reconocible. No uses conceptos abstractos como sujeto.",
    "- retention_map: bloques consecutivos de máximo 3 s que cubran exactamente la duración del storyboard. Cada bloque incluye time, new_stimulus, narrative_advance, curiosity, visual_action, on_screen_text (2–6 palabras). Cada bloque avanza la enseñanza y coincide con la narración.",
    "- verification: afirmaciones que requieren comprobación y evidencia faltante. quality_check: precisión, cobertura, originalidad y pregunta de recuperación.",
    "- No devuelvas storyboard ni mapa incompletos. No inventes escenas para rellenar.",
    "",
    "TEMA: " + topic.trim(),
    "DURACIÓN: " + duration,
    "PLATAFORMA: " + platform,
    "NOTAS DEL USUARIO: " + safeNotes,
    "MEMORIA EDITORIAL (solo diversidad creativa; nunca evidencia): " + (safeLearningMemory || "Sin historial")
  ].join("\n");

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
            max_completion_tokens: 3800
          }),
          signal: AbortSignal.timeout(22000)
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

      const geminiModel = "gemini-3.8-flash";
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
                maxOutputTokens: 3000
              }
            }),
            signal: AbortSignal.timeout(16000)
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
        const detail = String(geminiData?.error?.message || "Sin detalle").replace(/[\r\n\t]+/g, " ").slice(0, 240);
        const groqDetail = String(groqFailure || "Groq no disponible").replace(/[\r\n\t]+/g, " ").slice(0, 180);
        console.error("[JAI][Gemini] HTTP", geminiResponse.status, detail.slice(0, 500), "| Groq:", groqDetail);
        return res.status(502).json({
          error: "Fallaron los dos motores. Groq: " + groqDetail + " | Gemini HTTP " + geminiResponse.status + ": " + detail,
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
      providerUsed = "Gemini 3.8 Flash (respaldo)";
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
            else if (ch === "\\") escaped = true;
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

    // Reparación automática del storyboard: nunca se devuelve una producción visual incompleta.
    const parseModelObject = rawText => {
      const textValue = String(rawText || "").replace(/^\uFEFF/, "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      try { const value = JSON.parse(textValue); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch {}
      const first = textValue.indexOf("{");
      if (first < 0) return null;
      let depth = 0, inString = false, escaped = false;
      for (let i = first; i < textValue.length; i++) {
        const ch = textValue[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) {
          try { return JSON.parse(textValue.slice(first, i + 1).replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
        }
      }
      return null;
    };
    const inspectStoryboard = candidate => {
      const scenes = Array.isArray(candidate?.story) ? candidate.story : [];
      const beats = Array.isArray(candidate?.retention_map) ? candidate.retention_map : [];
      const range = value => {
        const match = String(value || "").match(/(\d+):(\d{2})\s*[-–—]\s*(\d+):(\d{2})/);
        if (!match) return null;
        const start = Number(match[1]) * 60 + Number(match[2]);
        const end = Number(match[3]) * 60 + Number(match[4]);
        return end > start ? { start, end } : null;
      };
      if (scenes.length < 4 || scenes.length > 5) return { ok: false, reason: "Se requieren 4 o 5 escenas conceptuales completas; llegaron " + scenes.length + "." };
      let cursor = 0;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i] && typeof scenes[i] === "object" ? scenes[i] : {};
        const r = range(scene.time);
        if (!r || r.start !== cursor) return { ok: false, reason: "La cronología de escenas está incompleta o tiene huecos en la escena " + (i + 1) + "." };
        cursor = r.end;
        const required = ["objective","teaching_point","visual_proof","visual_subject","visual_state","visual_action","visual_composition","visual_environment","visual_prompt_en"];
        const missing = required.filter(key => typeof scene[key] !== "string" || !scene[key].trim() || /pendiente|por definir|\.\.\.|\{.*\}/i.test(scene[key]));
        if (missing.length) return { ok: false, reason: "La escena " + (i + 1) + " tiene campos incompletos: " + missing.join(", ") + "." };
        const promptWords = scene.visual_prompt_en.trim().split(/\s+/).length;
        if (promptWords < 35 || promptWords > 100) return { ok: false, reason: "El prompt visual de la escena " + (i + 1) + " debe tener entre 35 y 100 palabras." };
      }
      if (!beats.length) return { ok: false, reason: "Falta el mapa de ritmo." };
      let beatCursor = 0;
      for (let i = 0; i < beats.length; i++) {
        const r = range(beats[i]?.time);
        if (!r || r.start !== beatCursor || r.end - r.start > 3) return { ok: false, reason: "El mapa de ritmo tiene huecos o bloques mayores de tres segundos en el bloque " + (i + 1) + "." };
        const fields = ["new_stimulus","narrative_advance","visual_action","on_screen_text"];
        if (fields.some(key => typeof beats[i][key] !== "string" || !beats[i][key].trim())) return { ok: false, reason: "El bloque " + (i + 1) + " no explica un avance visual y narrativo completo." };
        beatCursor = r.end;
      }
      if (beatCursor !== cursor) return { ok: false, reason: "El mapa de ritmo termina en " + beatCursor + " s y el storyboard en " + cursor + " s." };
      return { ok: true, seconds: cursor };
    };
    // Completa prompts visuales demasiado breves con los campos técnicos ya validados de la propia escena.
    // Evita un segundo fallo de reparación cuando el modelo sí describió el sujeto, estado y acción.
    const completeShortVisualPrompts = candidate => {
      if (!Array.isArray(candidate?.story)) return;
      for (const scene of candidate.story) {
        if (!scene || typeof scene !== "object") continue;
        const current = String(scene.visual_prompt_en || "").trim();
        const words = current ? current.split(/\\s+/).length : 0;
        if (words >= 35 && words <= 100) continue;
        const groundedFields = [scene.visual_subject, scene.visual_state, scene.visual_action, scene.visual_composition, scene.visual_environment]
          .filter(value => typeof value === "string" && value.trim())
          .map(value => value.trim().replace(/[.\\s]+$/g, ""));
        if (groundedFields.length < 5) continue;
        const completion = "Single coherent scientific CGI visualization, physically plausible materials, clearly visible subject and action, uncluttered environment, subject fully inside the vertical frame, precise surface and structural details, cinematic depth and controlled volumetric lighting, no text or watermark.";
        let combined = groundedFields.join(". ") + ". " + completion;
        const tokens = combined.split(/\\s+/);
        if (tokens.length > 100) combined = tokens.slice(0, 100).join(" ");
        scene.visual_prompt_en = combined;
      }
    };
    completeShortVisualPrompts(plan);
    let storyboardCheck = inspectStoryboard(plan);
    if (!storyboardCheck.ok) {
      console.warn("[JAI][Storyboard] Respuesta incompleta; se intentará reparar:", storyboardCheck.reason, "Proveedor original:", providerUsed, "finishReason:", finishReason);
      const spokenForRepair = String(plan.script || "").replace(/\[[^\]]+\]/g, " ");
      const repairWords = (spokenForRepair.match(/[a-záéíóúüñ0-9]+/gi) || []).length;
      const estimatedForRepair = Math.round(repairWords / 140 * 60);
      const requestedDuration = /30\s*[-–—]\s*45/.test(String(duration))
        ? Math.max(36, Math.min(42, Math.round((estimatedForRepair || 39) / 3) * 3))
        : Math.max(36, Math.min(90, Math.round((estimatedForRepair || 48) / 3) * 3));
      const repairPrompt = `Repair ONLY the storyboard and retention map for this existing Spanish educational video. Preserve the script's meaning and scientific scope. Return ONLY valid JSON: {"story":[...],"retention_map":[...]}.
DURATION: exactly ${requestedDuration} seconds, from 0:00 to ${Math.floor(requestedDuration/60)}:${String(requestedDuration%60).padStart(2,"0")}.
STORY: exactly 4 or 5 complete conceptual scenes, with consecutive explicit time ranges "0:00 - 0:08". Every scene must include objective, teaching_point, visual_proof, visual_subject, visual_state, visual_action, visual_composition, visual_environment, visual_prompt_en, visual, animation, on_screen_text, transition. All fields must be nonempty strings. visual_subject/state/action/composition/environment are natural English, concrete and topic-specific. visual_prompt_en is 45-80 English words describing ONE recognizable physical subject, its material state, one observable action, a relevant environment and portrait-safe composition. Never use placeholders, ellipses, braces, generic clouds or abstract particles.
RETENTION_MAP: consecutive blocks of maximum 3 seconds, covering exactly the same duration, each with time, new_stimulus, narrative_advance, curiosity, visual_action, on_screen_text. Each block advances the explanation and matches the script.
SCRIPT: ${spokenForRepair}
EXISTING STORYBOARD (may be malformed; do not copy placeholders): ${JSON.stringify(plan.story || []).slice(0,5000)}
EXISTING MAP (may be malformed): ${JSON.stringify(plan.retention_map || []).slice(0,3500)}
TOPIC: ${String(topic).slice(0,500)}
NOTES: ${safeNotes.slice(0,3500)}
Return no other keys and no markdown.`;
      let repairedText = "";
      const repairErrors = [];
      const repairOrder = providerUsed.startsWith("Groq") ? ["Groq", "Gemini"] : ["Gemini", "Groq"];
      for (const repairProvider of repairOrder) {
        if (repairedText) break;
        try {
          if (repairProvider === "Groq" && groqKey) {
            const repairResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [{ role: "system", content: "Return only complete valid JSON. Follow the requested schema exactly." }, { role: "user", content: repairPrompt }],
                response_format: { type: "json_object" },
                temperature: 0.25,
                max_completion_tokens: 3000
              }),
              signal: AbortSignal.timeout(10000)
            });
            const repairRaw = await repairResponse.text();
            let repairBody = {};
            try { repairBody = JSON.parse(repairRaw); } catch {}
            if (!repairResponse.ok) throw new Error("Groq HTTP " + repairResponse.status + ": " + String(repairBody?.error?.message || "").replace(/[\\r\\n\\t]+/g, " ").slice(0, 160));
            repairedText = repairBody.choices?.[0]?.message?.content || "";
          } else if (repairProvider === "Gemini" && process.env.GEMINI_API_KEY) {
            const repairResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
              method: "POST",
              headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: repairPrompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: 3000 } }),
              signal: AbortSignal.timeout(10000)
            });
            const repairRaw = await repairResponse.text();
            let repairBody = {};
            try { repairBody = JSON.parse(repairRaw); } catch {}
            if (!repairResponse.ok) throw new Error("Gemini HTTP " + repairResponse.status + ": " + String(repairBody?.error?.message || "").replace(/[\\r\\n\\t]+/g, " ").slice(0, 160));
            repairedText = repairBody.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
          }
          if (!repairedText) throw new Error("El proveedor no devolvió el storyboard reparado.");
          const candidateRepair = parseModelObject(repairedText);
          if (!candidateRepair || !Array.isArray(candidateRepair.story) || !Array.isArray(candidateRepair.retention_map)) {
            throw new Error("El proveedor devolvió una reparación JSON incompleta.");
          }
          const candidateCheck = inspectStoryboard({ ...plan, story: candidateRepair.story, retention_map: candidateRepair.retention_map });
          if (!candidateCheck.ok) throw new Error(candidateCheck.reason);
          console.info("[JAI][Storyboard] Reparación válida recibida de", repairProvider);
        } catch (repairError) {
          repairErrors.push(repairProvider + ": " + (repairError?.message || "error desconocido"));
          repairedText = "";
          console.warn("[JAI][Storyboard] Falló reparación con", repairProvider, repairError?.message || repairError);
        }
      }
      const repaired = parseModelObject(repairedText);
        if (repaired && Array.isArray(repaired.story) && Array.isArray(repaired.retention_map)) {
          plan.story = repaired.story;
          plan.retention_map = repaired.retention_map;
          completeShortVisualPrompts(plan);
          storyboardCheck = inspectStoryboard(plan);
        }
      if (!storyboardCheck.ok) {
        console.error("[JAI][Storyboard] Bloqueo de producción:", storyboardCheck.reason, "Errores de reparación:", repairErrors.join(" | "));
        return res.status(502).json({
          error: "J.A.I. detectó un storyboard incompleto y no pudo repararlo automáticamente. No se generarán escenas falsas ni una línea de tiempo incorrecta. Diagnóstico: " + storyboardCheck.reason,
          diagnosticCode: "STORYBOARD_REPAIR_FAILED"
        });
      }
      plan.editorial_warnings = [...(Array.isArray(plan.editorial_warnings) ? plan.editorial_warnings : []), { claim: "Reparación automática del storyboard", reason: "El primer borrador visual estaba incompleto. J.A.I. reconstruyó y volvió a validar escenas y mapa antes de habilitar producción." }];
      console.info("[JAI][Storyboard] Reparación completada:", storyboardCheck.seconds, "s");
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
    const spokenText = String(plan.script || "").replace(/\[[^\]]+\]/g, " ");
    const wordCount = (spokenText.match(/[a-záéíóúüñ0-9]+/gi) || []).length;
    const estimatedSeconds = Math.round(wordCount / 140 * 60);
    const parseRange = value => {
      const match = String(value || "").match(/(\d+):(\d{2})\s*[-–—]\s*(\d+):(\d{2})/);
      if (!match) return null;
      const start = Number(match[1]) * 60 + Number(match[2]);
      const end = Number(match[3]) * 60 + Number(match[4]);
      return end > start ? { start, end } : null;
    };
    const scenes = Array.isArray(plan.story) ? plan.story : [];
    const sceneRanges = scenes.map(scene => parseRange(scene && scene.time));
    const sceneCoverageValid = sceneRanges.length > 0 &&
      sceneRanges.every((range, index) => range &&
        (index === 0 ? range.start === 0 : range.start === sceneRanges[index - 1].end));
    const storyboardSeconds = sceneCoverageValid ? sceneRanges[sceneRanges.length - 1].end : 0;
    const mapBlocks = Array.isArray(plan.retention_map) ? plan.retention_map : [];
    const mapRanges = mapBlocks.map(beat => parseRange(beat && beat.time));
    const mapCoverageValid = mapRanges.length > 0 &&
      mapRanges.every((range, index) => range && range.end - range.start <= 3 &&
        (index === 0 ? range.start === 0 : range.start === mapRanges[index - 1].end)) &&
      storyboardSeconds > 0 && mapRanges[mapRanges.length - 1].end === storyboardSeconds;
    const narrationDifference = Math.abs(estimatedSeconds - storyboardSeconds);
    const narrationWithinTolerance = storyboardSeconds > 0 &&
      narrationDifference <= Math.max(5, storyboardSeconds * 0.15);
    const targetIs30To45 = /30\s*[-–—]\s*45/.test(String(duration));
    const wordCountWithinTarget = !targetIs30To45 || (wordCount >= 75 && wordCount <= 90);
    const durationConsistent = storyboardSeconds > 0 && sceneCoverageValid &&
      mapCoverageValid && narrationWithinTolerance && wordCountWithinTarget;
    plan.duration_validation = {
      script_word_count: wordCount,
      estimated_narration_seconds: estimatedSeconds,
      storyboard_seconds: storyboardSeconds,
      scene_count: scenes.length,
      scene_coverage_valid: sceneCoverageValid,
      retention_blocks: mapBlocks.length,
      retention_map_valid: mapCoverageValid,
      narration_within_tolerance: narrationWithinTolerance,
      word_count_within_target: wordCountWithinTarget,
      within_tolerance: durationConsistent,
      status: durationConsistent ? "duración y cronología coherentes; confirmar con el audio real" : "requiere ajuste editorial antes de producir",
      warning: durationConsistent ? "" : "El plan necesita corrección: revisa cantidad de palabras, intervalos de escenas, mapa de ritmo y duración estimada antes de producir."
    };
    const warnings = Array.isArray(plan.editorial_warnings) ? plan.editorial_warnings : [];
    const unsupportedClaims = (Array.isArray(plan.fact_audit) ? plan.fact_audit : [])
      .filter(item => !Array.isArray(item.source_ids) || item.source_ids.length === 0)
      .map(item => ({ claim: item.claim, reason: "No hay una fuente recuperada que respalde directamente esta afirmación; se conserva como conocimiento general pendiente de documentación, no como verificación académica." }));
    plan.editorial_warnings = [...new Map([...warnings, ...unsupportedClaims].map(item => [String(item.claim || "") + "|" + String(item.reason || ""), item])).values()];
    if (!sceneCoverageValid) {
      plan.editorial_warnings.push({ claim: "Cronología del storyboard", reason: "Las escenas deben tener intervalos explícitos, consecutivos, comenzar en 0:00 y no contener huecos ni solapamientos." });
    }
    if (!mapCoverageValid) {
      plan.editorial_warnings.push({ claim: "Cronología del mapa de ritmo", reason: "Los bloques deben cubrir el storyboard completo en intervalos consecutivos de máximo 3 segundos." });
    }
    if (!narrationWithinTolerance || !wordCountWithinTarget) {
      plan.editorial_warnings.push({ claim: "Duración de la narración", reason: "La cantidad de palabras y la duración estimada no coinciden con el montaje objetivo; ajustar el guion antes de producir." });
    }
    console.info("[JAI] Plan generado y validado con", providerUsed);
    return res.status(200).json(plan);
  } catch (error) {
    console.error("[JAI] Error de conexión:", error?.name || "Error", error?.message || "Sin detalle");
    return res.status(502).json({ error: "No se pudo completar la generación. Revisa Runtime Logs; no compartas claves ni secretos.", diagnosticCode: "AI_GENERATION_ERROR" });
  }
}
