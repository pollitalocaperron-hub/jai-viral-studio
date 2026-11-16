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
    const makeFrame = (index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 640;
      const context = canvas.getContext("2d");
      const gradient = context.createLinearGradient(0, 0, 640, 640);
      gradient.addColorStop(0, ["#12304a", "#244a36", "#4a2c55", "#59432b"][index]);
      gradient.addColorStop(1, ["#2879a0", "#77a95c", "#9a5c91", "#b98b49"][index]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 640, 640);
      context.fillStyle = "rgba(255,255,255,.85)";
      context.beginPath();
      context.arc(320, 300, 110 + index * 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(5,15,28,.7)";
      context.fillRect(80, 490, 480, 70);
      return canvas.toDataURL("image/png");
    };
    const makeWav = (seconds, sampleRate) => {
      const sampleCount = seconds * sampleRate;
      const buffer = new ArrayBuffer(44 + sampleCount * 2);
      const view = new DataView(buffer);
      const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      write(0, "RIFF"); view.setUint32(4, 36 + sampleCount * 2, true); write(8, "WAVE");
      write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, sampleCount * 2, true);
      for (let i = 0; i < sampleCount; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 220 * i / sampleRate) * 1800), true);
      return new Blob([buffer], { type: "audio/wav" });
    };
    await writeJaiRecoveryKey(project.snapshotKey, {
      savedAt: project.savedAt,
      topic: project.topic,
      notes: project.notes,
      plan: project.plan,
      data: project.data,
      retentionMap: project.data.retention_map,
      images: project.data.story.map((scene, sceneIndex) => ({ src: makeFrame(sceneIndex), sceneIndex, shot: sceneIndex, time: scene.time })),
      audit: project.data.story.map((scene, scene_index) => ({ scene_index, status: "pass", score: 92, explanation: "La imagen corresponde a la escena y explica el concepto.", issues: [] })),
      timeline: project.data.story.map((scene, index) => ({ id: "scene-" + (index + 1), sceneIndex: index, scene_index: index, visualIndex: index, time: scene.time, on_screen_text: scene.on_screen_text, seconds: 3, transition: "fade" })),
      audio: makeWav(12, 24000),
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
  await durationControl.selectOption("1");
  assert.equal(await durationControl.inputValue(), "1", "Timeline duration must remain editable after recovery");
  assert.match(await page.locator("#timelineTracks .scene h4").first().innerText(), /0:00 - 0:01/, "Changing duration must recalculate subsequent timeline timecodes");
  const initialAudioClip = page.locator("#mediaTracks .media-clip.audio");
  assert.equal(await initialAudioClip.count(), 1);
  assert.ok(parseFloat(await initialAudioClip.evaluate(node => node.style.width)) > 99, "The audio clip must occupy the full visual timeline after time-stretching, not use its unadjusted source duration");
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
  const subtitlePixelDifference = await page.evaluate(() => {
    const item = timelineState.items[0];
    const sceneIndex = Number.isInteger(item.sceneIndex) ? item.sceneIndex : 0;
    drawVideoScene(item, sceneIndex, 0.5, 1.0);
    const active = renderCtx.getImageData(220, 950, 280, 150).data;
    drawVideoScene(item, sceneIndex, 0.5, 1.6);
    const inactive = renderCtx.getImageData(220, 950, 280, 150).data;
    let difference = 0;
    for (let i = 0; i < active.length; i += 4) {
      difference += Math.abs(active[i] - inactive[i]) + Math.abs(active[i + 1] - inactive[i + 1]) + Math.abs(active[i + 2] - inactive[i + 2]);
    }
    return difference;
  });
  assert.ok(subtitlePixelDifference > 100000, "Subtitle offset must place the caption visibly at the correct audio-relative moment in the rendered frame");
  assert.equal(await page.locator("#mediaTracks .media-clip.audio").count(), 1, "The edited narration must remain on its own track");
  assert.equal(await page.locator("#mediaTracks .media-clip.subtitle").count(), 1, "The edited subtitle cue must remain on its own track");
  const renderButton = page.locator("#renderVideo");
  assert.equal(await renderButton.isEnabled(), true, "A complete, audited project with valid images and decodable narration must unlock export");
  await renderButton.click();
  assert.equal(await durationControl.isDisabled(), true, "Timeline edits must be locked while a render is in progress");
  assert.equal(await page.locator("#audioGain").isDisabled(), true, "Narration edits must be locked while a render is in progress");
  assert.equal(await page.locator('#captionEditor textarea[aria-label="Texto del subtítulo"]').isDisabled(), true, "Subtitle edits must be locked while a render is in progress");
  assert.equal(await page.locator("#makeVisuals").isDisabled(), true, "Visual regeneration must be locked while a render is in progress");
  assert.equal(await page.locator("#cancelRender").isEnabled(), true, "The user must retain the ability to cancel a render");
  await page.waitForFunction(() => {
    const status = document.querySelector("#renderStatus")?.textContent || "";
    return status.includes("Vídeo renderizado correctamente") || status.startsWith("Falló") || status.includes("Error:") || status.includes("Render bloqueado");
  }, null, { timeout: 45000 });
  const renderStatus = await page.locator("#renderStatus").innerText();
  assert.match(renderStatus, /Vídeo renderizado correctamente/, "Chromium must produce a completed video export, not merely enable the render button");
  assert.match(renderStatus, /con narración integrada/, "The completed export must report that narration was muxed into the video");
  assert.equal(await durationControl.isDisabled(), false, "Timeline editing must be restored after rendering");
  assert.equal(await page.locator("#audioGain").isDisabled(), false, "Narration editing must be restored after rendering");
  assert.equal(await page.locator('#captionEditor textarea[aria-label="Texto del subtítulo"]').isDisabled(), false, "Subtitle editing must be restored after rendering");
  const download = page.locator("#downloadVideo");
  assert.equal(await download.isVisible(), true, "A completed render must expose its downloadable file");
  const exported = await page.evaluate(async () => {
    const link = document.querySelector("#downloadVideo");
    const blob = await fetch(link.href).then(response => response.blob());
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = link.href;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Exported video metadata could not be decoded"));
      setTimeout(() => reject(new Error("Timed out reading exported video metadata")), 8000);
    });
    video.currentTime = Math.min(1, video.duration / 2);
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = () => reject(new Error("An exported video frame could not be decoded"));
      setTimeout(() => reject(new Error("Timed out decoding an exported video frame")), 8000);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 284;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let y = 12; y < canvas.height; y += 27) {
      for (let x = 12; x < canvas.width; x += 23) {
        const offset = (y * canvas.width + x) * 4;
        colors.add([pixels[offset], pixels[offset + 1], pixels[offset + 2]].join(","));
      }
    }
    return { type: blob.type, size: blob.size, width: video.videoWidth, height: video.videoHeight, duration: video.duration, distinctFrameColors: colors.size };
  });
  assert.match(exported.type, /^video\/(mp4|webm)/, "The export must be a real MP4 or WebM media blob");
  assert.ok(exported.size > 1000, "The exported media file must contain encoded data");
  assert.equal(exported.width, 720, "The exported video must be 720 pixels wide");
  assert.equal(exported.height, 1280, "The exported video must be portrait 9:16");
  assert.ok(exported.duration >= 9 && exported.duration <= 12, "The exported video duration must match the edited ten-second timeline");
  assert.ok(exported.distinctFrameColors >= 8, "A decoded exported frame must contain actual visual content, not a blank or black canvas");
  assert.deepEqual(pageErrors, [], "The application must not throw uncaught browser errors during recovery, editing, synchronization, or export");
  console.log("PASS: recovery, scene/timeline editing, audio/subtitle synchronization, and real Chromium portrait export with decodable metadata, visible frame content, and integrated narration.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
