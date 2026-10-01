using Xunit.Sdk;
using Xunit.v3;

// All tests share one Aspire stack (a real Postgres container, the API, and a
// real Vite dev server — see AppHostFixture) and reset its database before
// each test, so they must never run concurrently: xUnit's default of running
// different test classes in parallel would have two tests mutating the same
// database and API at once.
[assembly: AssemblyFixture(typeof(Bjarnoy.AppHost.Tests.AppHostFixture))]
[assembly: Parallelization(Mode = ParallelMode.None)]
