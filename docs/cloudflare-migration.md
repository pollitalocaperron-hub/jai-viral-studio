# J.A.I. backend migration candidate: Cloudflare Workers

## Decision

Cloudflare Workers is the preferred zero-cost backend candidate. GitHub Pages remains the static frontend. The existing four Vercel-style handlers are retained and invoked through `worker.js`, an adapter that supplies the small subset of the Vercel request/response interface they use.

Deno Deploy is not a suitable long-term target because its official documentation says the service will be sunset in April 2027. Netlify Functions is a viable Node-oriented fallback, but its current Free plan is credit-limited (300 credits/month); Cloudflare offers a clearer free request allowance for this API.

## Current adapter scope

- Routes: `/api/generate`, `/api/narrate`, `/api/inspect-visual`, `/api/direct-scenes`.
- Health endpoint: `/healthz`.
- Existing Groq and Gemini secrets are read from Worker bindings through Node.js compatibility.
- JSON request bodies are capped at 4 MiB before reaching the handlers.
- The existing CORS policy remains restricted to the GitHub Pages origin.
- No provider calls are made by adapter tests.

## Important free-tier gate

Workers Free currently documents 100,000 requests/day, 128 MB memory, 50 external subrequests/request, and 10 ms CPU/request. Network waiting is not CPU time, but parsing large JSON/base64 image payloads and validating detailed scene plans can exceed 10 ms. The visual-inspection endpoint and largest storyboard payloads therefore require local runtime benchmarking before choosing Free as the production tier. Do not claim the free tier is production-ready until those tests pass.

## Not yet done

- No Worker has been deployed.
- No Cloudflare account, zone, domain, paid plan, or billing method has been created or changed.
- No API secrets have been copied to Cloudflare.
- The frontend still targets the existing Vercel backend.
- No branch ref has been updated; this is a reviewable, unreferenced Git commit candidate only.

## Activation checklist

1. Create the Worker in a user-controlled Cloudflare account on the Free plan.
2. Add `GROQ_API_KEY` and `GEMINI_API_KEY` as encrypted Worker secrets; never place them in `vars`, source files, or Git history.
3. Run adapter tests and Cloudflare local-runtime tests, including worst-case visual-inspection payloads and 8–25 shot plans.
4. Verify actual CPU time, memory, response formats, CORS, timeouts, and provider fallback behavior without making billable provider calls.
5. Add shared abuse protection; CORS is not authentication and is not a rate limiter.
6. Only after the user explicitly authorizes activation, deploy the Worker, test its health endpoint, and then change the frontend API base URL in a separate controlled change.
7. Keep the Vercel backend unchanged as rollback until the new backend passes end-to-end verification.
