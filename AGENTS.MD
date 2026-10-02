
# git / commits
- commit after each task/enclosed change/intermediate buildable state/step
- use conventional commits (feat, fix, chore, refactor, docs, test, ci, perf, style) - also use this pattern for branch names
- never use `claude/*`-style auto-generated branch names (e.g. `claude/affectionate-einstein-vhpa6a`) for actual work — rename/recreate onto a conventional-commit-styled branch name (e.g. `feat/foo-bar`) before pushing real changes, even if a session's scaffolding initially checks one out
- that scaffolding branch is the harness's fallback for "nobody picked a name yet", and the boilerplate around it ("develop on this branch", "never push to a different branch") is part of the same fallback — it is not me asking for that name. Fix it yourself and mention that you did; don't ask, and don't leave the work there because the scaffolding said so
- if a PR is already open on such a branch, the fix is still yours: push the same commits to the renamed branch, open the replacement PR, and close the old one as superseded — GitHub cannot retarget an open PR's head branch, so the move costs a PR number rather than a push
- PR titles must follow the same conventional commit format — PRs are merged via squash, so the PR title becomes the squash commit message
- u are allowed to, and should, open a PR for actual code changes (anything that modifies files in the repo — feat/fix/refactor/etc.) without needing to be asked first
- docs, answering questions, and other work that doesn't modify files in the repo does not need a PR
- when unsure whether something needs a PR, ask
- when asked to "squash this PR" (or similar, with nothing more specific said), that means squash-merge the PR via GitHub (rewriting the branch's own commit history by hand is not what's meant) — keep the branch's full commit history intact, and use GitHub's squash-merge so the PR title becomes the one resulting commit message on the base branch
- squash always means GitHub's squash-merge, never a local rewrite of history — and never force-push, on any branch, as a way to get there


# ai dev workflow
- think of a solution
- ask me if plan is fine if its more complex AND use the `TaskCreate`/`TaskUpdate`/`TaskList` task tools to list things u have to do
- any new task/request I give mid-session (not just the initial one) also needs to be put onto the task list via `TaskCreate`, not just done ad hoc off to the side
- any bug, flake, or test issue you discover mid-session (not something I asked for — something you stumbled into while doing something else) also needs its own `TaskCreate` entry so it doesn't get silently forgotten, even if you're not fixing it right away. Prefix its subject with `[BUG]`, `[FLAKE]`, or `[TEST]` as fits, e.g. `[FLAKE] WorldEndpointsTests.Foo fails intermittently`
- implement (if multiple tasks push each task as a separate commit and open PR after first push)
- evaluate with requirements (if there are reference screenshots compare them)
- run build and tests
- evaluate if ci ran green

## which model does what
- Opus and Fable are for **planning, diagnosis and review** — working out
  what's actually wrong, what to build, and whether a change is right
- once the plan is settled, hand the **implementation** to Sonnet (a
  subagent via the `Agent` tool, or by switching the session model) rather
  than writing it out on Opus/Fable — same plan, cheaper execution
- the planning model stays responsible for the result: brief the Sonnet
  subagent with the concrete file paths, line numbers and the decision
  already made (not "figure out how to fix X"), then review the diff it
  produced before committing
- don't delegate trivia — a one-line edit, a rename, or a quick test run
  costs more to hand off than to just do
- diagnosis is not implementation: while the root cause is still unknown,
  keep it on the planning model until it's actually pinned down (and
  prefer reading the code over stacking up subagent theories — an
  unverified theory that sounds plausible is worse than no theory)
- if running as sonnet and being stuck as a stronger model like opus on how to fix or debug

# bugs
- when fixing a bug add tests so we can make sure they don't come back; these tests can also be used to reproduce the bug first

# driving red CI to green
- reproduce each failing CI test locally and iterate on it there until it
  passes: run just that test (`dotnet test --filter-method`/`--filter-class`,
  `npx vitest run <file>`, `npx playwright test <spec> -g "<name>"`), not the
  full suite and not another CI round. Push only once the failing tests pass
  locally, and run the full suite once before that push (the fast checks
  plus the suites the fix touches), so a CI run is a confirmation, not the
  debugger
- read the CI log for the exact test names and errors first; don't push
  speculative fixes to see what CI says
- when a red run has several failures that are not related to each other
  (different causes, different areas), hand them to separate subagents in
  parallel, one per cause, each reproducing and fixing its own failure
  locally; failures that share a cause (e.g. one moved demo seed breaking
  several e2e specs) stay with one agent. Give each agent its own worktree
  or its own files so they don't edit the same code, and merge their
  fixes into one validated push

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
- when asking me for the go-ahead, judge the fix's complexity from what
  you already read to diagnose it (the failing log/test, the code path
  it touches).
  Include that judgment and ask me which model to run the fix with:
  Sonnet is the default for anything you assess as a simple/localized
  fix; suggest Opus or Fable when you assess it as architecturally
  complex or ambiguous. If the codebase area is unfamiliar rather than
  just the fix being complex, use a quick Explore-agent read to orient
  yourself first — that's research, not a complexity rating, and only
  worth it when you're actually lost
- a failure that a rerun clears counts as **flaky**, not "unrelated" —
  flaky still means broken and gets fixed like any other bug (same
  ask-first + dedupe-check + own-PR flow above), it does not stand down
  just because a rerun happened to pass

# scheduled check-ins / send_later
- don't poll on a fixed timer for something only I can unblock. A recurring
  `send_later`/check-in that re-reads a PR every hour is expensive: each
  firing pays the full fixed cost of the session (system prompt, skill
  listing, tool definitions) plus every read call it makes, even when the
  answer is "nothing changed" every single time
- if a PR is blocked on a decision only I can make (which of two options to
  take, whether to run a destructive/administrative action), a scheduled
  check-in adds nothing — my reply already resumes the session the moment I
  send it, no timer required. Say what you're waiting on and stop; don't
  arm a check-in at all
- only schedule a recurring check-in for state that can change on its own,
  without my input (an external CI run finishing, a rerun you were told to
  watch, a rate limit or quota clearing on a known schedule), and match the
  interval to how fast that state actually changes — not a blanket hourly
  default
- prefer an event-driven subscription (e.g. `subscribe_pr_activity` for
  CI/review activity) over polling wherever the thing you're watching can
  push a real event instead of being polled
- if 3 consecutive check-ins land with nothing changed, stop silently
  re-arming — surface it instead: use the `AskUserQuestion` tool to ask me
  directly whether to keep waiting, change the interval, or drop it, rather
  than looping quietly forever on a blocker that clearly isn't resolving
  itself

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
  need a working Docker daemon — which this sandbox has, see the Docker
  bullet below.)
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
  That clone is **read-only for an agent**: the tile renders and atlases in
  `bg_assets_hextile` are made by me, by hand, on my desktop (see the
  3D_assets repo's AGENTS.md). Don't render, re-pack or push new art there,
  and don't bump this repo's submodule pointer to art an agent built — if a
  change needs new art, say which tiles and leave the render to me.
  Use the commit the submodule pins (`git ls-tree HEAD
  src/frontend/vendor/bg_assets_hextile`), not the clone's default branch:
  the pinned commit can be newer than the default branch, and an older
  snapshot makes tests that depend on the art (e.g. `wastedIsland.test.ts`'s
  giant clips) fail for no reason in the code
  (`git fetch --depth 1 origin <sha> && git checkout <sha>` in the clone).
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
  The daemon does not survive a session restart/resume, so start it again
  after one (every Docker-backed test then fails fast at container start).
  If `dockerd` then exits with `failed to start containerd: timeout waiting
  for containerd to start` / "containerd is still running", it's a stale pid
  file from the previous container lifetime — remove it and start again:
  `sudo rm -f /var/run/docker/containerd/containerd.pid /var/run/docker.pid`.
  **Image pulls from Docker Hub work** (verified 2026-10-01: `hello-world`,
  `postgres:18-alpine`, `testcontainers/ryuk` all pull and run), so the
  Docker-dependent suites run for real here — "no Docker in the sandbox" is
  not a valid reason to skip them or defer them to CI:
  - `dotnet test --project tests/Bjarnoy.Api.IntegrationTests` (from
    `src/backend`) — Testcontainers starts a real PostgreSQL container.
    `PostgreSqlFixture` silently **skips** its tests instead of failing when
    the container can't start, so check the summary says `skipped: 0`
    before claiming the Postgres half was covered.
  - `Bjarnoy.AppHost.Tests` (full Aspire orchestration: Postgres container +
    API + Vite dev server + .NET Playwright Chromium) also passes, but needs
    the same prep as CI's `aspire-e2e.yml`, otherwise it just hangs until
    timeout waiting for the `frontend` resource: `npm ci` in `src/frontend`
    and the vendored `bg_assets_hextile` art (see above). No
    `playwright.ps1 install` needed — `Microsoft.Playwright` 1.56 finds the
    pre-installed `/opt/pw-browsers/chromium-1194` via
    `PLAYWRIGHT_BROWSERS_PATH`. Run it from
    `src/backend/tests/Bjarnoy.AppHost.Tests` with **`CI=true dotnet test`**;
    a single class can be targeted with
    `CI=true dotnet test -- --filter-class "*ChatFlowTests"`. The suite
    shares one Aspire stack (`AppHostFixture`): it seeds `gamedb` once,
    snapshots it, and restores the snapshot + restarts the API before every
    test, so each test still starts from a fresh database. `CI=true` keeps
    the run identical to the `aspire-e2e` job: without it `AppHost.cs`
    treats the run as local dev and adds a persistent Postgres volume and
    container plus pgAdmin, which the fixture's own setup works around but
    CI never exercises (verified 2026-10-01 with `CI=true`: 12/12 pass,
    ~10 min).
  If a pull ever does come back `403 Forbidden`, that's an egress-policy
  change for that session (see `/root/.ccr/README.md`): don't route around
  it, say so, and rely on CI — but try the pull first rather than assuming.
- `npx playwright test` (the real `e2e/*.spec.ts` suite, not just a
  throwaway screenshot script) **does work in this sandbox**, including
  actually launching a browser — don't conclude otherwise just because
  `npx playwright install` fails (it tries to hit
  `cdn.playwright.dev`/`playwright.download.prss.microsoft.com`, blocked by
  the egress proxy the same way the .NET CDN is) or because there's no
  `chromium-browser` binary via apt/snap. A working Chromium is
  pre-installed at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` is
  already set to it) — the catch is that its bundled revision
  (`chromium-1194`) often doesn't match the exact browser revision the
  project's pinned `@playwright/test` version expects, so the default
  project config's `chrome-headless-shell` launch fails with "Executable
  doesn't exist at .../chromium_headless_shell-<other number>". Point the
  launch at the real, present binary instead of the mismatched shell one:
  add `launchOptions: { executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }` (check the exact
  folder name under `/opt/pw-browsers` first, it can differ) to the
  `chromium` project's `use` block in `playwright.config.ts` **locally,
  uncommitted, for the duration of your own verification run only** —
  revert it before committing, it's a sandbox-path hack, not a real repo
  fix (CI has its own correctly-versioned browser install and doesn't need
  this). Do this before claiming e2e changes are unverified.
- the e2e `webServer` only **serves** `dist/` (`vite preview`), it never
  builds it, and locally (`reuseExistingServer` outside CI) it reuses
  whatever is already listening on port 4173. So run `npx vite build` in
  `src/frontend` before every local e2e run after a code change, and make
  sure no stale `vite preview` (yours from an earlier run, or one serving
  another worktree's `dist/`) is still on 4173 (`fuser -k 4173/tcp`) —
  otherwise the run quietly tests old code, passes or fails for reasons
  the current diff doesn't have, and CI (which always builds fresh)
  disagrees with it.

# screenshot helpers
- `scripts/screenshot-helpers/flow.mjs` drives the demo-mode onboarding path
  (landing → world map → landfall → settlement view, plus a panned/hover
  settlement shot) in one Playwright run and screenshots every stop — use
  this instead of re-deriving the click path from scratch each time a UI
  change needs visual verification. See `scripts/screenshot-helpers/README.md`
  for setup and usage.
