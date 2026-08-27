#!/usr/bin/env bash
set -euo pipefail

# Fails if this diff modifies an EF Core migration file that already existed
# on the base branch, instead of adding a new migration to supersede it.
#
# Editing an already-merged migration is invisible to
# `dotnet ef migrations has-pending-model-changes`: that check only compares
# the current model against the model snapshot, and the snapshot is kept in
# sync with whatever the migration file currently says. So a migration can be
# rewritten in place -- e.g. renaming a column -- with the model/snapshot
# check still green, while any database that already applied the old version
# of that migration silently keeps the old schema. Pulling the new code and
# re-running the migrator does nothing, because EF's migrations history table
# already marks that migration as applied. This is exactly what happened in
# commit 195db25, which renamed columns inside an already-merged migration
# (SettlementsAndBuildQueue) instead of adding a follow-up migration.
#
# Usage: check-migration-history.sh <base-ref> [head-ref]

base_ref="${1:?usage: check-migration-history.sh <base-ref> [head-ref]}"
head_ref="${2:-HEAD}"

modified=$(git diff --name-status "$base_ref"..."$head_ref" -- \
    'src/backend/src/Bjarnoy.Migrations.*/Migrations/*.cs' \
  | awk '$1 == "M" { print $2 }' \
  | grep -v 'ModelSnapshot\.cs$' || true)

if [[ -z "$modified" ]]; then
  echo "No already-merged migration files were modified."
  exit 0
fi

echo "The following migration files already exist on '$base_ref' and were modified there instead of superseded by a new migration:"
echo "$modified" | sed 's/^/  /'
echo

if git log "$base_ref".."$head_ref" --format=%B | grep -qi '^Migration-History-Fix:'; then
  echo "A commit in this range carries a 'Migration-History-Fix:' trailer, acknowledging a deliberate, reviewed correction of an already-merged migration. Allowing."
  exit 0
fi

cat <<'MSG'
Once a migration file is merged, treat it as immutable: add a new migration
instead of editing history. A database that already applied the old version
will not pick up the edit, and will silently drift from what the code now
expects.

If this is a deliberate, reviewed correction of an already-broken migration
(rare -- e.g. fixing exactly this class of mistake), add a commit whose
message includes a line starting with "Migration-History-Fix:" explaining
why, and make sure a genuinely new migration exists to bring an
already-migrated database forward.
MSG
exit 1
