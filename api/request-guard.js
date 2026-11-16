export function enforceRequestBodyLimit(req, res, maxBytes) {
  const headers = req.headers || {};
  const contentType = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
  if (contentType && !/^application\/json(?:\s*;|$)/.test(contentType)) {
    res.status(415).json({ error: "El endpoint acepta únicamente solicitudes JSON.", diagnosticCode: "UNSUPPORTED_CONTENT_TYPE" });
    return false;
  }

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    res.status(500).json({ error: "La configuración del límite de solicitud no es válida.", diagnosticCode: "INVALID_BODY_LIMIT_CONFIG" });
    return false;
  }

  const rawLength = headers["content-length"] ?? headers["Content-Length"];
  if (rawLength !== undefined && rawLength !== null && rawLength !== "") {
    const declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      res.status(400).json({ error: "La longitud declarada de la solicitud no es válida.", diagnosticCode: "INVALID_CONTENT_LENGTH" });
      return false;
    }
    if (declaredLength > maxBytes) {
      res.status(413).json({ error: "La solicitud supera el tamaño máximo permitido.", diagnosticCode: "REQUEST_TOO_LARGE" });
      return false;
    }
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "El cuerpo debe ser un objeto JSON.", diagnosticCode: "INVALID_REQUEST_BODY" });
    return false;
  }

  let serialized;
  try { serialized = JSON.stringify(body); }
  catch {
    res.status(400).json({ error: "El cuerpo de la solicitud no es válido.", diagnosticCode: "INVALID_REQUEST_BODY" });
    return false;
  }
  if (Buffer.byteLength(serialized || "{}", "utf8") > maxBytes) {
    res.status(413).json({ error: "La solicitud supera el tamaño máximo permitido.", diagnosticCode: "REQUEST_TOO_LARGE" });
    return false;
  }
  return true;
}
