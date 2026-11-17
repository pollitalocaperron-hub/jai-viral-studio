# Cloudflare Workers migration (isolated)

This branch is a migration candidate. It does not replace the production Vercel backend.

## Current adapter

- Maps the existing four Vercel-style handlers to Workers Fetch API routes.
- Passes Cloudflare bindings to each handler as the runtime environment.
- Preserves the existing Pages origin allowlist and API response contracts.
- Rejects malformed JSON, unsupported content types, unknown routes, and declared request bodies above 10 MB.
- Keeps provider calls server-side. No provider key belongs in browser code or committed configuration.

## Free-plan gate

Cloudflare Workers Free currently documents 100,000 requests/day, 10 ms CPU/request, 128 MB memory and 50 subrequests/request. External fetch wait time does not count as CPU, but local parsing, serialization, PCM conversion and image payload handling do. The 10 ms CPU limit is a hard go/no-go gate for J.A.I.; do not deploy or route production traffic until representative workloads are measured in the actual Workers runtime.

The visual-inspection handler already caps its batch payload at 3.5 million base64 characters. Narration converts PCM to base64 and may be CPU-sensitive. A Node.js compatibility setting is enabled by the selected compatibility date; verify the actual Wrangler build before deployment.

## Required verification before cutover

1. Run the existing API contract, browser persistence and production-flow tests.
2. Run the Cloudflare adapter tests.
3. Run `npx wrangler deploy --dry-run` and inspect bundle compatibility.
4. Measure CPU for representative generation, scene-direction, visual-audit and narration requests in Workers Free.
5. Add a shared abuse-control mechanism and verify it stays within the free Durable Objects quota.
6. Configure `GROQ_API_KEY` and `GEMINI_API_KEY` as Worker secrets using the dashboard or `wrangler secret put`; never paste keys into chat or commit them.
7. Confirm that the account has no paid add-ons or spending-enabled configuration. Stop if Cloudflare asks for a paid upgrade or a card-backed feature.
8. Only after all gates pass, change the frontend API base and test a complete production flow.

## Local setup

```sh
npm install
npm run test:cloudflare
npx wrangler deploy --dry-run
```

This branch intentionally has no production cutover and no provider API calls in tests.
