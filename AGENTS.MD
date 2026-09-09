
# git / commits
- commit after each task/enclosed change/intermediate buildable state/step
- use conventional commits (feat, fix, chore, refactor, docs, test, ci, perf, style) - also use this pattern for branch names
- PR titles must follow the same conventional commit format — PRs are merged via squash, so the PR title becomes the squash commit message
- when asked to "squash this PR" (or similar, with nothing more specific said), that means squash-merge the PR via GitHub (rewriting the branch's own commit history by hand is not what's meant) — keep the branch's full commit history intact, and use GitHub's squash-merge so the PR title becomes the one resulting commit message on the base branch
- squash always means GitHub's squash-merge, never a local rewrite of history — and never force-push, on any branch, as a way to get there


# ai dev workflow
- think of a solution
- ask me if plan is fine if its more complex AND use the `TaskCreate`/`TaskUpdate`/`TaskList` task tools to list things u have to do
- implement (if multiple tasks push each task as a separate commit and open PR after first push)
- evaluate with requirements (if there are reference screenshots compare them)
- run build and tests
- evaluate if ci ran green

# bugs
- when fixing a bug add tests so we can make sure they don't come back; these tests can also be used to reproduce the bug first

# unrelated/pre-existing CI failures found while driving a PR to green
- if a PR you're driving to green has a CI failure unrelated to that PR's
  own diff (confirmed pre-existing, e.g. it also fails on `main` at the
  PR's own base commit), do not fix it inside that PR — it stays scoped to
  its own change
- before starting any fix work for it, **ask me first** — don't just spin
  up a fix on your own initiative for an unrelated failure, test flake, or
  CI issue you stumbled into. Tell me what's failing and why you think
  it's unrelated, and wait for a go-ahead
- once I say go: check for an existing open PR (and existing branches)
  already fixing that same test/CI issue before starting — search open PRs
  by title/branch/linked test name. If one already exists, don't start a
  duplicate fix; either help drive the existing one or say so. This matters
  most when multiple agents/sessions could be working in parallel — two
  agents racing to fix the same known-broken test wastes work and risks
  conflicting fixes
- if no existing PR covers it, you're allowed to spin off a new,
  independent PR for just that fix: branch off latest `main` (not off the
  PR branch that surfaced it), fix + test it there, open its own PR, drive
  it to green, then squash-merge it via GitHub
- afterwards, update the original PR by merging `main` back into its branch
  so it picks up the fix (see "squash always means GitHub's squash-merge"
  above for how the merge lands on `main`)

# tests
- tests need to be meaningful and not test third party stuff
- for e2e tests increasing timeouts is usually not the fix for an issue, most of the time its wrong/broken selectors
- do not make rendering/behavior code branch on "are we in a test/CI
  environment" or "is this a software (non-GPU) renderer" as a way to make
  e2e tests pass faster or more reliably. That makes the code path under
  test diverge from the code path real users get, which defeats the point
  of the test. Fix real perf problems (cheaper algorithms, smaller/cached
  work, lower default cost) so the *same* code is fast everywhere, rather
  than detecting the test/CI environment and skipping expensive work only
  there.

# interaction between u (AI) and user (me)

## github cloud agent
- add screenshots to PR comments

## CLAUDE
- ask questions if anything is unclear or you need more context
- if u take screenshots always show the in chat to me too
- for planning u can use a opus or fable subtask/subagent

# sandbox tooling (Claude Code cloud sessions)
- the cloud sandbox does **not** come with the .NET SDK preinstalled, and
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
  need a working Docker daemon.)
- Blender is installable the same way (`sudo apt-get install -y blender`)
  for anything touching 3D/tile-art asset work.
- `src/frontend/vendor/bg_assets_hextile` is a gitignored submodule
  checkout of the private `VanDooProject/bg_assets_hextile` repo — without
  it populated, the terrain/building texture atlases fail to load
  (`atlas.ts: no vendored pages found for atlas category "..."`), which
  silently blocks any real rendering in settlement mode (landing page
  included, since founding previews live settlement-view tile art) and,
  in dev, a hard Vite import-resolution error for anything that imports
  `buildingArt.ts`'s static PNG imports. **In a Claude Code cloud session,
  this is fixable, not just a "can't verify, rely on CI" dead end**: call
  the `add_repo` tool (`mcp__Claude_Code_Remote__add_repo`, owner
  `VanDooProject`, repo `bg_assets_hextile`, access `read`) — it's a
  private repo the org has already granted this integration access to —
  then follow its own returned clone instructions (a single, generously
  timed `git clone --depth 1 ...` to a scratch path, per its own
  anti-concurrency warnings), then copy `hextiles/`, `atlas/`, and
  `README.md` from that clone into `src/frontend/vendor/bg_assets_hextile/`.
  Do this before claiming frontend UI/rendering changes are unverified —
  `npx vite --port 5183` plus `scripts/screenshot-helpers/flow.mjs` (or a
  throwaway Playwright script) should actually render tile art and be
  screenshotted for real, not skipped with a "no vendored assets in this
  sandbox" note.
- Docker (client + `dockerd`) is already installed in the cloud sandbox, but
  the daemon isn't running by default, and `service docker start`/
  `/etc/init.d/docker` fails with a `ulimit: error setting limit (Operation
  not permitted)` sandbox restriction. Start it directly instead:
  ```bash
  sudo dockerd > /tmp/dockerd.log 2>&1 &
  sleep 5 && docker info   # confirm it came up
  ```
  This gets you a running daemon, but it's still not useful for
  `Bjarnoy.AppHost.Tests`/Postgres-backed integration tests here: pulling
  any image (`docker run hello-world`, `postgres`, etc.) fails with a `403
  Forbidden` from Docker Hub's CDN — the sandbox's egress proxy doesn't
  allow that host for this session. Per the proxy's own guidance
  (`/root/.ccr/README.md`), a 403 is an org policy denial, not a bug — don't
  retry or try to route around it. So those Docker-dependent test suites
  still can't be run/reproduced locally in this sandbox; say so rather than
  claiming to have verified them, and rely on CI for that coverage.

# screenshot helpers
- `scripts/screenshot-helpers/flow.mjs` drives the demo-mode onboarding path
  (landing → world map → landfall → settlement view, plus a panned/hover
  settlement shot) in one Playwright run and screenshots every stop — use
  this instead of re-deriving the click path from scratch each time a UI
  change needs visual verification. See `scripts/screenshot-helpers/README.md`
  for setup and usage.