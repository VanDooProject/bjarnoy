
# git / commits
- commit after each task/enclosed change/intermediate buildable state/step
- use conventional commits (feat, fix, chore, refactor, docs, test, ci, perf, style) - also use this pattern for branch names


# dev workflow
- think of a solution
- implement
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