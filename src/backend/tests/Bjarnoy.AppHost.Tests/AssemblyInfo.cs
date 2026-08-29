using Xunit.Sdk;
using Xunit.v3;

// Each test in this assembly spins up a full, independent Aspire
// orchestration (a Postgres container, the API, the Vite dev server, and a
// headless browser) — xunit's default of running test classes in parallel
// would run two of those stacks at once, which is more than a standard CI
// runner's CPU/memory can carry: the second stack's resources stall (a
// container pull, a process start, a browser launch) while the first is
// mid-run, and something downstream times out. There's only ever one of
// these heavy stacks to spare, so tests here run one at a time.
[assembly: Parallelization(Mode = ParallelMode.None)]
