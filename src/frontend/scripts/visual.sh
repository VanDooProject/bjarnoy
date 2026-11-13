#!/usr/bin/env bash
# Runs the visual regression specs inside the pinned Playwright image (e2e/visual/image.json).
# Extra args go to `playwright test` (e.g. --update-snapshots=changed, --repeat-each 5, -g landing).
set -euo pipefail
cd "$(dirname "$0")/.."
image="$(node -p "require('./e2e/visual/image.json').image")"
root="$(git rev-parse --show-toplevel)"
exec docker run --rm --ipc=host --user "$(id -u):$(id -g)" \
  -e CI=1 -e HOME=/tmp -e "BJARNOY_VISUAL_IMAGE=$image" \
  -v "$root:/work" -w /work/src/frontend "$image" \
  bash -c 'npx vite build && npx playwright test --project=visual-desktop --project=visual-phone "$@"' -- "$@"
