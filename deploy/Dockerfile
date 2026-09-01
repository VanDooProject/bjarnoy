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

EXPOSE 8080

COPY --from=backend --chown=$APP_UID:$APP_UID /app .

# Non-root: nothing in here needs to write outside the data volume.
USER $APP_UID

ENTRYPOINT ["dotnet", "Bjarnoy.Api.dll"]
