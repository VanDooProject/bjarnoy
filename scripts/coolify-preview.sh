#!/usr/bin/env bash
# Provisions/tears down a standalone Coolify Application per open PR, replacing
# Coolify's own built-in "PR preview" feature. That feature runs production and
# every preview of one Application under the *same* docker-compose project
# (`--project-name <application uuid>`, prod and previews alike), so this
# repo's own postgres service and any bare-word network alias it declares
# resolve to one shared name across all of them — production's and every
# preview's database intermittently answered each other's queries (see
# deploy/README.md's old "Preview deployments" section, superseded by this
# script's approach: each PR gets its own Application, hence its own compose
# project, hence its own network/volumes/containers, with no code change to
# deploy/docker-compose.yaml needed).
#
# Usage:
#   coolify-preview.sh ensure   <pr_number> <head_branch>
#   coolify-preview.sh destroy  <pr_number>
#   coolify-preview.sh reap     <space-separated list of currently-open PR numbers>
#
# Required environment:
#   COOLIFY_URL              e.g. https://coolify.velarix.space
#   COOLIFY_API_TOKEN        token with read+write+deploy abilities
#   COOLIFY_PROJECT_UUID     the existing "bjarnoy" project
#   COOLIFY_SERVER_UUID      the destination server
#   COOLIFY_GITHUB_APP_UUID  the private GitHub App source for VanDooProject/bjarnoy
#
# Every Coolify Application this script creates is named `bjarnoy-pr-<N>` and
# tagged `pr-preview` + `pr-<N>` — that naming convention is the only state
# this script needs; there is no separate database of "which app is PR 12's".
set -euo pipefail

: "${COOLIFY_URL:?}"
: "${COOLIFY_API_TOKEN:?}"

api() {
  local method=$1 path=$2
  shift 2
  local response status body
  # Not --fail-with-body: piped straight into `jq` at every call site, and
  # combined with `set -o pipefail` that discards curl's response body
  # before it can be logged - a failure then said only "exit code 22" with
  # no indication of *why* (bad token, bad uuid, wrong scope...). Split
  # status from body instead so a failure can say what Coolify actually said.
  # --retry-all-errors: observed live - a bare GET /applications 502'd once
  # (Coolify's own gateway, momentarily unreachable), which failed `skip`'s
  # reclaim-if-any-exists check on a totally unrelated PR that never touched
  # this workflow. A transient 5xx blip shouldn't fail every open PR's
  # checks; three quick retries ride it out, and a genuinely down Coolify
  # still fails loudly after them.
  response=$(curl -sS -w '\n%{http_code}' \
    --retry 3 --retry-delay 2 --retry-all-errors \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
    -H 'Content-Type: application/json' \
    -X "$method" "${COOLIFY_URL%/}/api/v1${path}" "$@")
  status=${response##*$'\n'}
  body=${response%$'\n'*}
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "Coolify API ${method} ${path} -> HTTP ${status}: ${body}" >&2
    return 1
  fi
  echo "$body"
}

app_name() { echo "bjarnoy-pr-$1"; }
# Same one-label-under-the-zone pattern the old built-in previews used
# (<N>-bjarnoy.velarix.space, e.g. 255-bjarnoy.velarix.space) — see
# deploy/README.md's "Behind Cloudflare" note on why it has to stay one
# label. Kept identical on purpose so existing bookmarks/PR links keep
# working the same way once a PR's own Application takes over that domain.
app_domain() { echo "https://$1-bjarnoy.velarix.space"; }

# Prints the UUID of the Coolify Application named bjarnoy-pr-<N>, or nothing
# (not an error) if none exists yet — every caller below treats "not found" as
# a normal case (create-if-missing on ensure, no-op on destroy).
find_app_uuid() {
  local name
  name=$(app_name "$1")
  api GET '/applications' | jq -r --arg name "$name" '.[] | select(.name == $name) | .uuid' | head -n1
}

# Unlike the application, Coolify does NOT create an environment on the fly
# from `environment_name` in the application-create payload below - that
# call 404s with "Environment not found" against one that doesn't already
# exist (the "bjarnoy" project only ships a `production` environment).
# Idempotent the same way find_app_uuid is: look it up first, create only if
# missing.
ensure_environment() {
  local name="pr-$1"
  local uuid
  uuid=$(api GET "/projects/${COOLIFY_PROJECT_UUID}" |
    jq -r --arg name "$name" '.environments[] | select(.name == $name) | .uuid')
  if [ -z "$uuid" ]; then
    echo "Creating Coolify environment $name..." >&2
    uuid=$(api POST "/projects/${COOLIFY_PROJECT_UUID}/environments" \
      -d "{\"name\": \"${name}\"}" | jq -r '.uuid')
  fi
  echo "$uuid"
}

cmd_ensure() {
  local pr=$1 branch=$2
  local uuid
  uuid=$(find_app_uuid "$pr")

  if [ -z "$uuid" ]; then
    ensure_environment "$pr" >/dev/null
    echo "Creating Coolify application for PR #$pr (branch $branch)..." >&2
    uuid=$(api POST '/applications/private-github-app' -d @- <<JSON | jq -r '.uuid'
{
  "project_uuid": "${COOLIFY_PROJECT_UUID}",
  "server_uuid": "${COOLIFY_SERVER_UUID}",
  "environment_name": "pr-${pr}",
  "github_app_uuid": "${COOLIFY_GITHUB_APP_UUID}",
  "git_repository": "VanDooProject/bjarnoy",
  "git_branch": "${branch}",
  "build_pack": "dockercompose",
  "base_directory": "/",
  "docker_compose_location": "/deploy/docker-compose.yaml",
  "docker_compose_domains": {"app": {"name": "app", "domain": "$(app_domain "$pr")"}},
  "is_git_submodules_enabled": true,
  "is_preview_deployments_enabled": false,
  "is_auto_deploy_enabled": true,
  "instant_deploy": false,
  "name": "$(app_name "$pr")",
  "tags": ["pr-preview", "pr-${pr}"]
}
JSON
    )
    echo "Created application $uuid" >&2

    # Preview-only diagnostics (deploy/README.md's old "Preview deployments"
    # note): a preview build otherwise looks like production to the app
    # itself and hides the API reference it exists to expose.
    api POST "/applications/${uuid}/envs" \
      -d '{"key":"Diagnostics__ExposeApiReference","value":"true"}' >/dev/null
    api POST "/applications/${uuid}/envs" \
      -d '{"key":"Diagnostics__PublicBuildInfo","value":"true"}' >/dev/null
  else
    # The branch itself never changes for a given PR number (only its
    # commits do), and is_auto_deploy_enabled already redeploys on push — this
    # call is a belt-and-braces nudge for the case that webhook was missed.
    echo "Application $uuid already exists for PR #$pr — redeploying" >&2
  fi

  api POST "/deploy?uuid=${uuid}" >/dev/null
  app_domain "$pr"
}

cmd_destroy() {
  local pr=$1
  local uuid
  uuid=$(find_app_uuid "$pr")
  if [ -z "$uuid" ]; then
    echo "No application for PR #$pr — nothing to destroy" >&2
    return 0
  fi
  echo "Deleting application $uuid (PR #$pr)..." >&2
  api DELETE "/applications/${uuid}?delete_configurations=true&delete_volumes=true&docker_cleanup=true&delete_connected_networks=true" >/dev/null || true
}

cmd_reap() {
  # $* is every currently-open PR number, space-separated (the workflow's
  # nightly cron job computes this via the GitHub API before calling in).
  # Backstop for a run that never fired closed (a skipped/cancelled/failed
  # workflow job) — anything named bjarnoy-pr-<N> for a PR not in this list
  # gets torn down the same way cmd_destroy would.
  local open_prs=" $* "
  api GET '/applications' | jq -r '.[] | select(.name | test("^bjarnoy-pr-[0-9]+$")) | .name' |
    while read -r name; do
      local pr=${name#bjarnoy-pr-}
      if [[ "$open_prs" != *" $pr "* ]]; then
        echo "Reaping orphaned preview for closed PR #$pr" >&2
        cmd_destroy "$pr"
      fi
    done
}

case "${1:-}" in
  ensure) cmd_ensure "$2" "$3" ;;
  destroy) cmd_destroy "$2" ;;
  reap) shift; cmd_reap "$@" ;;
  *)
    echo "Usage: $0 {ensure <pr> <branch>|destroy <pr>|reap <open-pr-numbers...>}" >&2
    exit 1
    ;;
esac
