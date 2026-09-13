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
