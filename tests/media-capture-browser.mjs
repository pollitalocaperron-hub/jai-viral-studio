import assert from "node:assert/strict";
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 568;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const paint = () => {
      frame++;
      ctx.fillStyle = "#07182d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#18b4dc";
      ctx.fillRect(24 + (frame % 80) * 2, 220, 90, 90);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("J.A.I. CAPTURE TEST", 20, 80);
    };
    paint();
    const videoStream = canvas.captureStream(30);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    gain.gain.value = 0.035;
    oscillator.connect(gain).connect(destination);
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);
    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Chromium has no supported WebM MediaRecorder MIME type");
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => {
      recorder.onerror = event => reject(event.error || new Error("MediaRecorder error"));
      recorder.onstop = resolve;
    });
    await audioContext.resume();
    oscillator.start();
    const paintTimer = setInterval(paint, 1000 / 30);
    recorder.start(100);
    await new Promise(resolve => setTimeout(resolve, 3000));
    recorder.stop();
    await stopped;
    clearInterval(paintTimer);
    oscillator.stop();
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Captured WebM could not be decoded by Chromium"));
    });
    await video.play();
    await new Promise(resolve => setTimeout(resolve, 350));
    const output = {
      mimeType: recorder.mimeType,
      bytes: blob.size,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
      decodedCurrentTime: video.currentTime,
      base64: btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))
    };
    video.pause();
    URL.revokeObjectURL(url);
    await audioContext.close();
    return output;
  });
  assert.match(result.mimeType, /^video\/webm/);
  assert.ok(result.bytes > 10000, "MediaRecorder must produce a non-empty audiovisual file");
  assert.equal(result.width, 320);
  assert.equal(result.height, 568);
  assert.ok(result.duration >= 2, "Captured video duration must be at least two seconds");
  assert.equal(result.videoTracks, 1);
  assert.equal(result.audioTracks, 1);
  assert.ok(result.decodedCurrentTime > 0, "Chromium must decode and play captured frames");
  const outputPath = "artifacts/jai-chromium-av-capture.webm";
  const rawPath = "artifacts/jai-chromium-av-capture-raw.webm";
  const reportPath = "artifacts/jai-chromium-av-capture.ffprobe.json";
  await (await import("node:fs/promises")).mkdir("artifacts", { recursive: true });
  await writeFile(rawPath, Buffer.from(result.base64, "base64"));
  delete result.base64;
  // Finalize MediaRecorder WebM cues/duration before independent probing.
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", rawPath, "-map", "0", "-c", "copy", "-fflags", "+genpts", outputPath], { encoding: "utf8" });
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,duration", "-of", "json", outputPath], { encoding: "utf8" }));
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");
  const durations = [probe.format?.duration, ...probe.streams.map(stream => stream.duration)].map(Number).filter(Number.isFinite);
  const inspectedDuration = durations.length ? Math.max(...durations) : 0;
  const report = {
    generatedAt: new Date().toISOString(),
    capture: { mimeType: result.mimeType, bytes: result.bytes, width: result.width, height: result.height, duration: result.duration, videoTracks: result.videoTracks, audioTracks: result.audioTracks, decodedCurrentTime: result.decodedCurrentTime },
    file: outputPath,
    ffprobe: probe,
    checks: { videoStream: Boolean(video), audioStream: Boolean(audio), inspectedDurationSeconds: inspectedDuration, minimumDurationSeconds: 2 }
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  assert.ok(video, "FFprobe must detect a video stream");
  assert.ok(audio, "FFprobe must detect an audio stream");
  assert.equal(video.width, 320);
  assert.equal(video.height, 568);
  assert.ok(inspectedDuration >= 2, `FFprobe duration must be at least two seconds; got ${inspectedDuration}`);
  assert.ok(Number(probe.format.size) > 10000);
  console.log("Chromium audiovisual capture + FFprobe: PASS", JSON.stringify(report));
} finally {
  await browser.close();
}
