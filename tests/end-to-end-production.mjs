import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"));
const counters = { generate: 0, directScenes: 0, narrate: 0, inspect: 0, images: 0 };
const sceneTimes = Array.from({ length: 4 }, (_, i) => {
  const start = i * 9, end = start + 9;
  return "0:" + String(start).padStart(2, "0") + " - 0:" + String(end).padStart(2, "0");
});
const story = sceneTimes.map((time, index) => ({
  time, objective: "Explicar la etapa " + (index + 1),
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
}));
const retention_map = Array.from({ length: 12 }, (_, index) => {
  const start = index * 3, end = start + 3;
  return {
    time: "0:" + String(start).padStart(2, "0") + " - 0:" + String(end).padStart(2, "0"),
    new_stimulus: "Estímulo " + (index + 1),
    narrative_advance: "Avance " + (index + 1),
    curiosity: "Qué ocurrirá en el siguiente paso",
    visual_action: "Mostrar el cambio de la etapa",
    on_screen_text: "Paso " + (index + 1)
  };
});
const plan = {
  clarification_required: false, clarification_question: null,
  category: "Educación", angle: "Explicación por etapas",
  hook: "Observa cómo cambia el proceso",
  script: Array.from({ length: 84 }, () => "palabra").join(" "),
  research_brief: ["Resumen de investigación simulado para la prueba de integración."],
  research_sources: [], causal_chain: ["Inicio", "Transformación", "Resultado"],
  concept_explanations: [], fact_audit: [], story, retention_map,
  editorial_warnings: [], verification: "Contrato simulado", quality_check: "Contrato simulado",
  duration_validation: {
    script_word_count: 84, estimated_narration_seconds: 36, storyboard_seconds: 36,
    scene_count: 4, scene_coverage_valid: true, retention_blocks: 12,
    retention_map_valid: true, narration_within_tolerance: true,
    word_count_within_target: true, within_tolerance: true,
    status: "duración coherente", warning: ""
  }
};
const sampleRate = 24000, seconds = 36, pcm = Buffer.alloc(sampleRate * seconds * 2);
for (let i = 0; i < sampleRate * seconds; i++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / sampleRate) * 1600), i * 2);
const audioBase64 = pcm.toString("base64");

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); return;
  }
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/generate") {
      counters.generate++;
      res.end(JSON.stringify(plan)); return;
    }
    if (req.url === "/api/direct-scenes") {
      counters.directScenes++;
      const requestedStory = Array.isArray(body.story) ? body.story : story;
      const shots = [];
      requestedStory.forEach((scene, sceneIndex) => {
        const match = String(scene.time || "").match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
        const start = match ? Number(match[1]) * 60 + Number(match[2]) : sceneIndex * 9;
        const end = match ? Number(match[3]) * 60 + Number(match[4]) : start + 9;
        const midpoint = (start + end) / 2;
        for (let part = 0; part < 2; part++) {
          const shotStart = part === 0 ? start : midpoint;
          const shotEnd = part === 0 ? midpoint : end;
          shots.push({
            scene_index: sceneIndex, start_seconds: shotStart, end_seconds: shotEnd,
            shot_id: "shot-" + String(shots.length + 1).padStart(2, "0"),
            narration_segment: "La explicación muestra esta etapa del proceso.",
            subtitle: "Etapa " + (part + 1), subject: "El objeto principal del proceso",
            visual_state: "Estado " + (part + 1) + " del objeto",
            visual_action: part === 0 ? "El objeto inicia su transformación" : "El resultado de la transformación queda visible",
            visual_prompt_en: "A polished educational 2D editorial illustration showing the exact subject, its physical state and one clear teaching action, portrait composition, coherent color palette, separated recognizable objects and clean outlines.",
            continuity_anchor: "Preserve the same object identity, geometry, scale and palette between adjacent shots.",
            background_color: "#F2EEE4", layers: [{"id":"main-object","description":"Objeto principal","role":"subject","path_d":"M 220 420 C 250 350 470 350 500 420 L 500 760 C 470 830 250 830 220 760 Z","fill":"#E7A65A","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"environment","description":"Entorno pertinente","role":"environment","path_d":"M 100 280 L 620 280 L 620 960 L 100 960 Z","fill":"#D8E1E8","stroke":"#25364A","stroke_width":8,"pivot_x":360,"pivot_y":640},{"id":"detail","description":"Detalle funcional","role":"detail","path_d":"M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z","fill":"#E9D16C","stroke":"#25364A","stroke_width":7,"pivot_x":360,"pivot_y":550}],
            animation_steps: [{"target_id":"main-object","action":"move","from_state":"initial","to_state":"changed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":-60,"rotation":0,"scale":1,"opacity":1}},{"target_id":"environment","action":"hold","from_state":"fixed","to_state":"fixed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}},{"target_id":"detail","action":"reveal","from_state":"hidden","to_state":"visible","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":15,"rotation":0,"scale":0.85,"opacity":0},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}}]
          });
        }
      });
      res.end(JSON.stringify({ shots, shot_count: shots.length, conceptual_scene_count: requestedStory.length, provider: "Mock free-tier", animation_ready: true }));
      return;
    }
    if (req.url === "/api/narrate") {
      counters.narrate++;
      res.end(JSON.stringify({ audioBase64, mimeType: "audio/L16;codec=pcm;rate=24000", sampleRate })); return;
    }
    if (req.url === "/api/inspect-visual") {
      counters.inspect++;
      const images = Array.isArray(body.images) ? body.images : [];
      res.end(JSON.stringify({ results: images.map((_, scene_index) => ({
        scene_index, status: "pass", score: 96,
        reason: "El fotograma representa el sujeto y la acción solicitados.",
        issues: []
      })) })); return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: "Not found" }));
  });
});

await new Promise(resolve => server.listen(4174, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded" });
  await page.locator("#topic").fill("Cómo se transforma el chocolate al calentarse");
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date);
    window.__jaiRealNow = realNow;
    window.__jaiImageClockOffset = 0;
    Date.now = () => realNow() + window.__jaiImageClockOffset;
  });
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 640;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 640, 640);
    gradient.addColorStop(0, "#12304a"); gradient.addColorStop(.5, "#d18a36"); gradient.addColorStop(1, "#2879a0");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 640, 640);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = "hsl(" + (i * 43) + ",75%,55%)"; ctx.beginPath(); ctx.arc(80 + i * 65, 320, 24 + i * 3, 0, Math.PI * 2); ctx.fill(); }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.route("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/images/generations", async route => {
    const request = route.request();
    const corsHeaders = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4174",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    counters.images++;
    await page.evaluate(() => { window.__jaiImageClockOffset += 36000; });
    await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders, body: JSON.stringify({ data: [{ b64_json: pngBase64 }] }) });
  });

  await page.locator("#create").click();
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent || "").includes("Plan generado"), null, { timeout: 15000 });
  assert.equal(counters.generate, 1, "The user action must reach the editorial API exactly once");
  assert.equal(await page.locator("#story .story-card, #story article").count() > 0, true, "The generated storyboard must populate the UI");

  // La producción visual debe invocar automáticamente al director de tomas.
  await page.locator("#makeVisuals").click();
  await page.waitForFunction(() => (document.querySelector("#visualStatus")?.textContent || "").includes("Producción visual lista"), null, { timeout: 30000 });
  assert.equal(counters.directScenes, 1, "Visual production must automatically request and validate the directed shot plan");
  assert.equal(await page.locator("#timelineTracks .scene").count(), 8, "The editable timeline must use the eight directed shots, not repeat four conceptual stills.");
  assert.ok((await page.locator("#timelineTracks").innerText()).includes("SHOT-01"), "Directed shot IDs must be carried into the editable timeline");
  assert.equal(counters.images, 4, "The visual director must request one unique image for every conceptual scene");
  assert.equal(await page.locator("#visualScenes img").count(), 4, "All generated image frames must be decoded and displayed");
  await page.evaluate(() => { if (window.__jaiRealNow) Date.now = window.__jaiRealNow; });

  await page.locator("#generateNarration").click();
  await page.waitForFunction(() => (document.querySelector("#kokoroStatus")?.textContent || "").includes("Narración lista"), null, { timeout: 20000 });
  assert.equal(counters.narrate, 1, "The script must reach the neural narration API exactly once");
  assert.equal(await page.locator("#captionEditor textarea[aria-label='Texto del subtítulo']").count() > 0, true, "Narration must produce editable subtitle cues");
  assert.equal(await page.locator("#mediaTracks .media-clip.audio").count(), 1, "Narration must populate the audio track");

  await page.locator("#inspectVisuals").click();
  await page.waitForFunction(() => (document.querySelector("#visualAuditStatus")?.textContent || "").includes("todas las escenas superaron"), null, { timeout: 20000 });
  assert.equal(counters.inspect, 1, "All scene images must reach the independent visual audit API");
  assert.equal(await page.locator("#renderVideo").isEnabled(), true, "Only the complete plan, image set, narration, and approved audit may unlock export");

  await page.locator("#renderVideo").click();
  await page.waitForFunction(() => (document.querySelector("#renderStatus")?.textContent || "").includes("Vídeo renderizado correctamente"), null, { timeout: 60000 });
  assert.equal(await page.locator("#downloadVideo").isVisible(), true, "The integrated production must expose its finished video file");
  const exported = await page.evaluate(async () => {
    const link = document.querySelector("#downloadVideo");
    const video = document.createElement("video"); video.preload = "auto"; video.muted = true; video.src = link.href;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("The end-to-end export could not be decoded"));
      setTimeout(() => reject(new Error("Timed out reading end-to-end video metadata")), 10000);
    });
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, size: (await fetch(link.href).then(r => r.blob())).size };
  });
  assert.equal(exported.width, 720);
  assert.equal(exported.height, 1280);
  assert.ok(exported.duration >= 35 && exported.duration <= 38, "The final export must preserve the 36-second storyboard duration");
  assert.ok(exported.size > 100000, "The final export must contain a substantial encoded video and audio payload");
  assert.deepEqual(errors, [], "The integrated browser flow must not produce uncaught JavaScript errors");
  console.log("PASS: full browser production flow from editorial API through four generated frames, neural narration, visual audit, captions, and decoded 9:16 video export.");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
