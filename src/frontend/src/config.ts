// Demo mode is the default: `npm run dev` has no backend behind it (Vite
// serves the SPA alone), so the app must keep working with the in-memory
// `WorldModel` simulation described in the frontend README.
//
// The single container built by `deploy/Dockerfile` serves the SPA and the
// API from the same origin (see docs/tech/backend.md, "The image"), so a
// production build there sets `VITE_DEMO_MODE=false` at build time to talk
// to the real backend instead of generating a throwaway world client-side.
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';

// Same-origin by default, matching how the container serves both. Only
// needs overriding for local dev against a separately-running API
// (`dotnet run --project src/Bjarnoy.AppHost`).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
