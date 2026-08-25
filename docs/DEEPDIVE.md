# Deep-dive

## What it doesn't do

- Jobs run sequentially. Throughput needs real workers.
- No caching, so two near-identical topics both cost a full generation.
- No cost tracking. Token usage per generation isn't recorded anywhere.
- Console logging only. Per-generation tracing would come from [otel-sdk-node](https://github.com/sudhanshu1402/otel-sdk-node).
- Both models failing just logs and skips. A production worker needs a dead-letter queue.
- No streaming, so long generations block until complete.

## Deploy

Multi-stage `Dockerfile` on Node 22 Alpine: builds with dev dependencies in one stage, then installs production-only dependencies and copies just `dist` into the runtime image. Runs as the non-root `node` user, exposes port 3000.

`render.yaml` deploys the same build (`npm install --include=dev && npm run build`) and start command (`npm start`) to Render's free plan, with `NODE_ENV=production` and `PORT=3000` set.

## Three decisions worth reading

**Sequential failover, not parallel consensus.** `generateQuestion()` invokes the primary chain in a `try`; on any throw it builds a second chain against Gemini and re-runs with identical inputs. Only one model's output is ever returned. Both failing propagates to the caller. Different provider on purpose, so an OpenAI incident doesn't take the fallback with it.

**Schema before prompt.** The Zod schema in `src/schema.ts` is defined first, and `StructuredOutputParser` derives the prompt's format instructions from it. One source of truth for the instruction and the validation.

**A `.refine()` catches the failure mode that matters.** The LLM will occasionally emit zero correct options, or three. The refinement enforces exactly one, and a violation is rejected before anything is stored.

Full system design writeup: [System Design Portal](https://sudhanshu1402.github.io/system-design-portal/llm-pipeline).
