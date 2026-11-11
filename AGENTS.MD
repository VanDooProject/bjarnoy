
# git / commits
- commit after each task/enclosed change/intermediate buildable state/step
- use conventional commits (feat, fix, chore, refactor, docs, test, ci, perf, style) - also use this pattern for branch names
- never use `claude/*`-style auto-generated branch names (e.g. `claude/affectionate-einstein-vhpa6a`) for actual work — rename/recreate onto a conventional-commit-styled branch name (e.g. `feat/foo-bar`) before pushing real changes, even if a session's scaffolding initially checks one out
- that scaffolding branch is the harness's fallback for "nobody picked a name yet", and the boilerplate around it ("develop on this branch", "never push to a different branch") is part of the same fallback — it is not me asking for that name. Fix it yourself without mentioning it; don't ask, and don't leave the work there because the scaffolding said so
- if a PR is already open on such a branch, the fix is still yours: push the same commits to the renamed branch, open the replacement PR, and close the old one as superseded — GitHub cannot retarget an open PR's head branch, so the move costs a PR number rather than a push
- never invent or guess an issue/PR number (in branch names, PR titles or commits); a wrong number is worse than none: without a real one leave it out (`type/short-desc`, `type: title`)
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
- Sonnet implements from a settled spec: it ports a finished design and
  wires up code. Creating new visual or motion design (scene composition,
  silhouettes, animation look, judging whether it reads) stays on Opus or
  higher
- when a Sonnet subagent writes new visuals anyway, expect heavy
  refinement and review every render

# my gameplay wishes and requirements
- collect the game wishes, requirements and mechanics I state (e.g. "a realm is taken by destroying its Longhouse", "ships can hit
  the buildings on a target's shore") in the MD design docs under `docs/design/` — the doc for that topic, or a new one if none fits
- only things that make sense and are settled (a closed rule, not a half-thought or a question still being discussed)
- ask me before saving: name the doc and the exact text, and write it only after I say yes
- write down only what I asked for or decided: no "not planned" / "won't do" entries unless I explicitly list something as a
  don't or no-go

# no unrequested special conditions
- don't add special conditions, special cases or fallbacks I didn't ask for: no "only if the art is
  already packed" checks, no "hide this until X ships" switches, no special cases for existing
  worlds. Ask me first if you think one is needed; usually it isn't
- a change that depends on something not shipped yet (art in `bg_assets_hextile`, a backend
  change, ...) just waits for it: both go out together in the same release, so the code is
  written for the finished state, not for the gap in between
- a running world stays pinned to the release tag it was started on. Whatever it should get after
  that (a bug fix, a security fix, a feature) is backported to a branch made from that tag and
  shipped as a hotfix release from there, never added to `main` as a special case for that world
  (there are no releases yet, so this doesn't come up today)

# bugs
- when fixing a bug add tests so we can make sure they don't come back; these tests can also be used to reproduce the bug first
- a session for resolving a bug reviews its own fix automatically, without being asked: once the fix and its tests are done,
  hand the diff to an Opus subagent (`Agent` tool, `model: opus`) for review, and address what it finds
- if the review is good (no open blocking findings after the fixes) and everything is done and CI is green on the current
  head, squash-merge the PR via GitHub without waiting for a further go-ahead (squash rules above). If the review is not
  good, or CI is red, don't merge: fix it, or tell me what blocks

# SONNET: check before and after every push (explicit, not optional)
- Sonnet has repeatedly pushed code that CI rejected on lint or type errors it never ran locally. The rules below are for
  Sonnet (any session running as Sonnet, including Sonnet subagents); stronger models follow them too, but Sonnet must not skip them
- **before every push**, run locally what CI's `build` job runs, in `src/frontend`: `npm run lint` (eslint over `src/**/*.vue`,
  including `@intlify/vue-i18n/no-raw-text`: no literal text/symbols in templates), `npx vue-tsc -b` (type-checks the test
  files too; a bare `vue-tsc --noEmit` does not), `npm run test:unit` for what you touched, and `npm run build`. Backend:
  `dotnet build Bjarnoy.slnx` and the test projects the change touches. A file-path argument to eslint is not the project
  lint (it ignores non-`.vue` files); use `npm run lint`
- run `npm ci` in `src/frontend` before `vue-tsc`/lint on a fresh checkout, and stage explicit paths (`git add <files>`), never
  `git add -A` over `src`: a type-check without installed deps can emit `.js` files next to the sources, and they get committed
- **after every push**, check the PR's CI yourself (`get_check_runs` on the PR) — don't report "pushed" and stop, and don't wait
  for me to ask. Read the log of every failed job (`get_job_logs`), reproduce the failure locally, fix, push, check again
- iterate until the `build` checks (frontend `build`, Docker `build`, `build-and-test`, lint) are green. Other jobs (e2e, aspire-e2e)
  that are still queued/running are reported as such; a red one gets the same read-log, reproduce, fix loop. Failures that are
  provably unrelated to the PR follow the "unrelated/pre-existing CI failures" rules below instead
- when reporting, state what CI says (job names and conclusions), not what was run locally. Never write "CI should be fine"

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
- this applies to any new failure, flake or test issue you didn't cause,
  not only ones found while driving a PR to green. **First** check whether
  something already covers it: open PRs and branches (title, branch, test
  name) and open/related sessions (`list_sessions`, `list_events` on the
  ones that look related). Two agents racing to fix the same known-broken
  test wastes work and risks conflicting fixes
- if one covers it, don't start a fix and don't ask me about one: add what
  you found (repro steps, failing test names, logs, suspected root cause)
  to that PR as a comment, or to that session via `send_message`, so the
  agent already working on it can fix it faster. Then say which PR or
  session has it
- only if nothing covers it: log it (`TaskCreate`, `[BUG]`/`[FLAKE]`/`[TEST]`),
  and **ask me before starting any fix work** — don't spin up a fix on your
  own initiative. Tell me what's failing and why you think it's unrelated,
  and wait for a go-ahead
- once I say go, and nothing covers it, you're allowed to spin off a new,
  independent PR for just that fix: branch off latest `main` (not off the
  PR branch that surfaced it), fix + test it there, open its own PR, drive
  it to green, then squash-merge it via GitHub
- exception to "CI green before squash-merge": a PR may be squash-merged with a red job when the only failure is **one single
  test** that is a known flake or pre-existing failure on `main` AND an open session or PR is already working on that fix
  (confirmed via the dedupe check, say which one). Everything else is green. Two or more failing tests, or any failure the
  PR's diff could have caused, means wait for the fix. No re-running the job to get there
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

# orchestrating other sessions
- when I ask you to orchestrate work (fan out, hand off, drive several
  PRs), use the session tools (`create_session`, `send_message`,
  `list_sessions`, `get_session`, `list_events`, ...) rather than doing
  everything inside this one session
- if another open PR collides with or blocks the current work (overlapping
  files, a fix we depend on, a paused/stalled PR), offer to send its
  session a message so it continues (rebase, finish, unblock). Ask first;
  don't message it on your own
- for test failures, CI/CD problems, flakes and similar side work, offer to
  start a new session for it instead of fixing it here, so the main PR
  stays scoped to its own change. This is the same ask-first + dedupe-check
  flow as "unrelated/pre-existing CI failures" above, just run in its own
  session
- when you find new details about a bug another session is already working
  on (repro steps, failing test names, logs, root cause), send them to that
  session as an informational message
- create new sessions with the bjarnoy repo as source
  (`source_url: https://github.com/VanDooProject/bjarnoy`) so they show up
  in the bjarnoy section, not as loose sessions
- prefix the title of every session you create with `[AI] ` (e.g.
  `[AI] fix flaky WorldEndpointsTests`)
- before starting a new session for side work (a fix, a flake, a
  follow-up), or offering to start one, check the open sessions
  (`list_sessions`, and `list_events` on the ones that look related) and
  the open PRs and branches for one that already covers it. If one does,
  send it what you know instead of starting a second one
- if you already know from your own session that another session or PR
  covers it, don't offer a new session for it at all; say which session
  or PR has it
- a session started for side work runs the same check itself before it
  changes anything, and reports back instead of duplicating the work when
  something already covers it

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
- no retries of test runs: don't re-run a failing test (or the suite) hoping it passes, don't enable test retries
  (`retries` stays 0 in `playwright.config.ts`), and don't re-trigger a red CI job to get a green. A failure gets read,
  reproduced and fixed. A pass after a re-run means the test is flaky, not that it's fine
- the one use of repeated runs: validating a fix. Once a flake or intermittent failure is fixed, run the affected test
  repeatedly (e.g. `--repeat-each 5`) to show it's no longer flaky. Not for diagnosing, not as a substitute for finding the cause
- do not make rendering/behavior code branch on "are we in a test/CI
  environment" or "is this a software (non-GPU) renderer" as a way to make
  e2e tests pass faster or more reliably. That makes the code path under
  test diverge from the code path real users get, which defeats the point
  of the test. Fix real perf problems (cheaper algorithms, smaller/cached
  work, lower default cost) so the *same* code is fast everywhere, rather
  than detecting the test/CI environment and skipping expensive work only
  there.
- the one allowed exception is an **explicit, per-spec** opt-out that flips a
  switch a real user or developer can flip too, set from the spec's side, with
  no app code knowing it is under test: `test.use({ mapLayers: { water: false, fog: false } })`
  (the water/fog debug switches) and the suite's `antialias: 'off'` (the player's
  "Smooth edges" setting), both in `src/frontend/e2e/fixtures.ts`. Water/fog
  opt-out only for specs whose assertions are DOM/game state; never for
  water/fog/shore specs or anything that judges map pixels as an image
  (`src/frontend/src/test/e2eWaterOptOut.test.ts` enforces this; a spec that plays
  real motion needs a recorded user approval there). It doesn't
  replace fixing real perf problems for slow devices.

# dev docs and player docs
- the **dev docs** (also called MD docs) are the Markdown files under `docs/design/`: the full rules, numbers, formulas and
  technical detail. The **player docs** are the in-game `/docs` pages (https://bjarnoy.velarix.space/docs, below): the same
  rules, much shallower, with almost no technical detail
- a change to a rule, a number or what can be built where updates the dev docs in the same PR (the gameplay-wishes rule above
  still applies to new wishes: ask before writing them down)
- keep the two in sync: when one changes, check the other says the same (at the player docs' depth) and update it in the same PR
- when they don't match (one says something the other contradicts, or a player page states a rule the dev docs don't have),
  tell me and let me decide which is right. Don't pick one silently. Only stop the work for it when the answer decides the
  implementation; otherwise report it and carry on

# in-game docs (/docs)
- `/docs` and its pages are **player docs**: what a player needs to play — rules, numbers, what can be built where, what things look like.
  write from the player's side ("you can build ... on ..."), not from the code's
- technical/admin content is hidden from players: how the map generator lays things out (e.g. how bogs are created),
  generation thresholds, art-pipeline notes ("drawn with the X art until its own is ready", "cut into seven pieces so ..."),
  dev status notes. Put it in `DocsAdminNote` (`src/frontend/src/components/docs/DocsAdminNote.vue`); only admins see it,
  behind the docs header toggle (`useDocsAdminNotes`). Never mix such a sentence into a player paragraph — give it its own
  i18n key (e.g. `...artNote`, `...techNote`) and render it in a `DocsAdminNote` next to the player text
- building links: the first mention in prose links (with icon and preview); the building in a table's first column always links
- a docs page shows what the game actually draws: looks the generator never picks (e.g. the plain bog moss, retired in
  `RETIRED_BOG_VARIANTS`) don't appear in pickers either
- example maps (`BogIsland`, `WastedIsland`, `WallExample`) go above the per-tile entries they illustrate: the whole
  first, then the pieces
- a new page joins the shared page list `src/frontend/src/lib/docs/docsPages.ts` (hub group and order, art, header art
  style, related pages with a reason each; hub, breadcrumb, previous/next and the Related footer all read it) and the
  routes in `src/frontend/src/router/index.ts`, and gets en + de text in `src/frontend/src/i18n/locales/{en,de}/docs.json`
- page art: no big picture on top of a page; the header shows the page's art as a small icon beside the title (pages
  about one tile or building) or a faded backdrop (the others; phones always use the icon)

# German text (de locale)
- write German the way a native speaker writes a game's help pages — not a translation of the English sentence. Restructure
  freely; keep the meaning (rules, numbers, conditions) exact
- address the player with "du", active voice, short sentences. Avoid "Das Spiel ..." as a subject and passive chains
  where a "du" sentence works: "Das Spiel warnt dich, wenn du einen setzt." → "Willst du dort trotzdem einen Turm bauen,
  warnt dich das Spiel vorher."
- avoid English calques and colon/semicolon chains: "hält das Land" → "beansprucht das Land", "Looks" → "Varianten",
  "Zeig auf ein Hexfeld" → "Fahr mit der Maus über ein Feld"
- keep terms consistent with the in-game names in `src/frontend/src/i18n/locales/de/catalogue.json` (e.g. Ziegelei, not
  Lehmziegelei); "Feld" in rules text, "Kachel" only where the UI already uses it; "Armee", not "Heer" (lore text aside);
  "Techbaum"
- typography: „…" quotes, – as dash, correct spelling ("platzieren")
- new or changed English text gets its German counterpart in the same commit, written to these rules, not machine-literal

# code reuse
- never implement the same behaviour twice or differently in two places
  (e.g. a component's mount + open/close animation wired one way in
  `MapView.vue` and another way in `LandingView.vue`). Put it in one
  shared place (the component itself, a wrapper component or a
  composable) that every caller uses
- a fix for something that's used in more than one place goes into that
  shared place, not into each caller; if you find two diverging copies
  while working, unify them in your change or open a task for it

# UI changes
- every UI change follows `docs/design/ui-guidelines.md` (no leftover
  actions, no links back into finished flows, no chrome without
  information on phones, safe areas, every enter has a leave, one
  implementation per behaviour, real-touch gestures)
- apply it in the same PR as the change: when a flow changes, check the
  surfaces around it for what the change made stale (old buttons, links,
  reserved space, copy) and remove it right away — don't leave it for a
  later cleanup pass
- when a change reveals a new kind of recurring UI leftover, add the rule
  to `docs/design/ui-guidelines.md`

# interaction between u (AI) and user (me)

## github cloud agent
- add screenshots to PR comments

## CLAUDE
- ask questions if anything is unclear or you need more context
- a decision with a few clear options (pick a rule variant, yes/no on a proposal, which of two fixes) goes through the
  `AskUserQuestion` tool, several questions in one call, recommended option first — not as a numbered prose list I have to
  answer by retyping it. Context the question needs goes into the question itself or into the chat text right before it.
  Open questions that need my own words (what something should be called, a new rule) stay in the chat
- that holds everywhere a choice comes up, not only mid-task: the open questions at the end of a plan or report, the
  `user decision` rows of the state table, a list of recommended options. Ask them with `AskUserQuestion` in the same turn,
  before handing back; writing "recommended option first" in prose instead is the thing this rule forbids
- if u take screenshots always show the in chat to me too
- for planning u can use a opus or fable subtask/subagent
- artifacts that go through rounds (UX reviews, design options, motion
  demos, ...) keep every earlier round viewable: publish the new round as
  its own page or section in the same artifact and link the rounds to each
  other — never overwrite or delete an earlier round's content when
  publishing the next one, I still compare against it
- artifacts with motion (animations, motion demos, story beats, ...) loop by
  default and ignore `prefers-reduced-motion` by default (full motion); a
  toggle inside the page switches to the reduced-motion version — I can't
  change that setting on my machine, so the reduced-motion path has to be
  viewable there
- don't report that you followed one of these rules (e.g. "renamed the
  branch because of the naming rule") — that's expected. Only tell me when
  you did **not** follow a rule, and why

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
    and the vendored `bg_assets_hextile` art (see above).
    `playwright.ps1 install` is blocked by the egress proxy, and
    `Microsoft.Playwright` 1.62 launches
    `$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
    while the sandbox image ships another revision of the same layout
    (`/opt/pw-browsers/chromium_headless_shell-1243/...` as of 2026-11-11).
    Without a fix every test fails within seconds with
    "Executable doesn't exist at .../chromium_headless_shell-1234/...".
    Link the present revision to the one it asks for (sandbox-only, nothing
    to commit; check the revision numbers in the error and under
    `/opt/pw-browsers` first):
    ```bash
    sudo ln -sfn /opt/pw-browsers/chromium_headless_shell-1243 \
      /opt/pw-browsers/chromium_headless_shell-1234
    ```
    Run it from
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
  (`chromium-1243` as of 2026-11-02) often doesn't match the exact browser revision the
  project's pinned `@playwright/test` version expects, so the default
  project config's `chrome-headless-shell` launch fails with "Executable
  doesn't exist at .../chromium_headless_shell-<other number>". Point the
  launch at the real, present binary instead of the mismatched shell one:
  add `launchOptions: { executablePath:
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' }` (check the exact
  folder names under `/opt/pw-browsers` first, they change with the image) to the
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

# before pausing or stopping
- when a turn ends with something still open (u hand control back while waiting on CI, tests, subagents, a decision of mine or an
  action of mine, or the session ends), give me a minimal state table so I can see at a glance what is still open
- that is the table's place: the end of a turn that waits. Not on an event or notification that needs no action, not mid-turn status
  messages, and not when nothing changed since the last table
- unchanged means unchanged for the table **and** its questions: don't repeat either while nothing in them changed. A turn that
  only answers a nudge (a stop hook that sees uncommitted changes while a subagent is still editing, a notification that needs
  nothing) gets one line saying what is still running, no table, no questions
- proposals and questions stay in the chat; written once and not repeated, they don't get buried
- one row per piece of work (PR, task, test run, subagent, ...), with just these columns: what, state, waiting on
  - state: `done`, `open work` (something is still for u to do), or `waiting`
  - waiting on: `tests`, `CI`, `subagents`, `user decision` (a choice to make), `user action` (something only I can do, e.g. a
    deploy or a setting), or `-` when nothing
  - for waiting on CI, tests or subagents add the expected time in brackets, e.g. `CI (~5 min)`
- keep it to the rows that matter: no prose recap, no finished work that needs nothing further, and
  say `nothing open` instead of an empty table
- for every row waiting on `user action`, add a short line after the table with the exact steps, so I can act without
  scrolling back. A row waiting on `user decision` gets a one-line pointer to the question, and the question itself goes
  through `AskUserQuestion` (see "## CLAUDE") in the same turn — when it is new or has changed; a question already asked and
  still unchanged is neither written nor asked again
- example:

  | what | state | waiting on |
  |---|---|---|
  | PR 384 walls docs | waiting | CI (~5 min) |
  | walls atlas page | waiting | subagents (~10 min) |
  | AGENTS.MD state table | open work | - |
  | gate rule golden case | waiting | user decision |

  user decision: gate rule golden case - threshold question asked via `AskUserQuestion`

# screenshot helpers
- `scripts/screenshot-helpers/flow.mjs` drives the demo-mode onboarding path
  (landing → world map → landfall → settlement view, plus a panned/hover
  settlement shot) in one Playwright run and screenshots every stop — use
  this instead of re-deriving the click path from scratch each time a UI
  change needs visual verification. See `scripts/screenshot-helpers/README.md`
  for setup and usage.

# debugging a deployed world with an API key
- to read or change a running deployment's worlds (not the local dev stack), request a scoped API key instead of asking me for a password — the whole flow is in `docs/tech/api-keys.md`
- ask for the least you need: only the features (`GET /api/v1/api-keys/features`) and worlds the task touches, `Read` unless you must write, a short lifetime (60 min) — I can widen it on approval
- request it, then show me the `userCode` and `approvalUrl` from the response and poll the token endpoint every `pollIntervalSeconds` until I approve:
  ```bash
  curl -sX POST https://<host>/api/v1/api-key-requests -H 'Content-Type: application/json' -d '{
    "name":"claude <task>", "purpose":"<what you need to find out>",
    "description":"Claude Code session for <user>", "contextUrl":"<this session url>",
    "features":{"worlds":"Read","settlements":"Read"}, "allWorlds":false, "worldIds":["<worldId>"],
    "lifetimeMinutes":60}'
  curl -sX POST https://<host>/api/v1/api-key-requests/<id>/token -H 'Content-Type: application/json' -d '{"pollSecret":"<pollSecret>"}'
  ```
- to act as a player (build, dispatch, ...) put the account in `ownerUserName`; I pick the owner on approval
- send it as `Authorization: Bearer bjk_…`; `GET /api/v1/api-keys/self` shows what the key can do
- never commit, log or paste the token anywhere (PR bodies, comments, docs); renew with `POST /api/v1/api-key-requests/renewal` before it expires instead of requesting a new one
