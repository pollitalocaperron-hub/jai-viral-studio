const ALLOWED_ORIGINS = new Set([
  "https://pollitalocaperron-hub.github.io"
]);

export function applyApiCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader("Vary", "Origin");

  // Browser-facing AI endpoints require the exact Pages origin.
  // This rejects origin-less direct requests; it is not authentication or a rate limiter.
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return false;
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  return true;
}
