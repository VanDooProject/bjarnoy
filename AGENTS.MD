
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

# screenshot helpers
- `scripts/screenshot-helpers/flow.mjs` drives the demo-mode onboarding path
  (landing → world map → landfall → settlement view, plus a panned/hover
  settlement shot) in one Playwright run and screenshots every stop — use
  this instead of re-deriving the click path from scratch each time a UI
  change needs visual verification. See `scripts/screenshot-helpers/README.md`
  for setup and usage.
