import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import generateHandler from "../api/generate.js";
import narrateHandler from "../api/narrate.js";
import inspectVisualHandler from "../api/inspect-visual.js";
import directScenesHandler from "../api/direct-scenes.js";

// Guard the worst-case provider + retry + repair path against Vercel's 60s function limit.
const generationSource = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
const generationTimeouts = [...generationSource.matchAll(/AbortSignal\.timeout\((\d+)\)/g)].map(match => Number(match[1]));
assert.deepEqual(generationTimeouts, [2500, 12000, 12000, 6000, 6000], "Generation provider and repair timeouts must remain explicitly bounded.");
const worstCaseGenerationMs = 2500 + 12000 + (12000 * 2) + 1000 + (6000 * 2);
assert.ok(worstCaseGenerationMs < 60000, "Worst-case generation path must leave headroom inside Vercel's 60s limit.");

const originalFetch = globalThis.fetch;
const originalGroqKey = process.env.GROQ_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; }
  };
}

function makeValidPlan() {
  const story = Array.from({ length: 4 }, (_, index) => {
    const start = index * 9;
    const end = start + 9;
    return {
      time: "0:" + String(start).padStart(2, "0") + " - 0:" + String(end).padStart(2, "0"),
      objective: "Explicar la etapa " + (index + 1),
      teaching_point: "La etapa transforma una condición inicial en un resultado observable.",
      visual_proof: "La representación muestra el cambio específico de esta etapa.",
      visual_subject: "El objeto principal del proceso",
      visual_state: "Estado inicial y resultado visibles",
      visual_action: "El objeto cambia de forma observable",
      visual_composition: "Sujeto central con encuadre vertical equilibrado",
      visual_environment: "Entorno pertinente al proceso explicado",
      visual_prompt_en: "A realistic educational scene showing a clear subject in its natural environment, with precise materials, balanced cinematic lighting, a central focal action, portrait-safe framing, coherent proportions, and enough visual detail to demonstrate the specific teaching point without labels or decorative clutter.",
      visual_medium: "Ilustración educativa realista",
      animation_type: "Transformación progresiva",
      motion_sequence: ["Mostrar el estado inicial", "Revelar el cambio y su resultado"],
      continuity_anchor: "Conservar la identidad, escala y paleta del sujeto",
      visual: "El objeto principal en su entorno",
      animation: "Transformación progresiva",
      on_screen_text: "Etapa " + (index + 1),
      transition: "fade"
    };
  });
  const retention_map = Array.from({ length: 12 }, (_, index) => {
    const start = index * 3;
    const end = start + 3;
    return {
      time: "0:" + String(start).padStart(2, "0") + " - 0:" + String(end).padStart(2, "0"),
      new_stimulus: "Estímulo " + (index + 1),
      narrative_advance: "Avance " + (index + 1),
      curiosity: "Qué ocurrirá en el siguiente paso",
      visual_action: "Mostrar el cambio de la etapa",
      on_screen_text: "Paso " + (index + 1)
    };
  });
  return {
    clarification_required: false,
    clarification_question: null,
    category: "Educación",
    angle: "Explicación por etapas",
    hook: "Observa cómo cambia el proceso",
    script: Array.from({ length: 84 }, () => "palabra").join(" "),
    research_brief: ["Resumen de prueba"],
    causal_chain: ["Inicio", "Transformación", "Resultado"],
    concept_explanations: [],
    fact_audit: [],
    story,
    retention_map,
    editorial_warnings: [],
    verification: "Prueba de validación",
    quality_check: "Prueba de estructura"
  };
}

try {
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";

  // GitHub Pages must be able to call the Vercel API through a strict origin allowlist.
  {
    const allowedOrigin = "https://pollitalocaperron-hub.github.io";
    for (const handler of [generateHandler, narrateHandler, inspectVisualHandler, directScenesHandler]) {
      const res = mockResponse();
      await handler({ method: "OPTIONS", headers: { origin: allowedOrigin }, body: {} }, res);
      assert.equal(res.statusCode, 204, "Allowed Pages preflight must complete without invoking the provider");
      assert.equal(res.headers["Access-Control-Allow-Origin"], allowedOrigin);
      assert.equal(res.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
      assert.equal(res.headers["Access-Control-Allow-Headers"], "Content-Type");
      assert.equal(res.ended, true);
    }
    const blocked = mockResponse();
    await narrateHandler({ method: "OPTIONS", headers: { origin: "https://untrusted.example" }, body: {} }, blocked);
    assert.equal(blocked.statusCode, 403, "Untrusted origins must not receive cross-origin API access");
  }

  // The editorial endpoint must reject invalid methods and empty topics safely.
  {
    const res = mockResponse();
    await generateHandler({ method: "GET", body: {} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, "POST");
  }
  {
    const res = mockResponse();
    await generateHandler({ method: "POST", body: { topic: " " } }, res);
    assert.equal(res.statusCode, 400);
  }

  // Research retrieval must not exclude historical or non-journal knowledge by date/type.
  {
    const source = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
    assert.match(source, /works\?search=.*sort=relevance_score:desc&per-page=8/);
    assert.doesNotMatch(source, /filter=type:article|from_publication_date:2000-01-01/);
    assert.match(source, /type: work\.type \|\|/);
  }

  // A complete 36-second plan must pass chronology, scene and retention-map validation.
  {
    const plan = makeValidPlan();
    globalThis.fetch = async url => {
      if (String(url).includes("api.openalex.org")) return response({ results: [{
        title: "Historical foundational work", type: "book", publication_year: 1890,
        authorships: [], primary_location: { landing_page_url: "https://example.org/historical-work", source: { display_name: "Historical Archive" } },
        abstract_inverted_index: { Historical: [0], foundational: [1], evidence: [2] }, cited_by_count: 12
      }] });
      if (String(url).includes("api.groq.com")) {
        return response({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "stop" }] });
      }
      throw new Error("Unexpected network request in API contract test: " + url);
    };
    const res = mockResponse();
    await generateHandler({
      method: "POST",
      body: { topic: "Un proceso educativo", duration: "30–45 segundos", platform: "Reels" }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.story.length, 4);
    assert.equal(res.body.retention_map.length, 12);
    assert.equal(res.body.duration_validation.within_tolerance, true);
    assert.equal(res.body.duration_validation.script_word_count, 84);
    assert.equal(res.body.research_sources.length, 1);
    assert.equal(res.body.research_sources[0].type, "book");
    assert.equal(res.body.research_sources[0].year, 1890);
    assert.equal(res.body.research_sources[0].source_name, "Historical Archive");
  }

  // An incomplete model storyboard must be repaired and revalidated before production.
  {
    const validPlan = makeValidPlan();
    const incompletePlan = { ...validPlan, story: [], retention_map: [] };
    let groqCalls = 0;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes("api.openalex.org")) return response({ results: [] });
      if (String(url).includes("api.groq.com")) {
        groqCalls++;
        const payload = JSON.parse(options.body || "{}");
        const userPrompt = payload.messages?.[1]?.content || "";
        if (userPrompt.includes("Repair ONLY the storyboard")) {
          return response({
            choices: [{
              message: {
                content: JSON.stringify({ story: validPlan.story, retention_map: validPlan.retention_map })
              },
              finish_reason: "stop"
            }]
          });
        }
        return response({
          choices: [{ message: { content: JSON.stringify(incompletePlan) }, finish_reason: "stop" }]
        });
      }
      throw new Error("Unexpected network request in storyboard repair test: " + url);
    };
    const res = mockResponse();
    await generateHandler({
      method: "POST",
      body: { topic: "Un proceso que requiere reparar el storyboard", duration: "30–45 segundos", platform: "Reels" }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(groqCalls, 2, "The incomplete storyboard must trigger exactly one bounded repair request");
    assert.equal(res.body.story.length, 4);
    assert.equal(res.body.duration_validation.within_tolerance, true);
    assert.ok(res.body.editorial_warnings.some(item => item.claim === "Reparación automática del storyboard"));
  }

  // The scene director expands conceptual scenes into time-aligned, animation-ready shots.
  {
    const res = mockResponse();
    await directScenesHandler({ method: "GET", body: {} }, res);
    assert.equal(res.statusCode, 405);
  }
  {
    const story = makeValidPlan().story;
    const shots = [];
    story.forEach((scene, sceneIndex) => {
      const start = sceneIndex * 9;
      for (let part = 0; part < 2; part++) {
        const shotStart = start + part * 4.5;
        shots.push({
          scene_index: sceneIndex, start_seconds: shotStart, end_seconds: shotStart + 4.5,
          narration_segment: "La explicación describe esta acción concreta.",
          subtitle: "Acción " + (part + 1), subject: "Componente mecánico identificable",
          visual_state: "Estado inicial y cambio visible", visual_action: "El componente se desplaza de forma observable",
          visual_prompt_en: "Clean educational 2D editorial illustration of the exact mechanical component in a coherent portrait composition, clear shapes, consistent palette, separated readable parts and a specific teaching action.",
          continuity_anchor: "Same component geometry, color, scale and orientation across adjacent shots.",
          layers: [{ id: "component", description: "Componente principal", role: "subject" }, { id: "housing", description: "Estructura contenedora", role: "environment" }],
          animation_steps: [{ target_id: "component", action: "move", from_state: "lower", to_state: "upper", start_progress: 0, end_progress: 1 }, { target_id: "housing", action: "hold", from_state: "fixed", to_state: "fixed", start_progress: 0, end_progress: 1 }]
        });
      }
    });
    globalThis.fetch = async (url, options = {}) => {
      assert.ok(String(url).includes("api.groq.com"));
      const payload = JSON.parse(options.body || "{}");
      assert.match(payload.messages?.[1]?.content || "", /fotograma maestro de referencia/);
      return response({ choices: [{ message: { content: JSON.stringify({ shots }) } }] });
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.shot_count, 8);
    assert.equal(res.body.conceptual_scene_count, 4);
    assert.equal(res.body.animation_ready, true);
    assert.equal(res.body.shots[0].shot_id, "shot-01");
    assert.equal(res.body.shots[0].layers.length, 2);
  }

  // A free-tier quota error from Groq must route the scene plan to the configured free Gemini fallback.
  {
    const story = makeValidPlan().story;
    const shots = [];
    story.forEach((scene, sceneIndex) => {
      const start = sceneIndex * 9;
      for (let part = 0; part < 2; part++) {
        const shotStart = start + part * 4.5;
        shots.push({
          scene_index: sceneIndex, start_seconds: shotStart, end_seconds: shotStart + 4.5,
          narration_segment: "La explicación describe esta acción concreta.",
          subtitle: "Acción " + (part + 1), subject: "Componente mecánico identificable",
          visual_state: "Estado inicial y cambio visible", visual_action: "El componente se desplaza de forma observable",
          visual_prompt_en: "Clean educational 2D editorial illustration of the exact mechanical component in a coherent portrait composition, clear shapes, consistent palette, separated readable parts and a specific teaching action.",
          continuity_anchor: "Same component geometry, color, scale and orientation across adjacent shots.",
          layers: [{ id: "component", description: "Componente principal", role: "subject" }, { id: "housing", description: "Estructura contenedora", role: "environment" }],
          animation_steps: [{ target_id: "component", action: "move", from_state: "lower", to_state: "upper", start_progress: 0, end_progress: 1 }, { target_id: "housing", action: "hold", from_state: "fixed", to_state: "fixed", start_progress: 0, end_progress: 1 }]
        });
      }
    });
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("api.groq.com")) return response({ error: { message: "Free tier rate limit reached" } }, 429);
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return response({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shots }) }] } }] });
      }
      throw new Error("Unexpected provider in free-tier failover test: " + url);
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 200, "Gemini free fallback must complete the task after Groq quota exhaustion");
    assert.equal(res.body.provider, "Gemini 3.8 Flash");
    assert.equal(res.body.shot_count, 8);
    assert.equal(calls.length, 2, "Only the primary and configured free fallback may be called");
    assert.ok(calls[0].includes("api.groq.com"));
    assert.ok(calls[1].includes("generativelanguage.googleapis.com"));
  }

  // If all configured free-tier providers are quota-limited, fail closed without paid-provider escalation.
  {
    globalThis.fetch = async url => {
      if (String(url).includes("api.groq.com")) return response({ error: { message: "Rate limit reached" } }, 429);
      if (String(url).includes("generativelanguage.googleapis.com")) return response({ error: { message: "Quota exceeded" } }, 429);
      throw new Error("Unexpected paid or unknown provider call: " + url);
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story: makeValidPlan().story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.diagnosticCode, "FREE_QUOTA_EXHAUSTED");
    assert.match(res.body.error, /No se realizará ningún cobro/);
  }

  // Narration input and provider payload must be validated before returning PCM data.
  {
    const res = mockResponse();
    await narrateHandler({ method: "POST", body: { text: "Hola", voice: "VozInventada" } }, res);
    assert.equal(res.statusCode, 400);
  }
  {
    globalThis.fetch = async () => response({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: "AQIDBA==", mimeType: "audio/L16;codec=pcm;rate=24000" } }]
        }
      }]
    });
    const res = mockResponse();
    await narrateHandler({ method: "POST", body: { text: "Hola, esta es una prueba de voz.", voice: "Kore" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.audioBase64, "AQIDBA==");
    assert.equal(res.body.sampleRate, 24000);
  }

  // Visual QA must fail closed when the model reports issues, even with a high score.
  {
    globalThis.fetch = async () => response({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              results: [
                { scene_index: 0, status: "pass", score: 96, reason: "El sujeto y la acción coinciden con la escena.", issues: [] },
                { scene_index: 1, status: "pass", score: 98, reason: "La imagen es nítida pero incluye un objeto ajeno.", issues: ["Objeto ajeno al tema"] }
              ]
            })
          }]
        }
      }]
    });
    const res = mockResponse();
    await inspectVisualHandler({
      method: "POST",
      body: { images: [{ image_base64: "AQID" }, { image_base64: "BAUG" }] }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.results[0].status, "pass");
    assert.equal(res.body.results[1].status, "revise");
  }

  // Duplicate scene indexes must never be accepted as a complete visual audit.
  {
    globalThis.fetch = async () => response({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              results: [
                { scene_index: 0, status: "pass", score: 96, reason: "La imagen coincide claramente con el sujeto.", issues: [] },
                { scene_index: 0, status: "pass", score: 96, reason: "La imagen coincide claramente con el sujeto.", issues: [] }
              ]
            })
          }]
        }
      }]
    });
    const res = mockResponse();
    await inspectVisualHandler({
      method: "POST",
      body: { images: [{ image_base64: "AQID" }, { image_base64: "BAUG" }] }
    }, res);
    assert.equal(res.statusCode, 502);
  }

  console.log("PASS: editorial generation contract, chronology validation, narration validation/PCM response, and fail-closed visual audit contracts.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
}
