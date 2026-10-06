#!/bin/sh
# Subject format and AI attribution per AGENTS.md, CI's counterpart to .githooks.
# Skips merges, and Dependabot only with CI's TRUST_DEPENDABOT=1: anyone can set an email.
# Usage: sh scripts/check-commits.sh [range]     (default origin/main..HEAD, else HEAD)

set -eu

# A clone with no origin/main yet, like a new repository, checks all of HEAD.
if [ -n "${1:-}" ]; then
  RANGE=$1
elif git rev-parse --verify --quiet origin/main >/dev/null; then
  RANGE=origin/main..HEAD
else
  RANGE=HEAD
fi

TYPES='feat|fix|docs|style|refactor|chore|perf|security|config|revert|test'

# "type: Capitalized sentence with a full stop." No scopes.
SUBJECT_RE="^($TYPES): [A-Z].*\.$"

ATTRIBUTION_RE='^[[:space:]]*co-authored-by:.*(claude|anthropic)|generated with \[?claude code'

DEPENDABOT='49699333+dependabot[bot]@users.noreply.github.com'

commits=$(git rev-list --no-merges "$RANGE")

if [ -z "$commits" ]; then
  echo "Commits: no non-merge commits in $RANGE."
  exit 0
fi

failed=0
skipped=0

for sha in $commits; do
  if [ "${TRUST_DEPENDABOT:-}" = 1 ] &&
    [ "$(git log -1 --format=%ae "$sha")" = "$DEPENDABOT" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  short=$(git rev-parse --short "$sha")
  subject=$(git log -1 --format=%s "$sha")
  message=$(git log -1 --format=%B "$sha")

  if ! printf '%s\n' "$subject" | grep -qE "$SUBJECT_RE"; then
    echo "$short  subject is not 'type: Sentence.'   $subject"
    failed=1
  fi

  if printf '%s\n' "$message" | grep -qiE "$ATTRIBUTION_RE"; then
    echo "$short  carries AI attribution             $subject"
    failed=1
  fi
done

count=$(($(printf '%s\n' "$commits" | wc -l | tr -d ' ') - skipped))

if [ "$failed" -ne 0 ]; then
  echo
  echo "Allowed types: $TYPES"
  echo "Format: 'type: Full sentence with a full stop.'"
  exit 1
fi

if [ "$skipped" -gt 0 ]; then
  echo "Commits: $count checked in $RANGE, all conform; $skipped from Dependabot skipped."
else
  echo "Commits: $count checked in $RANGE, all conform."
fi
