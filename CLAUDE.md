# Agent notes

- Do not make rendering/behavior code branch on "are we in a test/CI
  environment" or "is this a software (non-GPU) renderer" as a way to make
  e2e tests pass faster or more reliably. That makes the code path under
  test diverge from the code path real users get, which defeats the point
  of the test. Fix real perf problems (cheaper algorithms, smaller/cached
  work, lower default cost) so the *same* code is fast everywhere, rather
  than detecting the test/CI environment and skipping expensive work only
  there.
