---
name: coolify
description: Query or manage this project's Coolify deployment (servers, projects, applications, deployments) via the Coolify REST API. Use when asked about deployment status, restarting/redeploying the app, environment variables on the server, or anything else about the Coolify instance backing this project.
---

# Coolify

This project deploys via a self-hosted Coolify instance. There is no MCP server for
it (a `coolify` MCP entry in `.mcp.json` used to exist but was removed — the API is
directly reachable and doesn't need the MCP indirection). Call the REST API
directly with `curl`.

## Auth

Two environment variables must be present in the session:

- `COOLIFY_URL` — base URL of the Coolify instance (e.g. `https://coolify.example.com`)
- `COOLIFY_API_TOKEN` — bearer token

```bash
curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${COOLIFY_URL}/api/v1/<path>"
```

If either variable is missing, say so rather than guessing a URL/token — do not
hardcode credentials.

## Useful read endpoints

- `GET /api/v1/version` — sanity check the instance is reachable
- `GET /api/v1/servers` — servers Coolify manages
- `GET /api/v1/projects` — projects (this repo's project is named `bjarnoy`)
- `GET /api/v1/applications` — all applications (this repo's app is named `bjarnoy`)
- `GET /api/v1/applications/{uuid}` — one application's full config
- `GET /api/v1/deployments` — deployment history
- `GET /api/v1/applications/{uuid}/logs` — container logs

## Mutating endpoints

- `POST /api/v1/applications/{uuid}/restart` — restart
- `POST /api/v1/deploy?uuid={uuid}` — trigger a deployment

Treat any mutating call (restart, redeploy, deleting a resource, changing env vars
on the live app) the same as any other risky/hard-to-reverse action: confirm with
the user before calling it, per this repo's general "check before acting" rules —
don't restart or redeploy production on your own initiative just because a task
seems related.

Full API reference: `${COOLIFY_URL}/docs/api` (redirects to Coolify's hosted docs
UI) — check it for endpoints not listed above (env vars, databases, services).
