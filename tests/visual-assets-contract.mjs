import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveVisualStyleProfile, getVisualStyleProfileIds } from "../api/visual-style-profiles.js";

const locked = resolveVisualStyleProfile("paper-craft-explainer", "un tema cualquiera", "texto");
assert.equal(locked.id, "jai-reference-motion-01");
assert.deepEqual(getVisualStyleProfileIds(), ["jai-reference-motion-01"]);
assert.match(locked.prompt, /fixed visual language/i);
assert.match(locked.prompt, /Never switch to anime/i);

const direct = readFileSync(new URL("../api/direct-scenes.js", import.meta.url), "utf8");
assert.match(direct, /function buildCharacterBible\(shots\)/);
assert.match(direct, /const characterBible = buildCharacterBible\(normalized\)/);
assert.match(direct, /character_bible: characterBible/);
assert.doesNotMatch(direct, /const characterBible\s*=\s*parsed\?\.character_bible/);

const endpoint = readFileSync(new URL("../api/search-visual-assets.js", import.meta.url), "utf8");
assert.match(endpoint, /foreign_landing_url/);
assert.match(endpoint, /ALLOWED_LICENSES/);
assert.match(endpoint, /storage: "metadata_only"/);
assert.match(endpoint, /OPENVERSE_CLIENT_ID/);

const bridge = readFileSync(new URL("../jai-openverse-asset-bridge.js", import.meta.url), "utf8");
assert.match(bridge, /localStorage/);
assert.match(bridge, /Guardar en biblioteca/);
assert.match(bridge, /no se insertan automáticamente/i);
console.log("Locked style, character bible and visual asset library contracts: PASS");
