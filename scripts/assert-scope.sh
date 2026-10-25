#!/usr/bin/env bash
# Guard: only the Custom Map Report may change; the live map (and everything else) must stay byte-identical.
#
#   BASE=<last commit before this task>  \
#   ALLOW='^(src/features/report-track/|src/components/report/|src/pages/CustomMapReport|src/types/report)'  \
#   PROTECT='src/components/map src/features/liveMap'   # <- live map + live history-track paths (fill in after discovery)  \
#   ./scripts/assert-scope.sh
set -euo pipefail
BASE="${BASE:-HEAD}"
: "${ALLOW:?set ALLOW to a regex of the files the report task may touch}"
: "${PROTECT:?set PROTECT to the space-separated live-map paths that must not change}"

changed="$( (git diff --name-only "$BASE"; git ls-files --others --exclude-standard) | sort -u | sed '/^$/d')"

bad="$(printf '%s\n' "$changed" | grep -Ev "$ALLOW" || true)"
if [ -n "$bad" ]; then
  echo "❌ Out-of-scope files changed:"; printf '%s\n' "$bad"; exit 1
fi

# shellcheck disable=SC2086
if ! git diff --quiet "$BASE" -- $PROTECT; then
  echo "❌ Protected live-map files differ from $BASE:"; git diff --stat "$BASE" -- $PROTECT; exit 1
fi
echo "✅ Scope OK — live map untouched, changes limited to the report."
