# bjarnoy
Bjarnoy / fjordhold

# file structur (for now/start)

```
- legacy/browsergame (c# from 2019, not even on net7, but this backend has already a few features)
- legacy/backend (old backend from 2025, needs to be updated to newest dotnet and aspire, this is sadly primarily a skeleton)
- legacy/frontend (old angular frontend from 2025, just preserved history)

- src/frontend (current Vue 3 + TS + Vite frontend, see src/frontend/README.md)
- src/backend (current .NET 10 + Aspire backend, see docs/tech/backend.md)
- src/shared (data, not code, shared by both — currently just the river-pathing golden fixture read by HexPathfinderGoldenTests.cs and hexPath.golden.test.ts, issue #159 part B)

- deploy (Dockerfile: builds the frontend into the backend, one image)

- prototypes (ideas from e.g claude design)

- docs (general docs for game related stuff)
- docs/tech (docs for e.g deployment, dev, ...)
```

# game
 there are 2 game types:
 - Fjørdhold: a quick round based game which should run from about 3 to 20 minutes
 - Bjarnoy: a real time browsergame like travian which should run about 6months to 2 years

## setting
see game mechanics in  ./prototypes/MECHANICS.md

# database
the round based one should be able to be run with sqllite or litedb but also postgres if hosted for multiple players/worlds/tenants; sqllite should also support multiple worlds for sure but should be able to be a single docker container for everything
the realtime browsergame variant is focused on postgres but should maybe also work with the local file dbs for dev (performance) reasons (when not using aspire)

# running it

```bash
git submodule update --init      # tile art for the frontend

# everything at once - postgres, api, vite dev server, one dashboard
cd src/backend && dotnet run --project src/Bjarnoy.AppHost
```

See [docs/tech/backend.md](docs/tech/backend.md) for the backend on its own, the
migrator, and the container image.
