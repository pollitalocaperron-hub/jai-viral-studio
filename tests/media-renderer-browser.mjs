import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]), out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
function makePng(r, g, b, a = 255) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const row = Buffer.from([0, r, g, b, a, r, g, b, a]);
  const raw = Buffer.concat([row, row]);
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", header), pngChunk("IDAT", require("node:zlib").deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))
  ]);
}
const files = new Map([
  ["/jai-visual-asset-store.js", path.join(root, "jai-visual-asset-store.js")],
  ["/jai-media-renderer.js", path.join(root, "jai-media-renderer.js")]
]);
const server = http.createServer(async (req, res) => {
  const filename = files.get(new URL(req.url, "http://localhost").pathname);
  if (!filename) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(filename);
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "access-control-allow-origin": "*" });
    res.end(body);
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + address.port + "/");
  const png = makePng(24, 180, 220).toString("base64");
  const result = await page.evaluate(async ({ png }) => {
    const store = await import("/jai-visual-asset-store.js");
    const renderer = await import("/jai-media-renderer.js");
    const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0));
    const file = new File([bytes], "fixture-real.png", { type: "image/png" });
    const saved = await store.importLocalMediaFile(file);
    const restored = await store.getStoredAsset(saved.asset_id);
    const prepared = await renderer.prepareVisualAsset(restored);
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const rendered = renderer.drawPreparedVisualNow(ctx, 64, 64, prepared, 0.5);
    const pixel = [...ctx.getImageData(32, 32, 1, 1).data];
    return { rendered, pixel, width: prepared.width, height: prepared.height, sha256: saved.sha256, stored: !!restored?.blob };
  }, { png });
  assert.equal(result.rendered, true, "decoded PNG should render to canvas");
  assert.deepEqual(result.pixel, [24, 180, 220, 255], "rendered canvas pixel should match the real PNG fixture");
  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.stored, true, "Blob should survive IndexedDB round-trip");
  console.log("Chromium real PNG import, SHA-256, IndexedDB round-trip, decode and canvas render: PASS");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
