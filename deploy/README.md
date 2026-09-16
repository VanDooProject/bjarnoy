# Deploying Bjarnoy

Two files live here, and they are two halves of the same thing:

- **`Dockerfile`** builds the one image the deployment runs — the Vue app baked
  into the API's `wwwroot`, plus the migrator, which is the same executable
  under a different argument. See `docs/tech/backend.md` ("The image", "The
  migrator") for why it is shaped that way.
- **`docker-compose.yaml`** is the stack around that image: PostgreSQL, a
  migrator that runs to completion, then the app. It mirrors what
  `Bjarnoy.AppHost` wires up for local development, minus the separate frontend
  container that production does not have.

## Coolify

Create an **Application** (not a Service) from this repository:

| Setting | Value |
|---|---|
| Build Pack | Docker Compose |
| Base Directory | `/` |
| Docker Compose Location | `/deploy/docker-compose.yaml` |
| Branch | whichever branch this deployment is for |
| Settings → Git Submodules | enabled |

**Base Directory has to stay `/`.** Coolify deploys with `docker compose
--project-directory <base directory>`, and the build context in the compose
file is relative to that. Point it at `/deploy` and the build looks for the
sources one directory too deep.

**Git Submodules has to be on, and the source has to be the GitHub App.**
The tile art (`src/frontend/vendor/bg_assets_hextile`) is a submodule in a
separate *private* repository, and the Dockerfile fails the build outright when
it is missing rather than shipping an app with no textures.

`VanDooProject/bjarnoy` itself is public, so it is tempting to add it to Coolify
as a **Public Repository** — don't. That source clones with no credentials at
all, which is fine for this repository and impossible for its private
submodule; the deployment dies during import with

```
fatal: could not read Username for 'https://github.com': No such device or address
fatal: clone of 'https://github.com/VanDooProject/bg_assets_hextile' into submodule path … failed
```

Add it as a **private repository through a GitHub App** instead, and install
that App on `VanDooProject/bg_assets_hextile` as well. Only that path makes
Coolify rewrite same-host HTTPS URLs to carry an installation token, which is
what lets the submodule clone authenticate — a public source injects nothing to
rewrite, whatever the App can see.

`src/frontend/vendor/bg_assets_hextile` is now the only submodule, so
`--recurse-submodules` clones those ~220 MB once. `legacy/` used to register the
same repository a second time; it was dropped for exactly that reason.

Then set a domain **on the `app` service**. This is the part that is easy to
get wrong: a Docker Compose application has one domain field *per compose
service*, and only a domain sitting in `app`'s field produces the Traefik
labels that route to it. The URL Coolify shows for the resource itself is not
one of those — leave the domain there and the proxy answers every request with

```
404 page not found
```

which is Traefik saying no router matched the host, not the app returning a
404. The same bare 404 appears whenever the `app` container is not running, so
check the deployment succeeded before chasing the domain.

`https://bjarnoy.example.com` is enough — Coolify reads the target port from
the service's `expose:`. A `:8080` suffix is allowed and does the same thing.

Nothing else needs configuring; the environment variables below generate
themselves.

### What Coolify generates

| Variable | What it is |
|---|---|
| `SERVICE_PASSWORD_POSTGRES` | The database password, shared by `postgres`, `migrator` and `app`. |
| `SERVICE_BASE64_64_JWT` | `Jwt__SigningKey`. Generated once and kept, so access tokens issued before a redeploy stay valid after it. |
| `SERVICE_PASSWORD_ADMIN` | The bootstrap Admin's password. Read it from Coolify's environment variables to log in. |
| `ADMIN_BOOTSTRAP_USERNAME` | Defaults to `admin`; editable in Coolify. |

Each of these is generated on first deployment and stored with the resource, so
they are stable across redeploys and different per deployment. The Admin seed
only fires when the database has no Admin yet (see
`AuthService.SeedAdminIfConfiguredAsync`) — it is a way into a fresh database,
not a password reset.

### Deploying several branches at once

Every branch is its own Coolify Application pointed at the same repository with
a different branch and a different domain. They do not collide, because Coolify
runs each Application as its own compose project (`--project-name <resource
uuid>`), prefixes named volumes with that uuid, gives it its own network, and
assigns container names itself.

That only holds as long as this compose file names nothing globally, so when
editing it:

- no `container_name:` — Coolify sets it,
- no `image:` on the services that are built — compose derives
  `<project>-<service>`, which is unique per Application; a fixed tag would
  mean the last branch to build owns it, and the next redeploy of *another*
  branch would silently start that branch's image,
- no `name:` under `volumes:` — that would opt out of the uuid prefixing and
  hand two branches the same database directory,
- no `ports:` — a published host port is a single global resource, and the
  second branch to start would fail to bind it. `expose:` plus a domain lets
  Coolify's proxy route both branches on :443 by hostname.

Each deployment gets its own empty database, so a branch deployment starts from
a fresh world and its own bootstrap Admin.

### Preview deployments

**Do not use Coolify's own built-in "PR preview" feature for this
application** (the "Preview Deployments" toggle on the Application). It
deploys production and every open PR's preview *of the same Application*
under one shared docker-compose project
(`--project-name {application uuid}`, prod and previews alike) — every
service in this file is just renamed per deployment
(`addPreviewDeploymentSuffix`, e.g. `postgres` becomes `postgres-pr-239`),
not actually isolated. A network this file declares for itself, or any
alias on it, resolves to one name shared by production and every open PR;
several deployments defining the same alias let Docker DNS round-robin
between them, so each stack can intermittently reach *another's* database —
this was live and confirmed on production before being replaced by the
scheme below (naming the database through `${SERVICE_NAME_POSTGRES}` alone
was tried first and did not reliably fix it, since the underlying compose
project is still shared).

Instead, `.github/workflows/pr-preview.yml` + `scripts/coolify-preview.sh`
give **every open PR its own standalone Coolify Application** — its own
compose project, hence its own network, volumes and containers, with no
help needed from this file:

- **Opt-in, not automatic:** a PR gets no environment at all unless it
  carries the `preview` label — most PRs (docs, small fixes, anything
  nobody needs to click through in a browser) don't need a full cold build
  spent on them. Removing the label reclaims an already-provisioned
  environment (destroy is a no-op when none exists, so this is exactly as
  safe to run unconditionally as the close-triggered teardown below).
- **Once labeled `preview` (and on every push after that):** the workflow
  calls the Coolify API to create (if missing) an Application named
  `bjarnoy-pr-<N>`, pointed at that PR's own branch, with its own domain —
  the same one-label pattern the old built-in previews used
  (`https://<N>-bjarnoy.velarix.space`, see "Behind Cloudflare" below) —
  and triggers a deploy. The PR gets a GitHub Environment (`pr-<N>`) and a
  sticky comment with the preview URL.
- **On PR close (merged or not — squash included):** the workflow tears the
  Application down unconditionally, deleting its volumes and network too. A
  squash-merge is reported as the same `closed` + `merged: true` event as any
  other close, so *not* branching on `merged` is what guarantees teardown
  regardless of merge strategy.
- **Nightly, as a backstop:** a scheduled run reaps any `bjarnoy-pr-<N>`
  Application whose PR is no longer open, in case a `closed` event was
  missed (a skipped, cancelled, or failed workflow run).

The workflow needs a Coolify API token with `read`, `write`, and `deploy`
abilities in the `COOLIFY_API_TOKEN` repository secret, plus repository
variables `COOLIFY_URL`, `COOLIFY_PROJECT_UUID`, `COOLIFY_SERVER_UUID`, and
`COOLIFY_GITHUB_APP_UUID` (the same project/server/GitHub App the production
Application already uses).

Every per-PR Application still needs the preview-only diagnostics note that
used to live in Coolify's Preview Deployments environment variables — the
workflow sets these itself on creation, since `COOLIFY_BRANCH` (irrelevant
now that each PR is its own Application on its own branch) is no longer the
mechanism:

```bash
Diagnostics__ExposeApiReference=true
Diagnostics__PublicBuildInfo=true
```

## Behind Cloudflare

Two settings that are not optional once the zone is proxied, both of which fail
in ways that look like the app is broken when it never sees the request at all.

**SSL/TLS mode must be Full (strict)**, not Flexible. On Flexible, Cloudflare
terminates TLS and talks to the origin over plain HTTP; Coolify's proxy answers
"redirect to https", Cloudflare hands that back to the browser, and the browser
asks again — `ERR_TOO_MANY_REDIRECTS`, with a `Location` byte-identical to the
request URL. Nothing in this app issues a redirect (there is no
`UseHttpsRedirection`), so a redirect loop is always the proxy pair.

**Preview hostnames must stay one label** under the zone. Coolify's default
preview URL template is `{{pr_id}}.{{domain}}`, which for a domain of
`bjarnoy.example.com` produces `239.bjarnoy.example.com` — two labels below the
apex. Cloudflare's free Universal SSL covers `example.com` and `*.example.com`
and no deeper, and a wildcard never matches across a dot, so the edge has no
certificate to present and the browser reports
`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` before any HTTP happens. Join with a dash
instead:

```
pr{{pr_id}}-{{domain}}     →  pr239-bjarnoy.example.com
```

One label, covered by the existing wildcard, no new certificate. (The paid
Advanced Certificate Manager issues multi-level wildcards if the dotted form is
worth $10/month; so does taking previews off the proxy and letting Coolify's
Let's Encrypt serve them directly.)

### Through a tunnel

A `cloudflared` tunnel removes the origin ports entirely: the connector dials
out to Cloudflare, so 80, 443 and Coolify's own 8000 can all be closed at the
firewall. Two things are easy to get wrong.

**The wildcard DNS record is not created for you.** Cloudflare writes the CNAME
to `<tunnel-id>.cfargotunnel.com` when you add a published application route,
but it refuses to for a wildcard hostname — and an existing `*` A record would
block it anyway, since a name cannot be both A and CNAME. Replace it by hand.

**`No TLS Verify` is required on any route pointing at Coolify's proxy.**
cloudflared sends SNI for the origin URL's hostname, which is `localhost`, and
Traefik answers with its default self-signed certificate for
`<hash>.traefik.default`. Verification fails and the edge returns 502 with
`x509: certificate is valid for ... not localhost` in the connector log. The
alternatives do not help: `Origin Server Name` pins one name and so cannot
serve a wildcard, and `Match SNI to Host` asks for a certificate Traefik does
not have either. Skipping verification is sound here only because the hop is
loopback.

Routes are matched top to bottom, so the specific hostname must sit above the
wildcard:

```
1  coolify.example.com   HTTP    localhost:8000
2  *.example.com         HTTPS   localhost:443   (No TLS Verify)
```

If Coolify still issues Let's Encrypt certificates, add a third route above the
wildcard for `/.well-known/acme-challenge/*` to `HTTP localhost:80` — once the
wildcard resolves to the tunnel, HTTP-01 challenges arrive over the tunnel and
never reach Traefik's `:80` entrypoint, and renewals fail silently.

Closing the ports afterwards needs conntrack, not a plain port match. Docker
DNATs a published port before the `DOCKER-USER` chain runs, so by then the
destination port is the container's, not the published one, and a
`--dport 8000` rule matches nothing:

```bash
iptables  -I DOCKER-USER -i <nic> -p tcp -m conntrack --ctorigdstport 8000 -j DROP
ip6tables -I INPUT       -i <nic> -p tcp --dport 8000 -j DROP
```

IPv6 usually has no Docker DNAT, so there `docker-proxy` accepts on the host
and the rule belongs in `INPUT`. Scope both to the physical interface or you
will cut container-to-container traffic and loopback with them.

## Coolify's API from a Claude Code session

`.mcp.json` in the repository root declares Coolify's MCP endpoint. It holds no
values — the hostname and token are read from the environment:

```json
{
  "mcpServers": {
    "coolify": {
      "type": "http",
      "url": "${COOLIFY_URL}/mcp",
      "headers": { "Authorization": "Bearer ${COOLIFY_API_TOKEN}" }
    }
  }
}
```

Set `COOLIFY_URL` and `COOLIFY_API_TOKEN` in the cloud environment's
environment variables. They are copied into a session once, at startup, so a
change takes effect in the next session rather than the running one, and the
host must also be on the environment's network allowlist or the connection is
refused before it is attempted.

Scope the token to `read`. `read:sensitive` returns environment variable
*values* for every resource, which is every deployment secret on the instance.

## Without Coolify

From the repository root:

```bash
git submodule update --init                  # the tile art
cp deploy/.env.example deploy/.env           # then edit it
docker compose -f deploy/docker-compose.yaml --project-directory . \
  --env-file deploy/.env up --build
```

`--project-directory .` is not optional: without it compose resolves the build
context against `deploy/` instead of the repository root. It is what Coolify
passes too.

For the single-container SQLite deployment — no compose, no PostgreSQL — see
`docs/tech/backend.md`, "The image".
