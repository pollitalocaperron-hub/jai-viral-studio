import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveVisualStyleProfile, getVisualStyleProfileIds } from "../api/visual-style-profiles.js";

const locked = resolveVisualStyleProfile("paper-craft-explainer", "un tema cualquiera", "texto");
assert.equal(locked.id, "jai-reference-motion-01");
assert.deepEqual(getVisualStyleProfileIds(), ["jai-reference-motion-01"]);
assert.match(locked.prompt, /fixed visual language/i);
assert.match(locked.prompt, /Never switch to anime/i);

const renderer = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(renderer, /profile==="jai-reference-motion-01"/);
assert.match(renderer, /#071426/);
assert.match(renderer, /#36DDF4/);
assert.match(renderer, /#95613D/);
assert.match(renderer, /const orderedLayers=layers\.map\(\(layer,index\)=>\(\{layer,index\}\)\)/);
assert.match(renderer, /role==="environment"\|\|role==="setting"/, "Environment layers must render behind the main subject");

const direct = readFileSync(new URL("../api/direct-scenes.js", import.meta.url), "utf8");
assert.match(direct, /function buildCharacterBible\(shots\)/);
assert.match(direct, /const characterBible = buildCharacterBible\(normalized\)/);
assert.match(direct, /character_bible: characterBible/);
assert.match(direct, /CALIDAD DE ILUSTRACIÓN OBLIGATORIA/);
assert.match(direct, /No uses un rectángulo, círculo, cápsula o polígono genérico/);
assert.match(direct, /shot\.layers\.length > 6/, "The director contract must reject more than six vector layers");
assert.match(direct, /shot\.animation_steps\.length > 3/, "The director contract must reject more than three animation steps");
assert.match(direct, /entre 2 y 3 acciones de animación/);
assert.match(direct, /Cada toma debe ser visualmente distinta según el avance narrativo/);
assert.doesNotMatch(direct, /const characterBible\s*=\s*parsed\?\.character_bible/);

const endpoint = readFileSync(new URL("../api/search-visual-assets.js", import.meta.url), "utf8");
assert.match(endpoint, /foreign_landing_url/);
assert.match(endpoint, /ALLOWED_LICENSES/);
assert.match(endpoint, /storage: "metadata_only"/);
assert.match(endpoint, /OPENVERSE_CLIENT_ID/);

const bridge = readFileSync(new URL("../jai-openverse-asset-bridge.js", import.meta.url), "utf8");
assert.match(bridge, /localStorage/);
assert.match(bridge, /Importar archivo original/);
assert.match(bridge, /importOpenverseAsset/);
assert.match(bridge, /jai:visual-asset-ready/);
assert.match(bridge, /IndexedDB/);
console.log("Locked style, character bible and visual asset library contracts: PASS");
