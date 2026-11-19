import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import generateHandler from "../api/generate.js";
import narrateHandler from "../api/narrate.js";
import inspectVisualHandler from "../api/inspect-visual.js";
import directScenesHandler from "../api/direct-scenes.js";
import { resolveVisualStyleProfile } from "../api/visual-style-profiles.js";

// Guard the worst-case provider + retry + repair path against Vercel's 60s function limit.
const generationSource = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(frontendSource, /const transformChain=\[\.\.\.chain,layer\]/, "Character rendering must apply parent-bone transforms before the child part.");
assert.match(frontendSource, /exportedParts\.has\(reusableKey\)/, "PNG export must deduplicate recurring character parts across shots.");
assert.match(frontendSource, /canvas\.toDataURL\("image\/png"\)/, "Character layer export must encode transparent canvas output as PNG.");
assert.match(frontendSource, /currentCinematicReady&&currentDurationValidation/, "Final export must require verified cinematic assets, not vector previews.");
assert.match(frontendSource, /Previsualización técnica completada/, "The UI must label legacy vector output as a preview, not final production.");
assert.match(frontendSource, /async function inspectRenderedBlob/, "A browser export must be decoded and checked before a download is exposed.");
assert.match(frontendSource, /fingerprints\\.size<3/, "The export QC must reject a frozen video.");
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
        if (!userPrompt.includes("Repair ONLY the storyboard")) assert.match(userPrompt, /BIBLIA DE TEMPORADA[\s\S]*"next_episode":2[\s\S]*El misterio ya fue descubierto/);
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
      body: { topic: "Un proceso que requiere reparar el storyboard", duration: "30–45 segundos", platform: "Reels", format_mode: "serie-viral", series_bible: { season_number: 1, episode_count: 10, episode_number: 1, next_episode: 2, world_state: "El misterio ya fue descubierto." } }
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
      for (let part = 0; part < 5; part++) {
        const shotStart = start + part * 1.8;
        shots.push({
          scene_index: sceneIndex, start_seconds: shotStart, end_seconds: shotStart + 1.8,
          narration_segment: "La explicación describe esta acción concreta.",
          subtitle: "Acción " + (part + 1), subject: "Componente mecánico identificable",
          visual_state: "Estado inicial y cambio visible", visual_action: "El componente se desplaza de forma observable",
          visual_prompt_en: "Clean educational 2D editorial illustration of the exact mechanical component in a coherent portrait composition, clear shapes, consistent palette, separated readable parts and a specific teaching action.",
          continuity_anchor: "Same component geometry, color, scale and orientation across adjacent shots.",
          background_color: "#F2EEE4", layers: [{"id":"component","description":"Componente principal","role":"subject","character_id":"hero","part_id":"torso","path_d":"M 240 420 C 260 360 460 360 480 420 L 480 760 C 460 820 260 820 240 760 Z","fill":"#E7A65A","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"housing","description":"Estructura contenedora","role":"environment","path_d":"M 150 300 L 570 300 L 570 900 L 150 900 Z","fill":"#D8E1E8","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"detail","description":"Detalle funcional","role":"detail","character_id":"hero","part_id":"head","path_d":"M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z","fill":"#E9D16C","stroke":"#25364A","stroke_width":7,"pivot_x":360,"pivot_y":550}],
          animation_steps: [{"target_id":"component","action":"move","from_state":"lower","to_state":"upper","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":-70,"rotation":0,"scale":1,"opacity":1}},{"target_id":"housing","action":"hold","from_state":"fixed","to_state":"fixed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}},{"target_id":"detail","action":"reveal","from_state":"hidden","to_state":"visible","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":20,"rotation":0,"scale":0.85,"opacity":0},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}}]
        });
      }
    });
    globalThis.fetch = async (url, options = {}) => {
      assert.ok(String(url).includes("api.groq.com"));
      const payload = JSON.parse(options.body || "{}");
      assert.match(payload.messages?.[1]?.content || "", /path_d/);
      return response({ choices: [{ message: { content: JSON.stringify({ shots }) } }] });
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.shot_count, 20, "The director must accept five continuous shots per conceptual scene");
    assert.equal(res.body.conceptual_scene_count, 4);
    assert.equal(res.body.animation_plan_validated, true);
    assert.equal(res.body.vector_preview_ready, true, "Validated independent vector layers and transforms must be renderable as a vector preview");
    assert.equal(res.body.animation_ready, false, "Vector layer transforms must not be advertised as cinematic animation readiness");
    assert.equal(res.body.visual_engine_status, "vector_preview_only");
    assert.equal(res.body.cinematic_ready, false, "Vector-only scene direction must never claim cinematic readiness.");
    assert.equal(res.body.scene_contracts.length, res.body.shots.length);
    assert.equal(res.body.scene_contracts[0].schema_version, "jai.scene.v1");
    assert.equal(res.body.scene_contracts[0].visual.source_type, "vector_scene");
    assert.equal(res.body.shots[0].shot_id, "shot-01");
    assert.equal(res.body.shots[0].layers.length, 3, "Each shot must contain multiple independently rendered vector layers");
    assert.equal(res.body.reusable_rigs.length, 1, "Repeated character parts must be consolidated into one reusable rig");
    assert.deepEqual(res.body.reusable_rigs[0].bones.map(bone => bone.bone_id).sort(), ["head", "torso"]);
    assert.equal(res.body.reusable_rigs[0].bones.find(bone => bone.bone_id === "head").parent_bone_id, "torso");
    assert.equal(res.body.narration_sync_validated, true);
    assert.equal(res.body.shots[0].narration_sync.length, 3);
    assert.ok(res.body.shots[0].narration_sync.every(event => event.start_seconds >= res.body.shots[0].start_seconds && event.end_seconds <= res.body.shots[0].end_seconds));

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
          background_color: "#F2EEE4", layers: [{"id":"component","description":"Componente principal","role":"subject","character_id":"hero","part_id":"torso","path_d":"M 240 420 C 260 360 460 360 480 420 L 480 760 C 460 820 260 820 240 760 Z","fill":"#E7A65A","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"housing","description":"Estructura contenedora","role":"environment","path_d":"M 150 300 L 570 300 L 570 900 L 150 900 Z","fill":"#D8E1E8","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"detail","description":"Detalle funcional","role":"detail","character_id":"hero","part_id":"head","path_d":"M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z","fill":"#E9D16C","stroke":"#25364A","stroke_width":7,"pivot_x":360,"pivot_y":550}],
          animation_steps: [{"target_id":"component","action":"move","from_state":"lower","to_state":"upper","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":-70,"rotation":0,"scale":1,"opacity":1}},{"target_id":"housing","action":"hold","from_state":"fixed","to_state":"fixed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}},{"target_id":"detail","action":"reveal","from_state":"hidden","to_state":"visible","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":20,"rotation":0,"scale":0.85,"opacity":0},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}}]
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

  // Animation actions must target an existing layer and use a valid time interval.
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
          background_color: "#F2EEE4", layers: [{"id":"component","description":"Componente principal","role":"subject","character_id":"hero","part_id":"torso","path_d":"M 240 420 C 260 360 460 360 480 420 L 480 760 C 460 820 260 820 240 760 Z","fill":"#E7A65A","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"housing","description":"Estructura contenedora","role":"environment","path_d":"M 150 300 L 570 300 L 570 900 L 150 900 Z","fill":"#D8E1E8","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"detail","description":"Detalle funcional","role":"detail","character_id":"hero","part_id":"head","path_d":"M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z","fill":"#E9D16C","stroke":"#25364A","stroke_width":7,"pivot_x":360,"pivot_y":550}],
          animation_steps: [{ target_id: "missing-layer", action: "move", from_state: "lower", to_state: "upper", start_progress: 0, end_progress: 1, from_transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 }, to_transform: { x: 0, y: -70, rotation: 0, scale: 1, opacity: 1 } }, { target_id: "housing", action: "hold", from_state: "fixed", to_state: "fixed", start_progress: 0, end_progress: 1, from_transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 }, to_transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } }]
        });
      }
    });
    globalThis.fetch = async url => {
      if (String(url).includes("api.groq.com")) return response({ choices: [{ message: { content: JSON.stringify({ shots }) } }] });
      if (String(url).includes("generativelanguage.googleapis.com")) return response({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shots }) }] } }] });
      throw new Error("Unexpected provider in layer target validation test: " + url);
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.diagnosticCode, "SCENE_DIRECTOR_INVALID_SHOTS");
    assert.match(res.body.error, /no apunta a una capa válida/);
  }

  // If Groq's shot plan is invalid and Gemini repair is quota-limited, report the real free-quota failure.
  {
    const story = makeValidPlan().story;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("api.groq.com")) return response({ choices: [{ message: { content: JSON.stringify({ shots: [{ scene_index: 0 }] }) } }] });
      if (String(url).includes("generativelanguage.googleapis.com")) return response({ error: { message: "Free quota exhausted during repair" } }, 429);
      throw new Error("Unexpected provider in scene repair quota test: " + url);
    };
    const res = mockResponse();
    await directScenesHandler({ method: "POST", body: { topic: "Proceso de prueba", script: "Una narración breve.", story, retention_map: [] } }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.diagnosticCode, "FREE_QUOTA_EXHAUSTED");
    assert.match(res.body.error, /No se realizará ningún cobro/);
    assert.equal(calls.length, 2, "Only Groq and the configured free Gemini repair fallback may be called");
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

  // Gemini TTS quota exhaustion must fail closed: no secondary provider is permitted.
  {
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(String(url));
      if (String(url).includes("generativelanguage.googleapis.com")) return response({ error: { message: "Free quota exhausted" } }, 429);
      throw new Error("Unexpected secondary provider request: " + url);
    };
    const res = mockResponse();
    await narrateHandler({ method: "POST", body: { text: "Esta es una prueba breve de narración gratuita.", voice: "Kore" } }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.diagnosticCode, "GEMINI_TTS_QUOTA_EXHAUSTED");
    assert.equal(calls.length, 1, "Only Gemini may be contacted for narration");
    assert.ok(calls[0].includes("generativelanguage.googleapis.com"));
    assert.ok(!calls.some(url => /ovh|riva|elevenlabs|openai|groq/i.test(url)));
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


  // Groq 429 must activate only the configured Gemini fallback; all provider calls are mocked.
  {
    const plan = makeValidPlan(), calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("api.openalex.org")) return response({ results: [] });
      if (String(url).includes("api.groq.com")) return response({ error: { message: "mock Groq quota" } }, 429);
      if (String(url).includes("generativelanguage.googleapis.com")) return response({
        candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] }, finishReason: "stop" }]
      });
      throw new Error("Unexpected provider in mocked fallback test: " + url);
    };
    const res = mockResponse();
    await generateHandler({ method: "POST", body: { topic: "Prueba de compatibilidad Groq Gemini", duration: "30–45 segundos", platform: "Reels" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.provider, /Gemini/);
    assert.equal(calls.filter(url => url.includes("api.groq.com")).length, 1);
    assert.equal(calls.filter(url => url.includes("generativelanguage.googleapis.com")).length, 1);
    assert.ok(calls.every(url => /openalex|api\.groq\.com|generativelanguage\.googleapis\.com/.test(url)));
  }

  // If both mocked providers are quota-limited, the API returns a bounded failure without a third provider.
  {
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(String(url));
      if (String(url).includes("api.openalex.org")) return response({ results: [] });
      if (String(url).includes("api.groq.com")) return response({ error: { message: "mock Groq quota" } }, 429);
      if (String(url).includes("generativelanguage.googleapis.com")) return response({ error: { message: "mock Gemini quota" } }, 429);
      throw new Error("Unexpected provider in quota fail-closed test: " + url);
    };
    const res = mockResponse();
    await generateHandler({ method: "POST", body: { topic: "Prueba de cuota simulada", duration: "30–45 segundos", platform: "Reels" } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.providerStatus, 429);
    assert.equal(calls.filter(url => url.includes("api.groq.com")).length, 1);
    assert.equal(calls.filter(url => url.includes("generativelanguage.googleapis.com")).length, 1);
    assert.ok(calls.every(url => /openalex|api\.groq\.com|generativelanguage\.googleapis\.com/.test(url)));
  }

  // Four frames over the aggregate encoded-size ceiling must be rejected before Gemini is called.
  {
    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls++; throw new Error("Provider must not be called for oversized frame batches"); };
    const res = mockResponse();
    await inspectVisualHandler({
      method: "POST",
      body: { images: Array.from({ length: 4 }, () => ({ image_base64: "A".repeat(280000) })) }
    }, res);
    assert.equal(res.statusCode, 413);
    assert.equal(providerCalls, 0);
  }

  // Visual inspection rejects more than four frames before contacting Gemini.
  {
    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls++; throw new Error("Provider must not be called for invalid frame count"); };
    const res = mockResponse();
    await inspectVisualHandler({ method: "POST", body: { images: Array.from({ length: 5 }, () => ({ image_base64: "AQID" })) } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(providerCalls, 0);
  }


  // Reference-derived style profiles are selected deterministically and remain overridable by a valid stored profile.
  {
    assert.equal(resolveVisualStyleProfile("", "Relato de un misterio histórico", "").id, "cinematic-cartoon-story");
    assert.equal(resolveVisualStyleProfile("", "Cómo configurar OBS para transmitir en vivo", "").id, "cinematic-desk-tech");
    assert.equal(resolveVisualStyleProfile("", "Los 5 mejores plugins gratuitos", "").id, "paper-craft-explainer");
    assert.equal(resolveVisualStyleProfile("", "Cómo usar una app de inteligencia artificial", "").id, "retro-mascot-ui");
    assert.equal(resolveVisualStyleProfile("cinematic-desk-tech", "Lista de plugins", "").id, "cinematic-desk-tech");
  }

  // Mixed visual profiles in one audit batch are rejected before the Gemini provider is contacted.
  {
    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls++; throw new Error("Provider must not be called for mixed styles"); };
    const res = mockResponse();
    await inspectVisualHandler({
      method: "POST",
      body: { images: [
        { image_base64: "AQID", style_profile_id: "paper-craft-explainer" },
        { image_base64: "BAUG", style_profile_id: "cinematic-cartoon-story" }
      ] }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(providerCalls, 0);
  }

  console.log("PASS: editorial generation contract, chronology validation, narration validation/PCM response, and fail-closed visual audit contracts.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
}
