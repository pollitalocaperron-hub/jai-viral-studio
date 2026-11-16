export function enforceRequestBodyLimit(req, res, maxBytes) {
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    res.status(413).json({ error: "La solicitud supera el tamaño máximo permitido.", diagnosticCode: "REQUEST_TOO_LARGE" });
    return false;
  }
  let serialized;
  try { serialized = JSON.stringify(req.body ?? {}); }
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
