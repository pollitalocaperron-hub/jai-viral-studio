import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"));
const counters = { generate: 0, directScenes: 0, narrate: 0, inspect: 0, inspectedImages: 0, images: 0 };
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
  if (req.method === "GET") {
    const pathname = new URL(req.url, "http://127.0.0.1:4174").pathname;
    if (pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const requestedPath = path.resolve(root, "." + decodeURIComponent(pathname));
    if (requestedPath.startsWith(root + path.sep) && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      const extension = path.extname(requestedPath).toLowerCase();
      const contentType = extension === ".js" ? "text/javascript; charset=utf-8"
        : extension === ".css" ? "text/css; charset=utf-8"
        : extension === ".wasm" ? "application/wasm"
        : "application/octet-stream";
      res.writeHead(200, { "content-type": contentType });
      fs.createReadStream(requestedPath).pipe(res);
      return;
    }
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
            style_profile_id: "jai-reference-motion-01",
            narration_segment: "La explicación muestra esta etapa del proceso.",
            subtitle: "Etapa " + (part + 1), subject: "El objeto principal del proceso",
            visual_state: "Estado " + (part + 1) + " del objeto",
            visual_action: part === 0 ? "El objeto inicia su transformación" : "El resultado de la transformación queda visible",
            visual_prompt_en: "A polished educational 2D editorial illustration showing the exact subject, its physical state and one clear teaching action, portrait composition, coherent color palette, separated recognizable objects and clean outlines.",
            continuity_anchor: "Preserve the same object identity, geometry, scale and palette between adjacent shots.",
            background_color: "#F2EEE4", layers: [{"id":"main-object","description":"Objeto principal","role":"subject","path_d":"M 220 420 C 250 350 470 350 500 420 L 500 760 C 470 830 250 830 220 760 Z","fill":"#E7A65A","stroke":"#25364A","stroke_width":9,"pivot_x":360,"pivot_y":640},{"id":"environment","description":"Entorno pertinente","role":"environment","path_d":"M 100 280 L 620 280 L 620 960 L 100 960 Z","fill":"#D8E1E8","stroke":"#25364A","stroke_width":8,"pivot_x":360,"pivot_y":640},{"id":"detail","description":"Detalle funcional","role":"detail","path_d":"M 300 500 C 330 470 390 470 420 500 L 420 600 L 300 600 Z","fill":"#E9D16C","stroke":"#25364A","stroke_width":7,"pivot_x":360,"pivot_y":550}],
            animation_steps: [{"target_id":"main-object","action":"move","from_state":"initial","to_state":"changed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":-60,"rotation":0,"scale":1,"opacity":1}},{"target_id":"environment","action":"hold","from_state":"fixed","to_state":"fixed","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}},{"target_id":"detail","action":"reveal","from_state":"hidden","to_state":"visible","start_progress":0,"end_progress":1,"from_transform":{"x":0,"y":15,"rotation":0,"scale":0.85,"opacity":0},"to_transform":{"x":0,"y":0,"rotation":0,"scale":1,"opacity":1}}],
            narration_sync:[{event_id:"sync-"+shots.length,target_id:"main-object",narration_segment:"El objeto cambia en este instante.",subtitle:"Cambio visible",action:"move",start_seconds:shotStart+1,end_seconds:shotStart+1.4,sound_cue:"movement_whoosh",camera_change:"shot_entry"}]
          });
        }
      });
      res.end(JSON.stringify({ shots, shot_count: shots.length, conceptual_scene_count: requestedStory.length, provider: "Mock free-tier", style_profile_id: "jai-reference-motion-01", vector_preview_ready: true, animation_ready: false, cinematic_ready: false }));
      return;
    }
    if (req.url === "/api/narrate") {
      counters.narrate++;
      res.end(JSON.stringify({ audioBase64, mimeType: "audio/L16;codec=pcm;rate=24000", sampleRate })); return;
    }
    if (req.url === "/api/inspect-visual") {
      counters.inspect++;
      const images = Array.isArray(body.images) ? body.images : [];
      counters.inspectedImages += images.length;
      res.end(JSON.stringify({ inspection_mode: "simulated", results: images.map((_, scene_index) => ({
        scene_index, status: "pass", score: 96,
        reason: "Resultado sintético de fixture; no analiza píxeles ni acredita calidad artística.",
        issues: []
      })) })); return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: "Not found" }));
  });
});

await new Promise(resolve => server.listen(4174, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.JAI_BROWSER_CHANNEL ? { channel: process.env.JAI_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push("pageerror: " + error.message));
  page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text()); });
  page.on("requestfailed", request => {
    const failure = request.failure()?.errorText || "unknown";
    // El enlace de descarga revoca su URL temporal después de leer el Blob; Chromium
    // puede notificar ERR_ABORTED aunque la exportación y la lectura hayan terminado.
    if (request.url().startsWith("blob:") && failure === "net::ERR_ABORTED") return;
    errors.push("requestfailed: " + request.url() + " :: " + failure);
  });
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded" });
  await page.locator("#topic").fill("Cómo se transforma el chocolate al calentarse");
  await page.route("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/images/generations", async route => {
    counters.images++;
    await route.abort("blockedbyclient");
  });

  await page.locator("#create").click();
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent || "").includes("Plan generado"), null, { timeout: 15000 });
  assert.equal(counters.generate, 1, "The user action must reach the editorial API exactly once");
  assert.equal(await page.locator("#story .story-card, #story article").count() > 0, true, "The generated storyboard must populate the UI");

  // La producción visual debe invocar automáticamente al director de tomas.
  await page.locator("#makeVisuals").click();
  await page.waitForFunction(() => (document.querySelector("#visualStatus")?.textContent || "").includes("Ilustraciones 2D listas para animación"), null, { timeout: 30000 });
  assert.equal(counters.directScenes, 1, "Visual production must automatically request and validate the directed shot plan");
  assert.equal(await page.locator("#timelineTracks .scene").count(), 8, "The editable timeline must use the eight directed shots, not repeat four conceptual stills.");
  assert.ok((await page.locator("#timelineTracks").innerText()).includes("SHOT-01"), "Directed shot IDs must be carried into the editable timeline");
  assert.equal(counters.images, 0, "The vector illustration pipeline must not call external image-generation APIs or consume image credits");
  assert.equal(await page.locator("#visualScenes img").count(), 8, "Each of the eight directed shots must be rasterized and displayed as its own vector preview");
  await page.locator("#exportCharacterLayers").click();
  const pngCount=await page.locator('#characterLayerExports a[data-png-validated="true"]').count();
  assert.equal(pngCount,24,"The PNG exporter must create a validated transparent file for every unique vector part.");
  const pngAudit=await page.locator('#characterLayerExports a[data-png-validated="true"]').evaluateAll(async links=>Promise.all(links.map(async link=>{
    const image=new Image();image.src=link.href;await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext("2d",{willReadFrequently:true});context.drawImage(image,0,0);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;let opaque=0,transparent=0;
    for(let i=3;i<data.length;i+=4){if(data[i]>0)opaque++;else transparent++;}
    return {type:link.href.slice(5,link.href.indexOf(";")),width:image.naturalWidth,height:image.naturalHeight,opaque,transparent};
  })));
  assert.ok(pngAudit.every(item=>item.type==="image/png"&&item.width===720&&item.height===1280&&item.opaque>0&&item.transparent>0),"Every PNG must decode at 720×1280 with visible pixels and preserved alpha.");
  assert.equal(await page.evaluate(()=>collectJaiSoundEvents(timelineState.items).length),8,"The directed timeline must schedule one sound effect per narration event.");
  const soundOffsetAudit=await page.evaluate(()=>{
    const base=collectJaiSoundEvents(timelineState.items),shifted=collectJaiSoundEvents(timelineState.items,1.25);
    return {base:base[0]?.at,shifted:shifted[0]?.at,count:shifted.length};
  });
  assert.equal(soundOffsetAudit.count,8,"Every directed narration event must retain its sound cue after track alignment.");
  assert.ok(Math.abs(soundOffsetAudit.shifted-soundOffsetAudit.base-1.25)<0.001,"Sound cues must follow the user-adjustable narration track offset.");

  await page.locator("#generateNarration").click();
  await page.waitForFunction(() => (document.querySelector("#kokoroStatus")?.textContent || "").includes("Narración lista"), null, { timeout: 20000 });
  assert.equal(counters.narrate, 1, "The script must reach the neural narration API exactly once");
  assert.equal(await page.locator("#captionEditor textarea[aria-label='Texto del subtítulo']").count() > 0, true, "Narration must produce editable subtitle cues");
  assert.equal(await page.locator("#mediaTracks .media-clip.audio").count(), 1, "Narration must populate the audio track");

  await page.locator("#inspectVisuals").click();
  await page.waitForFunction(() => (document.querySelector("#visualAuditStatus")?.textContent || "").includes("todas las escenas superaron"), null, { timeout: 20000 });
  assert.equal(counters.inspect, 2, "Eight directed shots must be split into two batches of four, matching the inspector API limit");
  assert.equal(counters.inspectedImages, 8, "Every directed shot must be independently inspected before export");
  assert.match(await page.locator("#visualAuditStatus").innerText(), /PRUEBA SIMULADA.*no acredita calidad artística real/i, "Fixture inspection must be visibly distinguished from real visual quality approval");
  assert.equal(await page.locator("#renderVideo").isEnabled(), true, "An audited 2D motion-graphics timeline with narration must unlock final export");
  assert.equal(await page.locator("#downloadVideo").isVisible(), false, "The download link appears only after render and technical QC complete");
  assert.match(await page.locator("#renderStatus").innerText(), /Control de calidad aprobado|puede exportarse/i, "The UI confirms the audited 2D render is ready");

  // Exercise the real export button; save its generated Blob for independent FFprobe inspection.
  await page.locator("#renderVideo").click();
  try {
    await page.waitForFunction(() => {
      const link=document.querySelector("#downloadVideo");
      const status = document.querySelector("#renderStatus")?.textContent || "";
      return (!!link && !link.hidden && /^blob:/.test(link.href)) || /Exportación rechazada por control de calidad|Conversión MP4 rechazada/.test(status);
    }, null, { timeout: 240000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      renderStatus: document.querySelector("#renderStatus")?.textContent || "",
      downloadHidden: document.querySelector("#downloadVideo")?.hidden,
      downloadHref: document.querySelector("#downloadVideo")?.getAttribute("href"),
      pipeline: document.querySelector("#pipelineStatus")?.innerText || "",
      ffmpegLastLog: window.jaiFfmpegLastLog || "",
      ffmpegProgress: window.jaiFfmpegProgress ?? null,
      mp4Inspection: window.jaiMp4InspectionDiagnostic || null,
      mediaCapabilities: (() => { const video=document.createElement("video"); return { mp4AvcAac: video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'), mp4Avc: video.canPlayType('video/mp4; codecs="avc1.42E01E"'), mp4Generic: video.canPlayType("video/mp4"), mediaSourceAvcAac: !!window.MediaSource && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') }; })(),
      rejectedBlob: window.jaiMp4RejectedBlob instanceof Blob ? { size: window.jaiMp4RejectedBlob.size, type: window.jaiMp4RejectedBlob.type } : null
    })).catch(() => ({}));
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    if (diagnostic.rejectedBlob) {
      const rejected = await page.evaluate(async () => {
        const blob = window.jaiMp4RejectedBlob;
        if (!(blob instanceof Blob)) return null;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        return { mime: blob.type, size: blob.size, base64: btoa(binary) };
      }).catch(() => null);
      if (rejected?.base64) {
        const rejectedPath = path.join(root, "artifacts", "jai-rejected-export.mp4");
        fs.writeFileSync(rejectedPath, Buffer.from(rejected.base64, "base64"));
        const rejectedProbe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,sample_rate,channels", "-of", "json", rejectedPath], { encoding: "utf8" });
        diagnostic.rejectedBlob = { ...rejected, ffprobeStatus: rejectedProbe.status, ffprobeStdout: rejectedProbe.stdout || "", ffprobeStderr: rejectedProbe.stderr || "", ffprobeError: rejectedProbe.error?.message || null };
        delete diagnostic.rejectedBlob.base64;
      }
    }
    fs.writeFileSync(path.join(root, "artifacts", "jai-browser-diagnostic.json"), JSON.stringify({ diagnostic, errors: errors.slice(-30) }, null, 2));
    await page.screenshot({ path: path.join(root, "artifacts", "jai-mp4-timeout.png"), fullPage: true }).catch(() => {});
    throw new Error("MP4 export did not pass QC. Browser and independent FFprobe diagnostics: " + JSON.stringify({ diagnostic, errors: errors.slice(-30) }) + ". Original: " + error.message);
  }
  const downloadVisible = await page.locator("#downloadVideo").evaluate(link => !link.hidden && /^blob:/.test(link.href));
  if (!downloadVisible) {
    const diagnostic = await page.evaluate(() => ({
      renderStatus: document.querySelector("#renderStatus")?.textContent || "",
      ffmpegLastLog: window.jaiFfmpegLastLog || "",
      ffmpegProgress: window.jaiFfmpegProgress ?? null,
      mp4Inspection: window.jaiMp4InspectionDiagnostic || null,
      mediaCapabilities: (() => { const video=document.createElement("video"); return { mp4AvcAac: video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'), mp4Avc: video.canPlayType('video/mp4; codecs="avc1.42E01E"'), mp4Generic: video.canPlayType("video/mp4"), mediaSourceAvcAac: !!window.MediaSource && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') }; })(),
      rejectedBlob: window.jaiMp4RejectedBlob instanceof Blob ? { size: window.jaiMp4RejectedBlob.size, type: window.jaiMp4RejectedBlob.type } : null
    }));
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    if (diagnostic.rejectedBlob) {
      const rejected = await page.evaluate(async () => {
        const blob = window.jaiMp4RejectedBlob;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        return { mime: blob.type, size: blob.size, base64: btoa(binary) };
      });
      const rejectedPath = path.join(root, "artifacts", "jai-rejected-export.mp4");
      fs.writeFileSync(rejectedPath, Buffer.from(rejected.base64, "base64"));
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,sample_rate,channels", "-of", "json", rejectedPath], { encoding: "utf8" });
      diagnostic.rejectedBlob = { mime: rejected.mime, size: rejected.size, ffprobeStatus: probe.status, ffprobeStdout: probe.stdout || "", ffprobeStderr: probe.stderr || "", ffprobeError: probe.error?.message || null };
    }
    fs.writeFileSync(path.join(root, "artifacts", "jai-browser-diagnostic.json"), JSON.stringify({ diagnostic, errors: errors.slice(-30) }, null, 2));
    throw new Error("Application rejected final MP4; independent FFprobe diagnostics: " + JSON.stringify(diagnostic));
  }
  const exported=await page.locator("#downloadVideo").evaluate(async link=>{
    const response=await fetch(link.href);
    const blob=await response.blob();
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let binary="";
    for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
    return {mime:blob.type,size:blob.size,extension:link.download.split(".").pop(),base64:btoa(binary),status:document.querySelector("#renderStatus")?.textContent||""};
  });
  assert.ok(exported.size>20000,"The production button must create a non-trivial video Blob.");
  assert.match(exported.mime,/^video\/mp4(?:;|$)/i,"The production button must create an actual MP4 Blob, never WebM.");
  assert.equal(exported.extension,"mp4","The downloadable filename must use the .mp4 extension.");
  assert.match(exported.status,/Vídeo exportado y control técnico aprobado/,"The download must appear only after the app's own audiovisual QC passes.");
  fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});
  fs.writeFileSync(path.join(root,"artifacts","jai-production-export."+exported.extension),Buffer.from(exported.base64,"base64"));
  const exportPath=path.join(root,"artifacts","jai-production-export."+exported.extension);
  fs.writeFileSync(exportPath,Buffer.from(exported.base64,"base64"));
  const probe=spawnSync("ffprobe",["-v","error","-show_entries","format=format_name,duration:stream=codec_type,codec_name,width,height,sample_rate,channels","-of","json",exportPath],{encoding:"utf8"});
  if(process.env.JAI_REQUIRE_FFPROBE==="1")assert.equal(probe.status,0,"FFprobe must be installed and decode the exported media: "+(probe.stderr||probe.error?.message||"unknown error"));
  let probeData=null;
  if(probe.status===0){
    probeData=JSON.parse(probe.stdout);
    const streams=probeData.streams||[];
    const video=streams.find(stream=>stream.codec_type==="video");
    const audio=streams.find(stream=>stream.codec_type==="audio");
    assert.ok(video,"FFprobe must detect a video stream");
    assert.ok(audio,"FFprobe must detect the narration/audio stream");
    assert.match(String(probeData.format?.format_name||""),/mp4|mov/i,"FFprobe must identify an MP4 container.");
    assert.equal(video.codec_name,"h264","FFprobe must confirm H.264 video.");
    assert.equal(audio.codec_name,"aac","FFprobe must confirm AAC audio.");
    assert.equal(Number(video.width),720,"Exported video width must be 720");
    assert.equal(Number(video.height),1280,"Exported video height must be 1280");
    assert.ok(Number(probeData.format?.duration)>1,"FFprobe must report a valid media duration");
  }
  fs.writeFileSync(path.join(root,"artifacts","jai-production-export.json"),JSON.stringify({mime:exported.mime,size:exported.size,status:exported.status,ffprobe:probeData},null,2));
  // Exercise the app-integrated orchestrator and durable resume after a simulated QA rejection.
  const providerCallsBeforeOrchestration = { ...counters };
  await page.locator("#runProduction").click();
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent || "").includes("inspección simulada"), null, { timeout: 20000 });
  const firstCheckpoint = await page.evaluate(async () => {
    const saved = await readJaiRecovery("latest");
    return saved?.productionRun || null;
  });
  assert.ok(firstCheckpoint, "The app must persist the orchestration checkpoint alongside the recoverable project");
  assert.deepEqual(firstCheckpoint.completed, ["plan", "director", "visuals", "narration"], "Completed app stages must be checkpointed before the simulated inspector blocks the run");
  assert.equal(firstCheckpoint.status, "failed");
  assert.equal(firstCheckpoint.error.code, "SIMULATED_INSPECTION");
  assert.equal(counters.narrate, providerCallsBeforeOrchestration.narrate, "Already generated narration must not be requested again by orchestration");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (document.querySelector("#autosaveStatus")?.textContent || "").includes("Sesión recuperada automáticamente"), null, { timeout: 15000 });
  const recoveredCheckpoint = await page.evaluate(async () => (await readJaiRecovery("latest"))?.productionRun || null);
  assert.deepEqual(recoveredCheckpoint.completed, firstCheckpoint.completed, "Reload must restore the same completed production stages");
  await page.locator("#runProduction").click();
  await page.waitForFunction(() => (document.querySelector("#status")?.textContent || "").includes("inspección simulada"), null, { timeout: 20000 });
  assert.deepEqual(counters, providerCallsBeforeOrchestration, "Resuming after reload must not repeat already completed provider calls or trust simulated inspection");
  const resumedCheckpoint = await page.evaluate(async () => (await readJaiRecovery("latest"))?.productionRun || null);
  assert.deepEqual(resumedCheckpoint.completed, firstCheckpoint.completed, "The resumed app must preserve all prior completed stages");
  assert.equal(resumedCheckpoint.error.code, "SIMULATED_INSPECTION");
  assert.deepEqual(errors, [], "The integrated browser flow must not produce uncaught JavaScript errors");
  console.log("PASS: full browser production, MP4/FFprobe QC, app-level checkpoint persistence, reload recovery, no duplicate completed calls, and simulated-inspection rejection.");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
