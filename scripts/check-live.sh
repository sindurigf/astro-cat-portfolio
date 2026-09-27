#!/bin/sh
# Checks the deployed site against this repository, since dashboard settings
# change what ships without changing dist/. Fails per response on:
#   1. a header public/_headers sets or detaches (`! Name`) that differs live
#   2. `cdn-cgi` anywhere in the body, escaped or not
#   3. `__cf_email__` or `email-protection` in the body
#   4. a fetching element pointing at another origin, each srcset candidate too
#   5. an inline <script>/<style> whose sha256 is not in the CSP (not JSON-LD)
#   6. an unexpected status
#   7. CSS or JS under /_astro/ or /vendor/, a favicon or a feed, without
#      Content-Encoding
#   8. /sitemap.xml not 301 to /sitemap-index.xml
#   9. a public/_headers pattern no request below exercises
#  10. an unsent contact email over an hour old (production D1; needs
#      `npx wrangler login`, or CLOUDFLARE_API_TOKEN with CLOUDFLARE_ACCOUNT_ID;
#      else exits 2; CHECK_LIVE_SKIP_D1=1 skips it and says so)
#  11. the default og:image refused to a request referred by another site
# Body rules match anywhere, not inside expected tag shapes: injections vary.
#
# Usage: sh scripts/check-live.sh [origin]   (default: src/site.config.ts `site.url`)
# Exit:  0 production matches, 1 it does not, 2 the check could not run.

set -eu

cd "$(dirname "$0")/.."

CONFIG=src/site.config.ts
HEADERS_FILE=public/_headers

# The one non-placeholder post; a rename fails rule 6.
POST_PATH=/blog/sample-talk/
UNKNOWN_PATH=/check-live-no-such-page/
TIMEOUT_SECONDS=20

# A browser's headers: Cloudflare injected its beacon for a browser, not curl.
USER_AGENT='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
ACCEPT='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

TAB=$(printf '\t')
FAILURES=0
RESPONSES=0

die() {
  echo "check-live: $*" >&2
  exit 2
}

for tool in curl awk sed grep tr cut openssl base64 mktemp date node npx; do
  command -v "$tool" >/dev/null 2>&1 || die "needs $tool, which is not installed"
done

SITE=$(node --input-type=module -e "const { SITE_CONFIG } = await import('./$CONFIG'); console.log(SITE_CONFIG.site.url)") ||
  die "$CONFIG did not load"
SITE=${SITE%/}
case "$SITE" in
  https://*/*) die "\`site.url\` in $CONFIG has a path; only an origin is supported" ;;
  https://?*) ;;
  *) die "no https \`site.url\` found in $CONFIG" ;;
esac

TARGET=${1:-$SITE}
TARGET=${TARGET%/}
case "$TARGET" in
  https://*/*) die "pass an origin, not a URL with a path: $TARGET" ;;
  https://?*) ;;
  *) die "the origin must be https: $TARGET" ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
trap 'exit 2' INT TERM

# Defeats edge caches from before a dashboard change.
CACHE_BUST="check-live=$(date +%s)-$$"

# `pattern<TAB>name<TAB>value`, detaches as `!name`; same grammar as
# parseHeadersFile in tests/policy-server.ts.
cat > "$TMP/rules.awk" <<'AWK'
{
  line = $0
  sub(/#.*/, "", line)
  sub(/[ \t\r]+$/, "", line)
}
line ~ /^[ \t]*$/ { next }
line !~ /^[ \t]/ { pattern = line; next }
{
  if (pattern == "") {
    print "a header line comes before any pattern: " $0 > "/dev/stderr"
    exit 2
  }
  if (line ~ /^[ \t]+![ \t]*[^ \t:]+$/) {
    name = line
    sub(/^[ \t]+![ \t]*/, "", name)
    printf "%s\t!%s\t-\n", pattern, tolower(name)
    next
  }
  i = index(line, ":")
  if (i == 0) {
    print "neither a pattern nor a header: " $0 > "/dev/stderr"
    exit 2
  }
  name = substr(line, 1, i - 1)
  value = substr(line, i + 1)
  gsub(/^[ \t]+|[ \t]+$/, "", name)
  gsub(/^[ \t]+|[ \t]+$/, "", value)
  printf "%s\t%s\t%s\n", pattern, tolower(name), value
}
AWK

# Prints `ref` lines for fetching elements and `inline` lines (body written to
# OUT.<tag>.<n>.body). Comments are skipped whole, or a `<style>` in one would
# stop the scan early. Prints `complete` only at the end of the document.
cat > "$TMP/elements.awk" <<'AWK'
BEGIN {
  OFS = "\t"
  split("script link img iframe video audio source embed object track", t, " ")
  for (k in t) FETCHING[t[k]] = 1
  NATTRS = split("src href data poster srcset imagesrcset", ATTRS, " ")
  SRCSETS["srcset"] = SRCSETS["imagesrcset"] = 1
  ABSENT = "\001"
}
# One `ref` per candidate URL, as the HTML srcset parser splits them: a URL may
# hold commas, and only a trailing one ends its candidate.
function candidates(v, name, key,    u, c) {
  for (;;) {
    sub(/^[ \t\n\r,]+/, "", v)
    if (v == "") return
    match(v, /^[^ \t\n\r]+/)
    u = substr(v, 1, RLENGTH)
    v = substr(v, RLENGTH + 1)
    if (u ~ /,$/) sub(/,+$/, "", u)
    else { c = index(v, ","); v = c ? substr(v, c + 1) : "" }
    print "ref", name, key, u
  }
}
function attr(a, name,    la, v, q) {
  la = tolower(a)
  if (!match(la, "(^|[ \t\n\r/])" name "[ \t\n\r]*=")) return ABSENT
  v = substr(a, RSTART + RLENGTH)
  sub(/^[ \t\n\r]+/, "", v)
  q = substr(v, 1, 1)
  if (q == "\"" || q == "'") {
    v = substr(v, 2)
    return substr(v, 1, index(v, q) - 1)
  }
  match(v, /^[^ \t\n\r>]*/)
  return substr(v, 1, RLENGTH)
}
{ doc = doc (NR > 1 ? "\n" : "") $0 }
END {
  low = tolower(doc)
  pos = 1
  while ((i = index(substr(low, pos), "<")) > 0) {
    start = pos + i - 1
    if (substr(low, start, 4) == "<!--") {
      end_at = index(substr(low, start + 4), "-->")
      if (end_at == 0) { print "truncated", "!--", start, "-"; exit }
      pos = start + end_at + 6
      continue
    }
    if (!match(substr(low, start + 1), /^[a-z][a-z0-9-]*/)) { pos = start + 1; continue }
    name = substr(low, start + 1, RLENGTH)
    gt = index(substr(doc, start), ">")
    if (gt == 0) { print "truncated", name, start, "-"; exit }
    gt += start - 1
    attrs = substr(doc, start + 1 + length(name), gt - start - 1 - length(name))
    pos = gt + 1

    src = attr(attrs, "src")
    if (name in FETCHING) {
      for (k = 1; k <= NATTRS; k++) {
        if (name == "script" && ATTRS[k] != "src") continue
        v = attr(attrs, ATTRS[k])
        if (v == ABSENT) continue
        if (ATTRS[k] in SRCSETS) candidates(v, name, ATTRS[k])
        else print "ref", name, ATTRS[k], v
      }
    }

    if (name != "script" && name != "style") continue
    close_at = index(substr(low, gt + 1), "</" name)
    if (close_at == 0) { print "truncated", name, start, "-"; exit }
    close_at += gt
    pos = close_at + 1
    if (name == "script" && src != ABSENT) continue

    n[name]++
    file = OUT "." name "." n[name] ".body"
    printf "%s", substr(doc, gt + 1, close_at - gt - 1) > file
    close(file)
    type = attr(attrs, "type")
    if (type == ABSENT || type == "") type = "-"
    print "inline", name, n[name], tolower(type)
  }
  print "complete", "-", "-", "-"
}
AWK

awk -f "$TMP/rules.awk" "$HEADERS_FILE" > "$TMP/rules" ||
  die "could not parse $HEADERS_FILE"
[ -s "$TMP/rules" ] || die "$HEADERS_FILE sets no headers"
if cut -f1 "$TMP/rules" | grep -q ':'; then
  die "a pattern in $HEADERS_FILE uses a placeholder, which this script does not implement. Extend it in the same commit."
fi

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'FAIL  %s  %s\n' "$1" "$2"
}

detail() {
  printf '        %s\n' "$1"
}

# Every matching rule in file order; repeats joined with a comma, as Cloudflare
# does. A name detached and not set again must not be sent.
DETACHED='(detached)'
expected_for() {
  while IFS="$TAB" read -r pattern name value; do
    # Unquoted glob: in `case`, `*` crosses `/`, as Cloudflare's does.
    # shellcheck disable=SC2254
    case "$1" in $pattern) printf '%s\t%s\n' "$name" "$value" ;; esac
  done < "$TMP/rules" | awk -F "$TAB" -v detached="$DETACHED" '
    $1 ~ /^!/ { name = substr($1, 2); delete v[name]; gone[name] = 1; next }
    {
      if (!($1 in seen)) { seen[$1] = 1; order[++n] = $1 }
      if ($1 in v) v[$1] = v[$1] ", " $2; else v[$1] = $2
    }
    END {
      for (i = 1; i <= n; i++) if (order[i] in v) printf "%s\t%s\n", order[i], v[order[i]]
      for (name in gone) if (!(name in v)) printf "%s\t%s\n", name, detached
    }'
}

# Exits 1 when the header was not sent.
live_header() {
  awk -v want="$1" '
    { name = $0; sub(/:.*/, "", name) }
    tolower(name) != want || index($0, ":") == 0 { next }
    {
      value = $0
      sub(/^[^:]*:[ \t]*/, "", value)
      sub(/[ \t]+$/, "", value)
      out = found ? out ", " value : value
      found = 1
    }
    END { if (!found) exit 1; print out }' "$2"
}

same_origin() {
  case "$1" in
    "$SITE" | "$SITE"/* | "$TARGET" | "$TARGET"/*) return 0 ;;
    //*) return 1 ;;
  esac
  # A colon before the first slash is a scheme: another origin, or data:.
  case "${1%%/*}" in *:*) return 1 ;; esac
  return 0
}

sha256() {
  openssl dgst -sha256 -binary "$1" | base64 | tr -d '\n'
}

directive_hashes() {
  printf '%s\n' "$2" | tr ';' '\n' |
    sed -n "s/^[[:space:]]*$1[[:space:]]//p" |
    grep -o "'sha256-[A-Za-z0-9+/=]*'" |
    sed "s/^'sha256-//; s/'\$//" || true
}

check_headers() {
  expected_for "$1" > "$TMP/expected"
  while IFS="$TAB" read -r name want; do
    if [ "$want" = "$DETACHED" ]; then
      got=$(live_header "$name" "$2") || continue
      fail "$1" "$name is sent, but public/_headers detaches it"
      detail "production:      $got"
      continue
    fi
    if got=$(live_header "$name" "$2"); then
      [ "$got" = "$want" ] && continue
      fail "$1" "$name differs from public/_headers"
    else
      got='(not sent)'
      fail "$1" "$name is not sent"
    fi
    detail "public/_headers: $want"
    detail "production:      $got"
  done < "$TMP/expected"
}

check_strings() {
  for needle in cdn-cgi __cf_email__ email-protection; do
    grep -qF -- "$needle" "$2" || continue
    fail "$1" "\`$needle\` in the body, $(grep -oF -- "$needle" "$2" | wc -l | tr -d ' ') time(s)"
    LC_ALL=C grep -o ".\{0,50\}$needle.\{0,70\}" "$2" | head -n 3 |
      while IFS= read -r context; do detail "$context"; done
  done
}

# $1 path, $2 body file, $3 script or style. Uses check_elements' hash lists.
check_inline() {
  hash=$(sha256 "$2")
  if [ "$3" = script ]; then
    allowed=$script_hashes directive=script-src
  else
    allowed=$style_hashes directive=style-src
  fi
  printf '%s\n' "$allowed" | grep -qxF -- "$hash" && return 0
  fail "$1" "inline <$3> the build did not write: its hash is not in $directive"
  detail "sha256-$hash"
  detail "$(tr '\n' ' ' < "$2" | cut -c1-120)"
}

check_elements() {
  LC_ALL=C awk -v OUT="$2" -f "$TMP/elements.awk" "$2.body" > "$2.index" || true
  csp=$(awk -F "$TAB" '$1 == "content-security-policy" { print $2 }' "$TMP/expected")
  script_hashes=$(directive_hashes script-src "$csp")
  style_hashes=$(directive_hashes style-src "$csp")
  refs=0
  inlines=0
  complete=0
  truncated=0

  while IFS="$TAB" read -r kind tag key value; do
    case "$kind" in
      complete)
        complete=1
        continue
        ;;
      truncated)
        truncated=1
        fail "$1" "the element scan stopped at byte $key, at an unterminated <$tag>, so nothing after it was checked"
        continue
        ;;
    esac

    if [ "$kind" = ref ]; then
      refs=$((refs + 1))
      same_origin "$value" && continue
      fail "$1" "<$tag> fetches from another origin"
      detail "$key=\"$value\""
      continue
    fi

    inlines=$((inlines + 1))
    [ "$value" = application/ld+json ] && continue
    check_inline "$1" "$2.$tag.$key.body" "$tag"
  done < "$2.index"

  [ "$complete" -eq 1 ] || [ "$truncated" -eq 1 ] ||
    fail "$1" "the element scan did not finish, so the page was not fully checked"

  # Floors: every page has a stylesheet and Astro's inline island loader.
  [ "$refs" -gt 0 ] ||
    fail "$1" "no fetching element was found; the parser matched nothing"
  [ "$inlines" -gt 0 ] ||
    fail "$1" "no inline <script> or <style> was found; the parser matched nothing"
}

check_encoding() {
  case "$1" in /_astro/* | /vendor/* | /favicon.* | *rss.xml) ;; *) return 0 ;; esac
  case "$3" in
    text/css* | text/javascript* | application/javascript* | image/svg+xml* | \
      image/vnd.microsoft.icon* | image/x-icon* | application/xml* | \
      application/rss+xml*) ;;
    *) return 0 ;;
  esac
  live_header content-encoding "$2" >/dev/null && return 0
  fail "$1" "served without Content-Encoding, so Cloudflare did not compress it"
  detail "cache-control: $(live_header cache-control "$2" || echo '(not sent)')"
}

# $1 path, $2 expected status. Leaves the body at $LAST_BODY.
check_response() {
  RESPONSES=$((RESPONSES + 1))
  printf '%s\n' "$1" >> "$TMP/requested"
  out="$TMP/r$RESPONSES"
  url="$TARGET$1"
  case "$1" in *\?*) query="&$CACHE_BUST" ;; *) query="?$CACHE_BUST" ;; esac

  status=$(curl --silent --show-error --compressed --max-time "$TIMEOUT_SECONDS" \
    --user-agent "$USER_AGENT" --header "Accept: $ACCEPT" \
    --header 'Cache-Control: no-cache' \
    --dump-header "$out.raw" --output "$out.body" \
    --write-out '%{http_code}' "$url$query") || die "could not fetch $url"
  tr -d '\r' < "$out.raw" > "$out.head"
  LAST_BODY="$out.body"
  before=$FAILURES

  if [ "$status" != "$2" ]; then
    fail "$1" "status $status, expected $2"
    location=$(live_header location "$out.head" || true)
    [ -z "$location" ] || detail "location: $location"
  fi

  check_headers "$1" "$out.head"
  check_strings "$1" "$out.body"

  content_type=$(live_header content-type "$out.head" || true)
  case "$content_type" in text/html*) check_elements "$1" "$out" ;; esac
  check_encoding "$1" "$out.head" "$content_type"

  [ "$FAILURES" -ne "$before" ] || printf 'ok    %s\n' "$1"
}

echo "check-live: $TARGET against $HEADERS_FILE"

check_response / 200
ASSET=$(grep -o '/_astro/[A-Za-z0-9._-]*\.css' "$LAST_BODY" | head -n 1 || true)
[ -n "$ASSET" ] ||
  ASSET=$(grep -o '/_astro/[A-Za-z0-9._-]*' "$LAST_BODY" | head -n 1 || true)

VENDOR_SCRIPT=$(grep -o '/vendor/[A-Za-z0-9._-]*\.js' "$LAST_BODY" | head -n 1 || true)

check_response /privacy/ 200
check_response "$POST_PATH" 200

if [ -n "$ASSET" ]; then
  check_response "$ASSET" 200
else
  fail / "the homepage references nothing under /_astro/, so no hashed asset was checked"
fi

if [ -n "$VENDOR_SCRIPT" ]; then
  check_response "$VENDOR_SCRIPT" 200
else
  fail / "the homepage references nothing under /vendor/, so the Umami tracker was not checked"
fi

# Its Content-Type comes from public/_headers; tests/served-types.spec.ts
# checks the local side.
check_response /speculationrules.json 200

# Rule 7 for the favicons and feeds, and rule 1 for the Markdown copy's noindex.
check_response /favicon.ico 200
check_response /favicon.svg 200
check_response /rss.xml 200
check_response "${POST_PATH%/}.md" 200

check_response "$UNKNOWN_PATH" 404

# The test suite's static server ignores public/_redirects; only checked here.
SITEMAP_ALIAS=/sitemap.xml
SITEMAP_TARGET=/sitemap-index.xml
REDIRECT_STATUS=301
RESPONSES=$((RESPONSES + 1))
alias_result=$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" \
  --user-agent "$USER_AGENT" --output /dev/null \
  --write-out '%{http_code} %{redirect_url}' "$TARGET$SITEMAP_ALIAS") ||
  die "could not fetch $TARGET$SITEMAP_ALIAS"
alias_status=${alias_result%% *}
alias_location=${alias_result#* }
if [ "$alias_status" != "$REDIRECT_STATUS" ] ||
  [ "$alias_location" != "$TARGET$SITEMAP_TARGET" ]; then
  fail "$SITEMAP_ALIAS" "expected $REDIRECT_STATUS to $TARGET$SITEMAP_TARGET, got $alias_status to ${alias_location:-nothing}"
else
  printf 'ok    %s\n' "$SITEMAP_ALIAS"
fi

# Rule 11. Hotlink Protection refuses png/jpg/gif/ico referred by another
# host, which breaks link previews and feed readers; docs/DEPLOYMENT.md.
OG_IMAGE=/images/og-default.png
FOREIGN_REFERER=https://example.com/
RESPONSES=$((RESPONSES + 1))
og_result=$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" \
  --user-agent "$USER_AGENT" --referer "$FOREIGN_REFERER" --output /dev/null \
  --write-out '%{http_code} %{content_type}' "$TARGET$OG_IMAGE?$CACHE_BUST") ||
  die "could not fetch $TARGET$OG_IMAGE"
case "$og_result" in
  '200 image/png'*) printf 'ok    %s\n' "$OG_IMAGE referred by another site" ;;
  *)
    fail "$OG_IMAGE" "not served when referred by $FOREIGN_REFERER: $og_result; a 403 is Hotlink Protection"
    ;;
esac

# Rule 9, with expected_for's glob. From a file: a `for` list would expand `/*`
# and a pipe's subshell would lose FAILURES.
cut -f1 "$TMP/rules" | awk '!seen[$0]++' > "$TMP/patterns"
while IFS= read -r pattern; do
  covered=
  while IFS= read -r path; do
    # shellcheck disable=SC2254
    case "$path" in $pattern) covered=1 && break ;; esac
  done < "$TMP/requested"
  [ -n "$covered" ] ||
    fail "$pattern" "no request in this script matches this rule in $HEADERS_FILE, so its headers are never compared; add one"
done < "$TMP/patterns"

# Rule 10. RESEND_AFTER_MS in src/lib/contact-resend.ts;
# tests/contact-resend.spec.ts fails when the two differ.
RESEND_AFTER_MS=3600000
if [ "${CHECK_LIVE_SKIP_D1:-}" = 1 ]; then
  printf 'skip  %s\n' "D1: CHECK_LIVE_SKIP_D1=1, unsent notifications were not counted"
else
  D1_DATABASE=MESSAGES_DB
  unsent_before=$(($(date +%s) * 1000 - RESEND_AFTER_MS))
  unsent_json=$(npx --no-install wrangler d1 execute "$D1_DATABASE" --remote --json \
    --command "SELECT COUNT(*) AS unsent FROM messages WHERE notified_at IS NULL AND created_at < $unsent_before" \
    2>"$TMP/wrangler.err") ||
    die "could not read D1, so unsent notifications were not counted: $(tail -n 3 "$TMP/wrangler.err")"
  unsent=$(printf '%s' "$unsent_json" |
    node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>{const n=JSON.parse(s)?.[0]?.results?.[0]?.unsent;if(!Number.isInteger(n))process.exit(1);console.log(n)})') ||
    die "wrangler answered without a count of unsent notifications"
  if [ "$unsent" -gt 0 ]; then
    fail "D1 $D1_DATABASE" "$unsent message(s) stored over an hour ago have not been emailed; read them in D1"
  else
    printf 'ok    %s\n' "D1 $D1_DATABASE: every message was emailed"
  fi
fi

if [ "$FAILURES" -gt 0 ]; then
  echo
  echo "check-live: $FAILURES divergence(s) between $TARGET and this repository, over $RESPONSES responses."
  exit 1
fi

echo "check-live: $RESPONSES responses match this repository."
