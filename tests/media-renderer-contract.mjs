import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../jai-visual-asset-store.js", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../jai-media-renderer.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/search-visual-assets.js", import.meta.url), "utf8");
assert.match(api, /original_url: original/);
assert.match(store, /mode: "cors"/);
assert.match(store, /credentials: "omit"/);
assert.match(store, /MAX_BYTES = 24 \* 1024 \* 1024/);
assert.match(store, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(store, /indexedDB\.open/);
assert.match(store, /ALLOWED/);
assert.match(renderer, /source_type === "image"/);
assert.match(renderer, /source_type === "video_clip"/);
assert.match(renderer, /createImageBitmap/);
assert.match(renderer, /loadedmetadata/);
assert.match(renderer, /drawImage\(video/);
console.log("Openverse local media import, SHA-256, IndexedDB persistence and image/video renderer contracts: PASS");
