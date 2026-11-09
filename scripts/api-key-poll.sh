#!/usr/bin/env bash
# Request a scoped API key and wait until an admin approves it, without ever printing the token.
# Notes: docs/tech/api-keys.md, section "Polling for approval".
#
#   scripts/api-key-poll.sh request <host> <request.json>   POST the request, save its state, print user code + approval link
#   scripts/api-key-poll.sh wait    <host> <state.json>     poll until decided; on approval write the token to <state>.token
#   scripts/api-key-poll.sh wait    <host> --id <id> --secret <pollSecret> [--out <token file>]
#
# `wait` exits 0 on approval (token file written, mode 600), 1 if denied, 2 if expired or already picked up, 3 on a timeout or
# an unexpected answer. Run it in the background so the session is woken when it exits.
set -euo pipefail

die() { echo "$*" >&2; exit 64; }
cmd=${1:-}; host=${2:-}; [ -n "$cmd" ] && [ -n "$host" ] || die "usage: $0 request|wait <host> ..."
host=${host#https://}; host=${host%/}
base="https://$host/api/v1"
shift 2

json_get() { python3 -c 'import sys,json; v=json.load(sys.stdin).get(sys.argv[1],""); print(v if v is not None else "")' "$1"; }

case "$cmd" in
request)
  req=${1:-}; [ -f "$req" ] || die "request file missing"
  state="${req%.json}.state.json"
  umask 077
  answer=$(curl -sS -X POST "$base/api-key-requests" -H 'Content-Type: application/json' --data @"$req")
  echo "$answer" > "$state"
  [ -n "$(echo "$answer" | json_get id)" ] || { echo "request refused: $answer" >&2; exit 3; }
  echo "user code:    $(echo "$answer" | json_get userCode)"
  echo "approval url: $(echo "$answer" | json_get approvalUrl)"
  echo "expires:      $(echo "$answer" | json_get expiresAt)"
  echo "state file:   $state  (next: $0 wait $host $state)"
  ;;
wait)
  out=""; id=""; secret=""
  if [ "${1:-}" = "--id" ]; then
    while [ $# -gt 0 ]; do
      case "$1" in --id) id=$2; shift 2;; --secret) secret=$2; shift 2;; --out) out=$2; shift 2;; *) die "unknown option $1";; esac
    done
    [ -n "$out" ] || out="./api-key-$id.token"
  else
    state=${1:-}; [ -f "$state" ] || die "state file missing"
    id=$(json_get id < "$state"); secret=$(json_get pollSecret < "$state"); out="${state%.json}.token"
  fi
  [ -n "$id" ] && [ -n "$secret" ] || die "id and pollSecret needed"
  interval=5; deadline=$(( $(date +%s) + ${POLL_TIMEOUT_SECONDS:-3600} ))
  umask 077
  while [ "$(date +%s)" -lt "$deadline" ]; do
    body=$(mktemp); code=$(curl -sS -o "$body" -w '%{http_code}' -X POST "$base/api-key-requests/$id/token" \
      -H 'Content-Type: application/json' -d "{\"pollSecret\":\"$secret\"}") || code=000
    case "$code" in
      200)
        # The token comes exactly once: write it before anything else can fail.
        json_get token < "$body" > "$out"; rm -f "$body"
        [ -s "$out" ] || { echo "approved but no token in the answer" >&2; exit 3; }
        echo "approved; token saved to $out (mode 600, never printed)"; exit 0;;
      202) n=$(json_get pollIntervalSeconds < "$body"); interval=${n:-5};;
      403) rm -f "$body"; echo "denied"; exit 1;;
      410) rm -f "$body"; echo "expired or already picked up"; exit 2;;
      000|429|5??) ;;  # transient: keep polling
      *) echo "unexpected answer $code: $(head -c 200 "$body")" >&2; rm -f "$body"; exit 3;;
    esac
    rm -f "$body"; sleep "$interval"
  done
  echo "timed out waiting for approval"; exit 3;;
*) die "unknown command $cmd";;
esac
