import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts");
await mkdir(artifacts, { recursive: true });
const clipPath = path.join(artifacts, "jai-renderer-fixture.webm");
const ffmpeg = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=4", "-an", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-pix_fmt", "yuv420p", clipPath], { encoding: "utf8" });
assert.equal(ffmpeg.status, 0, "FFmpeg must generate the local video fixture: " + ffmpeg.stderr);
const moduleFiles = new Map([
  ["/jai-visual-asset-store.js", path.join(root, "jai-visual-asset-store.js")],
  ["/jai-media-renderer.js", path.join(root, "jai-media-renderer.js")],
  ["/clip.webm", clipPath]
]);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/") { res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><body>JAI renderer integration test</body>"); return; }
  const file = moduleFiles.get(pathname);
  if (!file) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": pathname.endsWith(".js") ? "text/javascript" : "video/webm", "access-control-allow-origin": "*" }).end(body);
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + address.port + "/");
  const result = await page.evaluate(async () => {
    const renderer = await import("/jai-media-renderer.js");
    const canvas = document.createElement("canvas"); canvas.width = 360; canvas.height = 640;
    const ctx = canvas.getContext("2d", { alpha: false });
    const makeImage = async color => {
      const c = document.createElement("canvas"); c.width = 160; c.height = 240;
      const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      return c.convertToBlob({ type: "image/png" });
    };
    const blobA = await makeImage("#18b4dc"), blobB = await makeImage("#f0a040");
    const image = await renderer.prepareVisualAsset({ asset_id: "still-a", mime_type: "image/png", blob: blobA, sha256: "fixture-a" });
    const sequence = await renderer.prepareVisualSequence([
      { asset_id: "seq-a", blob: blobA, sha256: "fixture-a" },
      { asset_id: "seq-b", blob: blobB, sha256: "fixture-b" }
    ]);
    const clipBlob = await (await fetch("/clip.webm")).blob();
    const clip = await renderer.prepareVisualAsset({ asset_id: "clip-c", mime_type: "video/webm", blob: clipBlob, sha256: "fixture-c" });
    const stream = canvas.captureStream(30);
    const audio = new AudioContext();
    await audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain(), destination = audio.createMediaStreamDestination();
    oscillator.frequency.value = 440; gain.gain.value = 0.035;
    oscillator.connect(gain); gain.connect(destination); destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    const timeline = [
      { type: "image", visual: image, duration: 1.5 },
      { type: "sequence", visual: sequence, duration: 1.5 },
      { type: "video_clip", visual: clip, duration: 3.0 }
    ];
    let activeIndex = -1, clipStarts = 0, drawCount = 0, lastFrameTime = 0, frameGaps = [];
    const total = timeline.reduce((sum, item) => sum + item.duration, 0);
    recorder.start(200);
    oscillator.start();
    const started = performance.now();
    await new Promise((resolve, reject) => {
      const tick = now => {
        const elapsed = (now - started) / 1000;
        if (elapsed >= total) { recorder.stop(); resolve(); return; }
        let cursor = 0, index = timeline.length - 1, progress = 1;
        for (let i = 0; i < timeline.length; i++) {
          if (elapsed < cursor + timeline[i].duration) { index = i; progress = (elapsed - cursor) / timeline[i].duration; break; }
          cursor += timeline[i].duration;
        }
        const item = timeline[index];
        if (index !== activeIndex) {
          if (activeIndex === 2) renderer.stopPreparedVisualPlayback(clip);
          activeIndex = index;
          if (item.type === "video_clip") {
            clipStarts++;
            renderer.startPreparedVisualPlayback(clip, progress, item.duration);
          }
        }
        const ok = renderer.drawPreparedVisualNow(ctx, canvas.width, canvas.height, item.visual, progress);
        if (ok) {
          drawCount++;
          if (lastFrameTime) frameGaps.push(now - lastFrameTime);
          lastFrameTime = now;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => reject(new Error("Master timeline render timed out")), 12000);
    });
    await stopped;
    renderer.stopPreparedVisualPlayback(clip);
    oscillator.stop();
    const blob = new Blob(chunks, { type: mime });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const b64 = btoa(binary);
    await audio.close();
    stream.getTracks().forEach(track => track.stop());
    return {
      mime, duration: total, drawCount, clipStarts,
      medianFrameGapMs: frameGaps.sort((a,b)=>a-b)[Math.floor(frameGaps.length/2)] || null,
      maxFrameGapMs: Math.max(0, ...frameGaps),
      blobBase64: b64, blobSize: blob.size
    };
  });
  assert.equal(result.clipStarts, 1, "video clip must start once on its timeline entry");
  assert.ok(result.drawCount >= 100, "renderer should draw a continuous sequence of frames");
  assert.ok(result.blobSize > 20000, "real renderer output must contain encoded media");
  const outputPath = path.join(artifacts, "jai-real-renderer-integration.webm");
  await writeFile(outputPath, Buffer.from(result.blobBase64, "base64"));
  const probe = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,duration", "-of", "json", outputPath], { encoding: "utf8" });
  assert.equal(probe.status, 0, "FFprobe must inspect the actual renderer output: " + probe.stderr);
  const report = JSON.parse(probe.stdout);
  await writeFile(path.join(artifacts, "jai-real-renderer-integration.ffprobe.json"), JSON.stringify({ ...report, renderer_metrics: { drawCount: result.drawCount, clipStarts: result.clipStarts, medianFrameGapMs: result.medianFrameGapMs, maxFrameGapMs: result.maxFrameGapMs } }, null, 2));
  const video = report.streams.find(stream => stream.codec_type === "video");
  const audioTrack = report.streams.find(stream => stream.codec_type === "audio");
  const duration = Number(report.format.duration);
  const frameCount = Number(video?.nb_read_frames);
  assert.ok(video && audioTrack, "actual renderer output must contain video and audio tracks");
  assert.equal(video.width, 360);
  assert.equal(video.height, 640);
  assert.ok(duration >= 5.5 && duration <= 7.5, "render duration must match six-second master timeline");
  assert.ok(frameCount >= 24 * 5.5, "render must sustain at least 24 decoded frames per second");
  assert.ok(result.maxFrameGapMs < 500, "master timeline must not stall for half a second or more");
  assert.deepEqual(errors, [], "Chromium must not report page errors");
  console.log(JSON.stringify({ status: "PASS", outputPath, ffprobe: report, renderer_metrics: { drawCount: result.drawCount, clipStarts: result.clipStarts, medianFrameGapMs: result.medianFrameGapMs, maxFrameGapMs: result.maxFrameGapMs } }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
