import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"));
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
  await page.locator("#topic").waitFor();
  assert.equal(await page.locator("#topic").inputValue(), "", "New sessions must start with an empty topic");
  assert.match(await page.locator("#projects").innerText(), /Todavía no hay proyectos guardados/);

  const result = await page.evaluate(async () => {
    const key = "browser-test:roundtrip";
    const audio = new Blob([new Uint8Array([0, 1, 2, 253, 254, 255])], { type: "audio/wav" });
    const snapshot = {
      savedAt: 1730000000000,
      topic: "Persistencia J.A.I.",
      data: { script: "Prueba de recuperación", story: [{ scene_index: 0 }] },
      images: [{ src: "data:image/png;base64,AA==", sceneIndex: 0 }],
      timeline: [{ id: "scene-1", duration: 4.2 }],
      audio,
      audioDuration: 4.2,
      audioSampleRate: 24000,
      captions: [{ start: 0, end: 1, text: "Hola" }]
    };
    await writeJaiRecoveryKey(key, snapshot);
    const restored = await readJaiRecovery(key);
    const audioBytes = [...new Uint8Array(await restored.audio.arrayBuffer())];
    await deleteJaiRecoveryKey(key);
    const deleted = await readJaiRecovery(key);
    return {
      topic: restored.topic,
      sceneCount: restored.data.story.length,
      imageIndex: restored.images[0].sceneIndex,
      timelineDuration: restored.timeline[0].duration,
      audioType: restored.audio.type,
      audioBytes,
      caption: restored.captions[0].text,
      deleted: deleted === null
    };
  });

  assert.deepEqual(result, {
    topic: "Persistencia J.A.I.",
    sceneCount: 1,
    imageIndex: 0,
    timelineDuration: 4.2,
    audioType: "audio/wav",
    audioBytes: [0, 1, 2, 253, 254, 255],
    caption: "Hola",
    deleted: true
  });
  const sceneTimes = ["00:00 - 00:03", "00:03 - 00:06", "00:06 - 00:09", "00:09 - 00:12"];
  const story = sceneTimes.map((time, index) => ({
    scene_index: index,
    time,
    objective: "Explicar el paso " + (index + 1),
    on_screen_text: "Paso " + (index + 1),
    teaching_point: "La idea central de esta escena se demuestra con una relación observable.",
    visual_proof: "La evidencia visual muestra el cambio correspondiente al paso " + (index + 1) + ".",
    visual_subject: "Un modelo científico claramente identificable",
    visual_state: "Estado inicial y resultado distinguibles",
    visual_action: "El modelo cambia de forma progresiva y verificable",
    visual_composition: "Composición vertical centrada con jerarquía visual clara",
    visual_environment: "Entorno de laboratorio limpio y coherente",
    visual_prompt_en: "A highly detailed educational scientific visualization with a clearly identifiable subject, realistic materials, coherent lighting, precise composition, meaningful environmental context, accurate proportions, clean background, strong visual hierarchy, and a single observable transformation that communicates the teaching point without decorative clutter.",
    visual_medium: "Ilustración científica realista",
    animation_type: "Transformación progresiva",
    continuity_anchor: "Mantener el mismo sujeto, escala y paleta visual entre escenas",
    motion_sequence: ["Acercamiento lento al sujeto", "Mostrar el cambio y mantener el resultado"]
  }));
  const retentionMap = sceneTimes.map((time, index) => ({
    time,
    new_stimulus: "Nuevo estímulo " + (index + 1),
    narrative_advance: "Avance narrativo " + (index + 1),
    curiosity: "Pregunta que impulsa el siguiente paso",
    visual_action: "Acción visual " + (index + 1),
    on_screen_text: "Paso " + (index + 1)
  }));
  const uiProject = {
    id: "browser-test:ui",
    snapshotKey: "project:browser-test:ui",
    topic: "Proyecto recuperado desde interfaz",
    date: "Prueba automatizada",
    savedAt: 1730000000000,
    notes: "Notas de prueba",
    plan: JSON.stringify({ script: "Guion persistido" }),
    data: {
      category: "Educación",
      angle: "Comprobación de recuperación",
      research_brief: "Resumen persistido",
      causal_chain: "Paso uno → paso dos",
      concept_explanations: "Conceptos guardados",
      fact_audit: "Auditoría pendiente",
      hook: "Hook recuperado",
      script: "Guion persistido",
      story,
      retention_map: retentionMap,
      duration_validation: { within_tolerance: true },
      editorial_warnings: [],
      verification: "Verificación guardada",
      quality_check: "Calidad guardada"
    }
  };
  await page.evaluate(async (project) => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=";
    await writeJaiRecoveryKey(project.snapshotKey, {
      savedAt: project.savedAt,
      topic: project.topic,
      notes: project.notes,
      plan: project.plan,
      data: project.data,
      retentionMap: project.data.retention_map,
      images: project.data.story.map((scene, sceneIndex) => ({ src: png, sceneIndex, shot: sceneIndex, time: scene.time })),
      audit: project.data.story.map((scene, scene_index) => ({ scene_index, status: "pass", score: 92, explanation: "La imagen corresponde a la escena y explica el concepto.", issues: [] })),
      timeline: project.data.story.map((scene, index) => ({ id: "scene-" + (index + 1), sceneIndex: index, scene_index: index, visualIndex: index, time: scene.time, on_screen_text: scene.on_screen_text, seconds: 3, transition: "fade" })),
      audio: new Blob([new Uint8Array([10, 20, 30, 40])], { type: "audio/wav" }),
      audioDuration: 12,
      audioSampleRate: 24000,
      audioEdit: { trimStart: 0, trimEnd: 12, gain: 1 },
      captions: [{ start: 0, end: 1, text: "Subtítulo restaurado" }]
    });
    localStorage.setItem("jaiProjects", JSON.stringify([project]));
  }, uiProject);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Cargar" }).click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("Proyecto restaurado con"), null, { timeout: 10000 });
  assert.equal(await page.locator("#topic").inputValue(), uiProject.topic);
  assert.equal(await page.locator("#script").innerText(), "Guion persistido");
  assert.equal(await page.locator("#kokoroAudio").isVisible(), true);
  assert.equal(await page.locator('#captionEditor textarea[aria-label="Texto del subtítulo"]').inputValue(), "Subtítulo restaurado", "Recovered subtitle text must be restored into its editable control");
  assert.equal(await page.locator("#timelineTracks .scene").count(), 4, "All four restored storyboard scenes must populate the timeline");
  assert.equal(await page.locator("#mediaTracks .media-track").count(), 3, "Video, narration, and subtitle tracks must be restored");
  assert.equal(await page.locator("#mediaTracks .media-clip.audio").count(), 1, "Narration must appear as an audio clip");
  assert.equal(await page.locator("#mediaTracks .media-clip.subtitle").count(), 1, "Recovered captions must appear on the subtitle track");
  const transitionControl = page.locator('#timelineTracks select[aria-label="Transición del bloque 1"]');
  await transitionControl.selectOption("wipe");
  assert.equal(await transitionControl.inputValue(), "wipe", "A recovered scene transition must remain editable");
  await page.getByRole("button", { name: "Mover bloque 1 después" }).click();
  assert.equal(await page.locator("#timelineTracks .scene p").first().innerText(), "Paso 2", "Reordering must move the complete scene block, not just its label");
  const durationControl = page.locator('#timelineTracks select[aria-label="Duración del bloque 1"]');
  await durationControl.selectOption("4");
  assert.equal(await durationControl.inputValue(), "4", "Timeline duration must remain editable after recovery");
  assert.match(await page.locator("#timelineTracks .scene h4").first().innerText(), /00:00 - 00:04/, "Changing duration must recalculate subsequent timeline timecodes");
  const trimStart = page.locator("#audioTrimStart");
  const trimEnd = page.locator("#audioTrimEnd");
  await trimStart.fill("1");
  await trimStart.dispatchEvent("change");
  await trimEnd.fill("11");
  await trimEnd.dispatchEvent("change");
  assert.equal(await trimStart.inputValue(), "1.0", "Narration trim-in must be editable after recovery");
  assert.equal(await trimEnd.inputValue(), "11.0", "Narration trim-out must be editable after recovery");
  await page.locator("#audioGain").fill("125");
  assert.equal(await page.locator("#audioGainValue").innerText(), "125%", "Narration gain must update the displayed track level");
  await page.locator("#audioTrackOffset").fill("1.5");
  await page.locator("#audioTrackOffset").dispatchEvent("change");
  assert.equal(await page.locator("#audioTrackOffset").inputValue(), "1.5", "Narration offset must remain editable after recovery");
  await page.locator("#subtitleTrackOffset").fill("0.5");
  await page.locator("#subtitleTrackOffset").dispatchEvent("change");
  assert.equal(await page.locator("#subtitleTrackOffset").inputValue(), "0.5", "Subtitle offset must remain editable after recovery");
  assert.equal(await page.locator("#mediaTracks .media-clip.audio").count(), 1, "The edited narration must remain on its own track");
  assert.equal(await page.locator("#mediaTracks .media-clip.subtitle").count(), 1, "The edited subtitle cue must remain on its own track");
  assert.deepEqual(pageErrors, [], "The application must not throw uncaught browser errors during recovery, timeline editing, or audio synchronization");
  console.log("PASS: blank startup, IndexedDB recovery, full project/media restoration, timeline reorder/duration/transitions, narration trim/gain/offset, subtitle offset, and synchronized media tracks.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
