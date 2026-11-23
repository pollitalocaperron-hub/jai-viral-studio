const API_BASE = location.hostname === "pollitalocaperron-hub.github.io" ? "https://jai-viral-studio.vercel.app" : "";
const LIBRARY_KEY = "jai-visual-asset-library-v1";
const $ = id => document.getElementById(id);

function readLibrary() {
  try { const value = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveLibrary(items) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(items.slice(0, 120)));
}
function renderLibrary(target) {
  const items = readLibrary();
  target.innerHTML = "";
  const heading = document.createElement("p");
  heading.className = "hint";
  heading.textContent = "Biblioteca local: " + items.length + " candidatos guardados (metadatos y enlaces; los archivos originales permanecen en Openverse).";
  target.append(heading);
  for (const item of items.slice(0, 12)) {
    const row = document.createElement("div");
    row.className = "scene";
    const title = document.createElement("b"); title.textContent = item.title;
    const meta = document.createElement("p"); meta.className = "hint";
    meta.textContent = item.creator + " · licencia " + item.license.toUpperCase();
    const link = document.createElement("a"); link.href = item.source_url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Ver fuente y licencia";
    row.append(title, meta, link); target.append(row);
  }
}
function init() {
  const studio = $("visualStudio");
  if (!studio || $("jaiAssetLibrary")) return;
  const panel = document.createElement("section");
  panel.className = "scene";
  panel.id = "jaiAssetLibrary";
  panel.innerHTML = '<b>Biblioteca de recursos visuales · Openverse</b><p class="hint">Busca fotografías e ilustraciones con licencias abiertas. Los candidatos conservan autoría, fuente y licencia; no se insertan automáticamente en el vídeo.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input id="jaiAssetQuery" maxlength="180" placeholder="Ej. router Wi-Fi, fibra óptica, bosque" aria-label="Buscar recursos visuales"><button class="secondary" id="jaiAssetSearch" type="button">Buscar recursos</button></div><div class="hint" id="jaiAssetStatus" role="status">Los resultados se pueden revisar y guardar en la biblioteca local.</div><div id="jaiAssetResults" style="display:grid;gap:9px;margin-top:10px"></div><div id="jaiAssetSaved" style="display:grid;gap:8px;margin-top:12px"></div>';
  const visualScenes = $("visualScenes");
  if (visualScenes) visualScenes.insertAdjacentElement("beforebegin", panel); else studio.append(panel);
  const input = $("jaiAssetQuery"), button = $("jaiAssetSearch"), status = $("jaiAssetStatus"), results = $("jaiAssetResults"), saved = $("jaiAssetSaved");
  renderLibrary(saved);
  button.addEventListener("click", async () => {
    const query = input.value.trim();
    if (query.length < 3) { status.textContent = "Escribe al menos 3 caracteres."; return; }
    button.disabled = true; status.textContent = "Consultando Openverse…"; results.replaceChildren();
    try {
      const response = await fetch(API_BASE + "/api/search-visual-assets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo buscar.");
      status.textContent = data.assets.length + " candidatos encontrados para «" + query + "». Revisa cada licencia antes de usarlo.";
      for (const asset of data.assets) {
        const card = document.createElement("article"); card.className = "scene";
        const image = document.createElement("img"); image.src = asset.thumbnail; image.alt = asset.title; image.loading = "lazy";
        image.style.cssText = "width:100%;max-height:180px;object-fit:contain;background:#071326;border-radius:8px";
        const title = document.createElement("b"); title.textContent = asset.title;
        const meta = document.createElement("p"); meta.className = "hint"; meta.textContent = asset.creator + " · " + asset.license.toUpperCase() + (asset.license_version ? " " + asset.license_version : "");
        const source = document.createElement("a"); source.href = asset.source_url; source.target = "_blank"; source.rel = "noopener noreferrer"; source.textContent = "Abrir fuente y revisar condiciones";
        const save = document.createElement("button"); save.type = "button"; save.className = "secondary"; save.textContent = "Guardar en biblioteca";
        save.addEventListener("click", () => {
          const library = readLibrary();
          if (!library.some(item => item.id === asset.id)) library.unshift(asset);
          saveLibrary(library); renderLibrary(saved); save.textContent = "Guardado"; save.disabled = true;
        });
        card.append(image, title, meta, source, save); results.append(card);
      }
      if (!data.assets.length) status.textContent += " No se devolvieron resultados con metadatos/licencias válidos.";
    } catch (error) { status.textContent = error.message || "Error al consultar recursos."; }
    finally { button.disabled = false; }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
