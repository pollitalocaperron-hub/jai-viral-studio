# Cloudflare backend candidate — J.A.I. Viral Studio

## Architecture and current decision

GitHub Pages remains the frontend. `worker.js` adapts the four existing Vercel-style API handlers. The Worker is deliberately not wired into the frontend and is not deployed. Vercel remains the live rollback target.

Cloudflare Workers Free is a candidate, not a proven production fit: the documented allowance is 10 ms CPU per HTTP invocation. Network waiting is excluded, but JSON parsing, validation, and base64 handling count as CPU.

## CPU containment for visual inspection

- Browser inspection renders each audit frame to 480 × 854 JPEG at quality 0.64.
- Requests are batched in groups of four, rather than eight.
- The Worker streams and counts request bytes before parsing JSON, cancels oversized streams, and caps inspection requests at 1,280 KiB. Other JSON routes are capped at 2 MiB.
- The inspection handler accepts at most four images and 1,100,000 base64 characters per request.
- This reduces peak parsing work and allocation; it does not prove the 10 ms limit is met. The final gate remains a Cloudflare runtime CPU measurement with worst-case images and plans.

## Shared abuse protection

A SQLite-backed Durable Object is allocated per Cloudflare client IP. All Worker isolates and edge locations for that IP resolve to the same object; its SQL upsert atomically increments a fixed-window counter. The IP is used only as the object name and is not written to the SQL table.

Fixed-window limits per IP:
- Generate: 6 requests / 10 minutes.
- Narration: 8 / 10 minutes.
- Scene direction: 8 / 10 minutes.
- Visual inspection: 20 / 10 minutes (up to 80 frames at four per request).

The Worker rejects POST requests if the Durable Object binding or client IP is missing, or the guard cannot be reached. This is fail-closed. CORS is retained but is not treated as authentication. IP-based quotas are not identity-based and can be evaded by distributed clients; a future signed session / account identity would be stronger. Shared DO requests themselves have free-tier quotas and must be monitored.

## Provider compatibility tests

Existing API contract tests stub `fetch` and fake provider responses. The new Worker tests make no Groq or Gemini requests. A provider compatibility matrix should cover Groq success, Groq 429 with Gemini fallback, Gemini success, Gemini 429, malformed JSON, timeout, and TTS audio response parsing. These are contract simulations, not proof of live provider availability or model quality. Never run live calls automatically.

## Reversal strategy

- Keep Vercel URL and deployment untouched.
- Do not change the frontend API base URL until a Worker is deployed and its health, CORS, provider contracts, CPU, and browser E2E checks pass.
- Backend switching is one isolated frontend configuration change; rollback is restoring the Vercel API base URL.
- Never delete Vercel or its secrets during migration.
- No branch ref update, deployment, account creation, billing action, or provider call is performed by this candidate.

## Activation gates

1. User-owned Cloudflare Free account and Worker namespace.
2. Add `GROQ_API_KEY` and `GEMINI_API_KEY` as encrypted secrets only.
3. Verify Durable Object migration and bindings.
4. Run Node adapter tests, then Wrangler/Miniflare runtime tests.
5. Measure actual CPU for four 480 × 854 frames, maximum 1,100,000 base64 characters, and 20-shot direction payloads. If 10 ms is exceeded, do not activate the Free Worker; move image preprocessing client-side further or select a runtime with a sufficient free CPU budget.
6. Test Groq/Gemini compatibility with mocks only. Real provider quality tests require separate explicit approval because they consume quota.
7. Deploy and switch only after explicit authorization; preserve Vercel as immediate rollback.

## Status

Prepared source only. The tests in this candidate have not been executed in a real Cloudflare runtime. Nothing is deployed or active.
