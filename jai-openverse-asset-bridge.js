import { importOpenverseAsset, importLocalMediaFile } from "./jai-visual-asset-store.js";
import { easeMotionProgress, interpolateMotionTransform, resolveMotionTransform, resolveLayerMotionChain } from "./jai-2d-motion-engine.js";
window.JAI2DMotionEngine = { easeMotionProgress, interpolateMotionTransform, resolveMotionTransform, resolveLayerMotionChain };
import { prepareVisualAsset, prepareVisualSequence, drawPreparedVisualNow, awaitPreparedVisualFrame } from "./jai-media-renderer.js";
window.JAIMediaRenderer = { prepareVisualAsset, prepareVisualSequence, drawPreparedVisualNow, awaitPreparedVisualFrame };
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
  heading.textContent = "Biblioteca local: " + items.length + " candidatos registrados. Los archivos importados se guardan en IndexedDB de este dispositivo.";
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
const GENERIC_TERMS = new Set(["the","and","with","from","into","over","under","scene","shot","close","wide","view","background","foreground","cinematic","illustration","illustrated","visual","image","photo","person","people","man","woman","character","showing","standing","looking","using","holding","near","inside","outside","a","an","of","to","in","on","at","by","for","de","la","el","los","las","un","una","con","desde","sobre","entre","persona","personas","escena","toma","fondo","vista","mostrando","usando"]);
function visualTerms(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]{3,}/g)?.filter(word=>!GENERIC_TERMS.has(word)) || [];
}
async function autoAssignShotAssets(shots) {
  const list=Array.isArray(shots)?shots:[];
  const report={provider:"Openverse",attempted:0,assigned:0,skipped:0,errors:[]};
  for(let index=0;index<list.length;index++){
    const shot=list[index],shotId=String(shot?.shot_id||"");
    if(!shotId||window.jaiVisualAssignments?.[shotId]?.prepared){report.skipped++;continue;}
    const concepts=[shot.subject,shot.visual_subject,shot.visual_state,shot.visual_action,shot.visual_composition,shot.setting,shot.environment,shot.background,shot.location,shot.on_screen_text,shot.continuity_anchor,shot.visual_prompt_en].filter(Boolean).join(" ");
    const terms=[...new Set(visualTerms(concepts))];
    const query=terms.slice(0,7).join(" ");
    if(query.length<3){report.skipped++;continue;}
    report.attempted++;
    try{
      const response=await fetch(API_BASE+"/api/search-visual-assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query})});
      if(!response.ok)throw new Error("búsqueda HTTP "+response.status);
      const data=await response.json(),shotSet=new Set(terms);
      const ranked=(Array.isArray(data.assets)?data.assets:[]).map(asset=>{
        const titleTerms=visualTerms(asset.title+" "+asset.attribution);
        const overlap=titleTerms.filter(term=>shotSet.has(term)).length;
        return {asset,score:overlap/Math.max(1,Math.min(5,shotSet.size))};
      }).sort((a,b)=>b.score-a.score);
      const match=ranked.find(item=>item.score>=0.35 && ["cc0","pdm","by"].includes(String(item.asset.license||"").toLowerCase()));
      if(!match){report.skipped++;continue;}
      const stored=await importOpenverseAsset(match.asset);
      const prepared=await prepareVisualAsset(stored);
      document.dispatchEvent(new CustomEvent("jai:visual-asset-ready",{detail:{asset:stored,prepared,autoAssignShotId:shotId}}));
      const library=readLibrary();
      if(!library.some(item=>item.id===match.asset.id))library.unshift(match.asset);
      saveLibrary(library);
      report.assigned++;
    }catch(error){report.errors.push({shot_id:shotId,message:String(error?.message||error).slice(0,180)});}
  }
  const saved=document.getElementById("jaiAssetSaved");if(saved)renderLibrary(saved);
  return report;
}
window.JAIAutoVisualAssets={assignShotAssets:autoAssignShotAssets};
function init() {
  const studio = $("visualStudio");
  if (!studio || $("jaiAssetLibrary")) return;
  const panel = document.createElement("section");
  panel.className = "scene";
  panel.id = "jaiAssetLibrary";
  panel.innerHTML = '<b>Biblioteca de recursos visuales · Openverse</b><p class="hint">Busca fotografías e ilustraciones con licencias abiertas. Importa originales con SHA-256 o añade archivos propios de imagen/vídeo; después asígnalos a una toma. Se conservan localmente en IndexedDB.</p><div class="row" style="gap:8px;flex-wrap:wrap"><input id="jaiAssetQuery" maxlength="180" placeholder="Ej. router Wi-Fi, fibra óptica, bosque" aria-label="Buscar recursos visuales"><button class="secondary" id="jaiAssetSearch" type="button">Buscar recursos</button></div><label class="hint" for="jaiLocalMediaFile">Importar archivo local (imagen o vídeo, máximo 24 MB)</label><input id="jaiLocalMediaFile" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" multiple><div class="hint" id="jaiAssetStatus" role="status">Los resultados se pueden revisar y guardar en la biblioteca local.</div><div id="jaiAssetResults" style="display:grid;gap:9px;margin-top:10px"></div><div id="jaiAssetSaved" style="display:grid;gap:8px;margin-top:12px"></div>';
  const visualScenes = $("visualScenes");
  if (visualScenes) visualScenes.insertAdjacentElement("beforebegin", panel); else studio.append(panel);
  const input = $("jaiAssetQuery"), button = $("jaiAssetSearch"), status = $("jaiAssetStatus"), results = $("jaiAssetResults"), saved = $("jaiAssetSaved");
  const localFile = $("jaiLocalMediaFile");
  localFile.addEventListener("change", async () => {
    const files = [...(localFile.files || [])]; if (!files.length) return;
    status.textContent = "Importando archivo(s) local(es) y comprobando integridad…";
    try {
      if (files.length > 1) {
        if (files.some(file => !String(file.type).startsWith("image/"))) throw new Error("Una secuencia debe contener solo imágenes.");
        const stored = await Promise.all(files.map(importLocalMediaFile));
        const prepared = await prepareVisualSequence(stored);
        const asset = { asset_id: "sequence-" + stored.map(item => item.sha256.slice(0, 8)).join("-"), title: "Secuencia · " + stored.length + " fotogramas", mime_type: "image_sequence", sha256: stored.map(item => item.sha256) };
        document.dispatchEvent(new CustomEvent("jai:visual-asset-ready", { detail: { asset, prepared } }));
        status.textContent = "Secuencia de " + stored.length + " imágenes importada, decodificada y guardada en IndexedDB.";
      } else {
        const stored = await importLocalMediaFile(files[0]);
        const prepared = await prepareVisualAsset(stored);
        document.dispatchEvent(new CustomEvent("jai:visual-asset-ready", { detail: { asset: stored, prepared } }));
        status.textContent = "Archivo local decodificado y guardado en IndexedDB. SHA-256: " + stored.sha256;
      }
    } catch (error) { status.textContent = "No se pudo importar el archivo: " + (error?.message || "error de formato"); }
    finally { localFile.value = ""; }
  });
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
        const save = document.createElement("button"); save.type = "button"; save.className = "secondary"; save.textContent = "Importar archivo original";
        save.addEventListener("click", async () => {
          save.disabled = true; save.textContent = "Descargando y verificando…";
          try {
            const stored = await importOpenverseAsset(asset);
            const prepared = await prepareVisualAsset(stored);
            const library = readLibrary();
            if (!library.some(item => item.id === asset.id)) library.unshift(asset);
            saveLibrary(library); renderLibrary(saved);
            document.dispatchEvent(new CustomEvent("jai:visual-asset-ready", { detail: { asset: stored, prepared } }));
            save.textContent = "Importado · listo para asignar";
            status.textContent = "Archivo original guardado localmente, decodificado y verificado con SHA-256. Asigna la toma en el panel de producción.";
          } catch (error) {
            save.disabled = false; save.textContent = "Reintentar importación";
            status.textContent = "No se pudo importar este original: " + (error?.message || "error CORS o archivo no válido");
          }
        });
        card.append(image, title, meta, source, save); results.append(card);
      }
      if (!data.assets.length) status.textContent += " No se devolvieron resultados con metadatos/licencias válidos.";
    } catch (error) { status.textContent = error.message || "Error al consultar recursos."; }
    finally { button.disabled = false; }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
