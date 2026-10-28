// Vercel entry point: the whole Express app (the compiled API, built by `npm run build`) runs as
// one serverless function. vercel.json rewrites /api/* here; the static frontend is served by
// Vercel itself. Self-hosted/Docker deployments don't use this file — they run apps/api/dist/index.js.
import { createApp } from "../apps/api/dist/app.js";

export default createApp();
