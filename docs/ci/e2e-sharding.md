# Frontend e2e CI: how the split into parallel jobs was chosen

`frontend-ci.yml`'s `e2e` job runs `src/frontend/e2e/*.spec.ts` — Playwright
tests that mount real WebGL/PixiJS canvases (no GPU on the runner, so this is
CPU-bound software rendering). This doc records how the job's parallel split
was arrived at, since the reasoning isn't obvious from the workflow file
alone and the first two attempts were each wrong in a different way.

## Attempt 1: more in-process workers — reverted, made CI worse

`playwright.config.ts` forced `workers: 1` in CI even though the suite is
fully parallel-safe (every spec mocks its own backend via test-scoped
`page.route()` calls, gets its own browser context, and nothing uses
`test.describe.serial`). The first fix bumped `workers` to 2, assuming
GitHub's hosted runner had 4 vCPUs to spare.

That assumption was wrong: GitHub's standard hosted `ubuntu-latest` runner is
**2 vCPUs**. Two concurrent Chromium instances doing GPU-less canvas
rendering oversubscribed that CPU. The actual CI run took **19.4 minutes and
still failed 9 tests to timeouts** — worse than a plain serial run. Reverted
back to `workers: 1`; real parallelism has to come from separate runners
(separate CI jobs), not more threads fighting over one runner's CPU.

## Attempt 2: plain `--shard=N/M` — safe, but landed unevenly

Playwright's `--shard=N/M` splits the *complete* discovered test list into N
contiguous chunks and runs one per CI job (one job = one full runner). This
is safe by construction: every test lands in exactly one shard automatically,
with no file list to maintain, so a newly added spec can never be silently
dropped from CI.

The catch: `--shard` splits the list in **file-discovery (alphabetical)
order**, not by duration. This suite's heaviest specs (`ring-menu`,
`settlement-interactions`, `shrine-build`, `trade`,
`world-map-interactions`) all sort late alphabetically, so a **3-way** split
dumped nearly all of them into one shard:

| shard | wall-clock |
|---|---|
| 1 | 5m17s |
| 2 | 3m39s |
| 3 | **14m10s** ← sets the job's floor |

The job can't finish before its slowest shard, so despite running on 3
separate runners, the 3-way split only beat the ~19-22min serial baseline by
about 1.4x, not 3x.

Widening to **6-way** shrank the worst case (a chunk can now absorb at most
~2-3 heavy files instead of ~5) but did not fix the underlying cause:

| shard | wall-clock |
|---|---|
| 1 | 1m55s |
| 2 | 5m33s |
| 3 | 2m16s |
| 4 | 5m03s |
| 5 | 6m25s |
| 6 | **8m30s** ← still the straggler |

Workflow wall-clock dropped to ~8.5 minutes — a real, correct ~2.5x
speedup over serial, achieved on 6 genuinely independent runners (GitHub
Actions gives every `matrix` entry its own fresh VM; jobs are never shared
between shards). But it was still bounded by one uneven shard, and more
shards means more redundant fixed overhead per job (checkout, submodule
init, `npm ci`, Playwright browser install, and the production build — each
paid again by every shard, in parallel, but still a floor under how fast
even a perfectly balanced split could go).

## Current approach: duration-tagged groups, sized from real CI data

The actual fix for the imbalance is to bin-pack by *measured duration*
instead of relying on alphabetical order. Per-file total durations were
read directly from a CI run's logs (not guessed, and not reused from a
stale local run — the ring-menu suite had since been rewritten):

| file | total duration |
|---|---|
| `ring-menu.spec.ts` | 370.6s (9 tests) |
| `settlement-interactions.spec.ts` | 305.5s (6 tests) |
| `army-overlay.spec.ts` | 213.2s (5 tests) |
| `world-map-interactions.spec.ts` | 135.4s (4 tests) |
| `trade.spec.ts` | 112.4s (2 tests) |
| `landing.spec.ts` | 73.0s (4 tests) |
| `shrine-build.spec.ts` | 60.0s (1 test) |
| `fog-drift.spec.ts` | 58.7s (1 test) |
| `found-settlement.spec.ts` | 40.5s (1 test) |
| `settlement-expansion.spec.ts` | 17.3s (1 test) |
| everything else (11 files) | ~13.6s combined |

Greedy bin-packing (largest file first, always into the currently-smallest
bin) into 4 groups lands within ~35 seconds of each other:

| group | files | total |
|---|---|---|
| `@g1` | `ring-menu` (alone — it's the single heaviest file) | 370.6s |
| `@g2` | `settlement-interactions`, `settlement-expansion`, `admin-world-reseed`, `admin-god-mode`, `leaderboard`, `docs`, `register`, `guild`, `admin-activity`, `admin-scroll`, `admin-settlements-grant` | 335.7s |
| `@g3` | `army-overlay`, `landing`, `fog-drift` | 344.9s |
| `rest` | `world-map-interactions`, `trade`, `shrine-build`, `found-settlement` | 348.3s |

Implementation, in `frontend-ci.yml`'s `e2e` job matrix:

```yaml
matrix:
  include:
    - name: g1
      args: --grep @g1
    - name: g2
      args: --grep @g2
    - name: g3
      args: --grep @g3
    - name: rest
      args: --grep-invert "@g1|@g2|@g3"
```

`@g1`/`@g2`/`@g3` are applied as Playwright tags at each spec file's
`test.describe(...)` (or, for files with no `describe` wrapper, on each
individual `test(...)` call) — see the individual `e2e/*.spec.ts` files.
**`rest` is not a fourth tag.** It is defined as "everything that does not
carry `@g1`, `@g2`, or `@g3`", via `--grep-invert`. That makes the split
**safe by construction**, the same way plain `--shard` was: `@g1 ∪ @g2 ∪
@g3 ∪ rest` is always the complete test list, by definition, not by anyone
remembering to update a list. A newly added spec file with no tag
automatically runs — in `rest` — even if nobody tags it. The only thing an
untagged new file can get "wrong" is *balance* (it might make `rest` a bit
heavier than the others), never *coverage* (it will never silently stop
running).

Verify the partition is exact with:

```sh
cd src/frontend
npx playwright test --grep @g1 --list | tail -1
npx playwright test --grep @g2 --list | tail -1
npx playwright test --grep @g3 --list | tail -1
npx playwright test --grep-invert "@g1|@g2|@g3" --list | tail -1
npx playwright test --list | tail -1   # should equal the sum of the four above
```

## When to re-balance

The group durations above are a snapshot, not a guarantee — they'll drift as
specs are added, removed, or change in cost. Re-balance when:

- A new spec file is consistently slow (multiple real WebGL/canvas
  interactions, not just a mocked API call) and lands in `rest` — tag it
  into whichever of `@g1`/`@g2`/`@g3` is currently lightest.
- One group's wall-clock in CI drifts noticeably above the others (check the
  `e2e` job's per-matrix-entry duration in recent runs).

To re-balance: pull each spec file's total duration from a recent CI run's
job logs (not a local run — this repo's e2e specs are consistently much
slower in CI than on a typical dev machine), then greedily bin-pack the
files into the 4 groups (largest file first, always into the
currently-smallest running total) and update the `tag` on any files that
moved. There is no tooling for this today; it was done by hand for the
table above.
