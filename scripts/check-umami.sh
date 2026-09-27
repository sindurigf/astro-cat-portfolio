#!/bin/sh
# Diffs public/vendor/umami.js against upstream; new bytes go to tmp/. Weekly in
# scheduled.yml, not on pull requests: it needs the network. Steps: DEPLOYMENT.md.
# Exit:  0 the copy matches, 1 it does not, 2 the check could not run.

set -eu

cd "$(dirname "$0")/.."

ANALYTICS=src/lib/analytics.ts
VENDORED=public/vendor/umami.js
TIMEOUT_SECONDS=20

die() {
  echo "check-umami: $*" >&2
  exit 2
}

for tool in curl cmp sed mktemp; do
  command -v "$tool" >/dev/null 2>&1 || die "needs $tool, which is not installed"
done

[ -f "$VENDORED" ] || die "$VENDORED is missing"

UPSTREAM=$(sed -n "s/^export const UMAMI_UPSTREAM_SCRIPT = '\([^']*\)';$/\1/p" "$ANALYTICS")
case "$UPSTREAM" in
  https://?*) ;;
  *) die "no https UMAMI_UPSTREAM_SCRIPT found in $ANALYTICS" ;;
esac

VENDORED_ON=$(sed -n "s/^export const UMAMI_VENDORED_ON = '\([^']*\)';$/\1/p" "$ANALYTICS")

LATEST=tmp/umami-upstream.js
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

curl --silent --show-error --fail --location --max-time "$TIMEOUT_SECONDS" \
  --output "$TMP" "$UPSTREAM" || die "could not fetch $UPSTREAM"

[ -s "$TMP" ] || die "$UPSTREAM returned an empty body"

if cmp -s "$TMP" "$VENDORED"; then
  rm -f "$LATEST"
  echo "check-umami: $VENDORED matches $UPSTREAM (vendored ${VENDORED_ON:-on an unrecorded date})"
  exit 0
fi

mkdir -p "$(dirname "$LATEST")"
cp "$TMP" "$LATEST"
echo "check-umami: $VENDORED differs from $UPSTREAM (vendored ${VENDORED_ON:-on an unrecorded date})"
echo "check-umami: the upstream bytes are in $LATEST. Review, then replace the copy with them."
diff "$VENDORED" "$LATEST" || true
exit 1
