
# git / commits
- commit after each task/enclosed change/intermediate buildable state/step
- use conventional commits (feat, fix, chore, refactor, docs, test, ci, perf, style) - also use this pattern for branch names
- PR titles must follow the same conventional commit format — PRs are merged via squash, so the PR title becomes the squash commit message


# ai dev workflow
- think of a solution
- ask me if plan is fine if its more complex AND use plan/todo tool to list things u have to do
- implement (if multiple tasks push each task as a separate commit and open PR after first push)
- evaluate with requirements (if there are reference screenshots compare them)
- run build and tests
- evaluate if ci ran green

# bugs
- when fixing a bug add tests so we can make sure they don't come back; these tests can also be used to reproduce the bug first

# tests
- tests need to be meaningful and not test third party stuff
- for e2e tests increasing timeouts is usually not the fix for an issue, most of the time its wrong/broken selectors

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
  still need a working Docker daemon, which this sandbox doesn't have —
  those still skip/fail for that unrelated reason.)
- Blender is installable the same way (`sudo apt-get install -y blender`)
  for anything touching 3D/tile-art asset work.

# screenshot helpers
- `scripts/screenshot-helpers/flow.mjs` drives the demo-mode onboarding path
  (landing → world map → landfall → settlement view, plus a panned/hover
  settlement shot) in one Playwright run and screenshots every stop — use
  this instead of re-deriving the click path from scratch each time a UI
  change needs visual verification. See `scripts/screenshot-helpers/README.md`
  for setup and usage.