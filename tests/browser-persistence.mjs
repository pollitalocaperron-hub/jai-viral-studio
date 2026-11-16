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
      story: [],
      retention_map: [],
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
      retentionMap: [],
      images: [{ src: png, sceneIndex: 0, shot: 0, time: 0 }],
      audit: [],
      timeline: [],
      audio: new Blob([new Uint8Array([10, 20, 30, 40])], { type: "audio/wav" }),
      audioDuration: 1,
      audioSampleRate: 24000,
      audioEdit: { trimStart: 0, trimEnd: 1, gain: 1 },
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
  assert.equal(await page.locator("#captionEditor").innerText().then(t => t.includes("Subtítulo restaurado")), true);
  assert.deepEqual(pageErrors, [], "The application must not throw uncaught browser errors during recovery");
  console.log("PASS: blank startup, IndexedDB Blob round-trip/deletion, and full saved-project recovery through the Cargar UI.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
