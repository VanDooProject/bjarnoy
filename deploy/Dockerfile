# One image, two things in it: the ASP.NET Core API and the built Vue frontend
# it serves from wwwroot. A browser hits a single origin, so there is no CORS to
# configure and no second container to keep in step with the API's contract.
#
# The same image is also the migrator: `docker run … --migrate` applies pending
# migrations and exits, which is what a deployment runs before it replaces the
# running containers (see docs/tech/backend.md).
#
# Build from the repository root, not from deploy/:
#   docker build -f deploy/Dockerfile .

# ---------------------------------------------------------------- frontend ---
FROM node:22-alpine AS frontend

WORKDIR /src/frontend

# Dependencies first: this layer only rebuilds when the lockfile moves, not on
# every source edit.
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./

# config.ts defaults DEMO_MODE on, because `npm run dev` has no backend behind
# it. This image does — it serves the SPA and the API from one origin — so the
# bundle it bakes in has to be built with the demo simulation off, or the
# deployment never calls its own API. An arg rather than a fixed ENV so a
# demo-only build (a preview with no database behind it) is still one flag away.
ARG VITE_DEMO_MODE=false
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}

# The tile art is a git submodule. The build fails without it rather than
# quietly shipping an app with no textures, so say so plainly.
RUN test -d vendor/bg_assets_hextile/hextiles \
    || (echo "vendor/bg_assets_hextile is empty - run 'git submodule update --init' before building" >&2 && exit 1)

# hexPath.golden.test.ts (issue #159 part B) imports this fixture straight out
# of src/shared/ by relative path — it's data, not code, shared with the
# backend's own HexPathfinderGoldenTests.cs, so it lives one level above both
# src/frontend and src/backend rather than inside either. WORKDIR is
# /src/frontend, so this has to land at the /src/shared/ the relative import
# resolves to, not ./shared/.
COPY src/shared/ /src/shared/

RUN npm run build

# ----------------------------------------------------------------- backend ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend

WORKDIR /src

# Restore before copying sources, for the same layer-caching reason.
COPY src/backend/global.json src/backend/Directory.Build.props src/backend/Directory.Packages.props ./
COPY src/backend/src/Bjarnoy.Api/Bjarnoy.Api.csproj src/Bjarnoy.Api/
COPY src/backend/src/Bjarnoy.Domain/Bjarnoy.Domain.csproj src/Bjarnoy.Domain/
COPY src/backend/src/Bjarnoy.Infrastructure/Bjarnoy.Infrastructure.csproj src/Bjarnoy.Infrastructure/
COPY src/backend/src/Bjarnoy.Migrations.PostgreSql/Bjarnoy.Migrations.PostgreSql.csproj src/Bjarnoy.Migrations.PostgreSql/
COPY src/backend/src/Bjarnoy.Migrations.Sqlite/Bjarnoy.Migrations.Sqlite.csproj src/Bjarnoy.Migrations.Sqlite/
COPY src/backend/src/Bjarnoy.ServiceDefaults/Bjarnoy.ServiceDefaults.csproj src/Bjarnoy.ServiceDefaults/
RUN dotnet restore src/Bjarnoy.Api/Bjarnoy.Api.csproj

COPY src/backend/src/ src/

# The frontend must land in wwwroot *before* publish: MapStaticAssets serves
# from a manifest built during publish, so anything copied in afterwards would
# be invisible to it (and would lose the precompressed .br/.gz variants).
COPY --from=frontend /src/frontend/dist/ src/Bjarnoy.Api/wwwroot/

RUN dotnet publish src/Bjarnoy.Api/Bjarnoy.Api.csproj \
      -c Release \
      -o /app \
      --no-restore \
      /p:UseAppHost=false

# ---------------------------------------------------------------- runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    Database__Provider=Sqlite \
    Database__ConnectionString="Data Source=/data/bjarnoy.db" \
    ExposeHealthChecks=true

# SQLite deployments keep the database here; mount a volume over it. PostgreSQL
# deployments ignore it. It has to be owned by the app user before the VOLUME
# declaration, or SQLite cannot create its file at runtime.
RUN mkdir -p /data && chown -R $APP_UID:$APP_UID /data
VOLUME /data

# curl: the aspnet image ships no HTTP client at all, and an orchestrator needs
# one — the HEALTHCHECK below runs inside the container, so `docker compose
# depends_on: service_healthy` and Coolify's own status both hang on it.
#
# libfontconfig1: SkiaSharp's native libSkiaSharp.so links against
# libfontconfig.so.1, which this image does not have, so dlopen fails and every
# fog-mask request 500s with "/app/liblibSkiaSharp: cannot open shared object
# file" — a message that reads like a missing native asset but is really a
# missing dependency *of* one (the asset publishes fine, see
# runtimes/linux-x64/native/). Nothing here renders text, so
# SkiaSharp.NativeAssets.Linux.NoDependencies would also do; the stock build
# plus this package keeps the container running the same native binary the
# tests and CI do.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# /health rather than /alive: it is the readiness signal (every registered
# check), and ExposeHealthChecks above is what maps it outside development.
# The port is the one ASPNETCORE_HTTP_PORTS above pins, spelled out because a
# deployment that moves it has to move this with it.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

EXPOSE 8080

COPY --from=backend --chown=$APP_UID:$APP_UID /app .

# Which build this is, served by GET /api/v1/info so a deployment can be
# identified without guessing — the question several branch deployments running
# side by side make a real one. Last in the file on purpose: these change on
# every commit, and anything after them would be rebuilt every time. They are
# plain configuration (Build:*, see BuildInfoOptions), so `docker run -e
# Build__Commit=...` can correct a build that was stamped without them.
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_VERSION=unknown
ARG BUILT_AT=unknown
ENV Build__Commit=${GIT_COMMIT} \
    Build__Branch=${GIT_BRANCH} \
    Build__Version=${BUILD_VERSION} \
    Build__BuiltAt=${BUILT_AT}

# Non-root: nothing in here needs to write outside the data volume.
USER $APP_UID

ENTRYPOINT ["dotnet", "Bjarnoy.Api.dll"]
