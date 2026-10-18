#!/usr/bin/env bash
# CI/local guard: position code must never order/filter/pick "latest" by arrival/message time.
# Usage: bash scripts/check_forbidden_date_fields.sh src
ROOT="${1:-src}"
PAT='(orderBy|where)\(\s*["'"'"'`](messageDate|message_date|receivedAt|received|createdAt|timestamp|ingestedAt|firstMessage|lastMessage)'
echo "== Firestore orderBy/where on arrival-type fields =="
grep -rnE "$PAT" "$ROOT" --include=*.ts --include=*.tsx | grep -v 'bootQueries' | grep -v 'ingest_runs' || echo "none"
echo; echo "== sort()/Date comparisons on message/arrival fields near position code =="
grep -rnE "(messageDate|receivedAt|createdAt|firstMessageDate)[^;]{0,60}(sort|getTime|localeCompare)|sort\([^)]*(messageDate|receivedAt|createdAt)" "$ROOT" --include=*.ts --include=*.tsx | grep -iE "position|fix|track|argos|live" || echo "none"
echo; echo "== Which collections are read by the live map / tables =="
grep -rnE "collection\([^)]*['\"\`](positions|argos_positions|argos_data|argos_raw|argos_fixes)['\"\`]" "$ROOT" --include=*.ts --include=*.tsx || echo "none"
