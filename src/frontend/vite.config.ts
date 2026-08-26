import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// When the Aspire AppHost starts this dev server (`AddNpmApp("frontend", ...,
// "dev")` in AppHost.cs), `WithReference(api)` injects the API's resolved
// address as `services__api__<binding>__0` (Aspire's service-discovery env
// var format for non-.NET apps — see
// https://learn.microsoft.com/dotnet/aspire/service-discovery/overview).
// Proxying `/api` to it keeps the frontend's own API_BASE_URL same-origin
// (`/api/v1`, see config.ts) here exactly as it is in the production
// single-image build, instead of needing an absolute dev-only API URL and
// CORS on the backend for it.
const apiProxyTarget = process.env.services__api__http__0 ?? process.env.services__api__https__0;

// AppHost.cs's `.WithHttpEndpoint(env: "PORT")` picks a port for this
// resource and hands it to the child process as PORT — the endpoint every
// other resource's `WithReference`/the Aspire dashboard actually points at.
// Vite has no built-in convention for that env var and defaults to 5173
// regardless, so without this the dev server binds the wrong port: Aspire's
// endpoint has nothing listening on it (net::ERR_CONNECTION_RESET) even
// though `npm run dev` looks like it started fine on its own default port.
const aspirePort = process.env.PORT ? Number(process.env.PORT) : undefined;

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    ...(aspirePort ? { port: aspirePort, strictPort: true } : {}),
    ...(apiProxyTarget
      ? {
          proxy: {
            // secure: false — the https fallback target is ASP.NET Core's
            // local dev certificate, which node's TLS stack won't trust.
            '/api': { target: apiProxyTarget, changeOrigin: true, secure: false },
          },
        }
      : {}),
  },
})
