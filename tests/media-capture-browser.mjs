import assert from "node:assert/strict";
import { chromium } from "playwright";

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
    await new Promise(resolve => setTimeout(resolve, 2300));
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
      decodedCurrentTime: video.currentTime
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
  console.log("Chromium audiovisual MediaRecorder capture: PASS", JSON.stringify(result));
} finally {
  await browser.close();
}
