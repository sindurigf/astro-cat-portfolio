#!/bin/sh
# WebKit in Playwright's container, since it needs ICU 74 (Ubuntu 24.04). `--user`
# keeps outputs yours; the git common dir is mounted for `git ls-files` in a worktree.
# Usage: npm run test:webkit -- tests/reflow.spec.ts

set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo 'test:webkit needs Docker; see docs/DEVELOPMENT.md > WebKit.' >&2
  exit 1
fi

# Digest-pinned, as check:pins requires. Bump with @playwright/test:
# docker buildx imagetools inspect mcr.microsoft.com/playwright:v<version>-noble
IMAGE='mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e'

VERSION=$(node -p "require('@playwright/test/package.json').version")
case "$IMAGE" in
*":v${VERSION}-noble@"*) ;;
*)
  echo "test:webkit: IMAGE is not the image for @playwright/test ${VERSION}; update its tag and digest." >&2
  exit 1
  ;;
esac

# Only the major must match: see docs/DEVELOPMENT.md > WebKit.
WANT_NODE=$(cat .nvmrc)
WANT_NODE=${WANT_NODE#v}
IMAGE_NODE=$(docker run --rm "$IMAGE" node --version)
if [ "${IMAGE_NODE%%.*}" != "v${WANT_NODE%%.*}" ]; then
  echo "test:webkit: IMAGE runs Node ${IMAGE_NODE}, but .nvmrc is ${WANT_NODE}; use an image with Node ${WANT_NODE%%.*}." >&2
  exit 1
fi

GIT_COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir)

exec docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e WEBKIT=1 \
  -e NPM_CONFIG_UPDATE_NOTIFIER=false \
  -v "$PWD":/work -w /work \
  -v "$GIT_COMMON_DIR":"$GIT_COMMON_DIR":ro \
  "$IMAGE" \
  npx playwright test --project=webkit "$@"
