using Xunit.Sdk;
using Xunit.v3;

// Every test in this assembly spins up a full Aspire stack of its own
// (a real Postgres container, the API, and a real Vite dev server) — xUnit's
// default is to run different test classes in parallel, which puts two full
// stacks fighting over the same CPU-constrained CI runner at once. That's
// what turned "Failed to create resource frontend" / a cancelled health
// check into the failure here: not a bug in either test, just both blowing
// past their own generous six-minute budget because they were sharing it.
// These tests are heavy enough, and few enough, that running them
// sequentially costs little and removes the contention entirely.
[assembly: Parallelization(Mode = ParallelMode.None)]
