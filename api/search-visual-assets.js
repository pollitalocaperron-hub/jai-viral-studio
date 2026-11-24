import { applyApiCors } from "../cors.js";

const MAX_QUERY = 180;
const ALLOWED_LICENSES = new Set(["by", "by-sa", "by-nd", "by-nc", "by-nc-sa", "by-nc-nd", "cc0", "pdm"]);

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}
function normalizeAsset(item) {
  const license = text(item.license, 30).toLowerCase();
  const thumbnail = safeHttps(item.thumbnail || item.url);
  const original = safeHttps(item.url);
  const source = safeHttps(item.foreign_landing_url || item.detail_url);
  if (!thumbnail || !source || !ALLOWED_LICENSES.has(license)) return null;
  return {
    id: text(item.id, 100),
    title: text(item.title, 220) || "Recurso sin título",
    creator: text(item.creator, 180) || "Autor no indicado",
    creator_url: safeHttps(item.creator_url),
    source_url: source,
    thumbnail,
    original_url: original,
    license,
    license_version: text(item.license_version, 20),
    attribution: text(item.attribution, 500),
    provider: "Openverse",
    media_type: "image"
  };
}

async function getOpenverseToken() {
  const clientId = process.env.OPENVERSE_CLIENT_ID;
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return "";
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  const response = await fetch("https://api.openverse.org/v1/auth_tokens/token/", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Openverse token HTTP " + response.status);
  const data = await response.json();
  return text(data.access_token, 4000);
}

export default async function handler(req, res) {
  if (!applyApiCors(req, res)) return res.status(403).json({ error: "Origen no autorizado." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Método no permitido." }); }
  const query = text(req.body?.query, MAX_QUERY);
  if (query.length < 3) return res.status(400).json({ error: "Escribe una búsqueda visual de al menos 3 caracteres." });
  try {
    const token = await getOpenverseToken();
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", "8");
    url.searchParams.set("license", [...ALLOWED_LICENSES].join(","));
    url.searchParams.set("mature", "false");
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
    if (!response.ok) {
      const error = new Error("Openverse HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    const assets = (Array.isArray(data.results) ? data.results : []).map(normalizeAsset).filter(Boolean).slice(0, 8);
    return res.status(200).json({
      provider: "Openverse", query, assets,
      total_available: Number.isFinite(Number(data.result_count)) ? Number(data.result_count) : assets.length,
      storage: "metadata_only",
      note: "Los resultados son candidatos. Revisa licencia, atribución y pertinencia antes de usarlos; no se descargan ni se aprueban automáticamente."
    });
  } catch (error) {
    console.warn("[JAI][Visual assets] Openverse no disponible:", String(error?.message || error).slice(0, 240));
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({
      error: "No se pudo consultar Openverse en este momento.",
      diagnosticCode: Number(error?.status) === 429 ? "OPENVERSE_RATE_LIMIT" : "OPENVERSE_UNAVAILABLE"
    });
  }
}
