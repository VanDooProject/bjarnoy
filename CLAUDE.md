# Agent notes

- Do not make rendering/behavior code branch on "are we in a test/CI
  environment" or "is this a software (non-GPU) renderer" as a way to make
  e2e tests pass faster or more reliably. That makes the code path under
  test diverge from the code path real users get, which defeats the point
  of the test. Fix real perf problems (cheaper algorithms, smaller/cached
  work, lower default cost) so the *same* code is fast everywhere, rather
  than detecting the test/CI environment and skipping expensive work only
  there.

# Sandbox tooling (Claude Code cloud sessions)

- The cloud sandbox does **not** come with the .NET SDK preinstalled, and
  Microsoft's own CDN (`builds.dotnet.microsoft.com`, used by
  `dotnet-install.sh`/`dot.net/v1/dotnet-install.sh`) is blocked by the
  sandbox's egress proxy — don't bother with the official install script.
  It **is** installable via Ubuntu's own apt archive instead, and this
  actually works:
  ```bash
  sudo apt-get update
  sudo apt-get install -y dotnet-sdk-10.0   # matches src/backend/global.json
  ```
  Do this before claiming backend changes are unverified — `dotnet build`/
  `dotnet test` against `src/backend/Bjarnoy.slnx` should run for real, not
  be skipped with a "no SDK in this sandbox, please let CI confirm" note.
  (The PostgreSQL half of the integration suite and `Bjarnoy.AppHost.Tests`
  still need a working Docker daemon, which this sandbox doesn't have —
  those still skip/fail for that unrelated reason.)
- Blender is installable the same way (`sudo apt-get install -y blender`)
  for anything touching 3D/tile-art asset work.
