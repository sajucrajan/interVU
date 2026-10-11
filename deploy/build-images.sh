#!/usr/bin/env bash
# Build the InterVU images on your own machine and push them to a registry.
# No CI minutes involved (docs/13 §7).
#
#   deploy/build-images.sh                 # build + push :latest and :<git sha>
#   deploy/build-images.sh v0.1.0          # also tag :v0.1.0
#   PUSH=false deploy/build-images.sh      # build for this machine only, no push
#   DEMO=false deploy/build-images.sh      # skip the web :demo variant
#
# Settings (env):
#   IMAGE_PREFIX   where the images go. Docker Hub: your username (default
#                  "sajucrajan" → docker.io/sajucrajan/intervu-api). GHCR:
#                  ghcr.io/<user>. Any registry works; `docker login` first.
#   PLATFORMS      default linux/amd64,linux/arm64 (Intel and Apple Silicon).
#                  Multi-arch needs buildx with QEMU, which Docker Desktop
#                  has; on a plain Linux engine run
#                  `docker run --privileged --rm tonistiigi/binfmt --install all` once.
#   API_PROXY_TARGET  where the web container reaches the API; fixed at build
#                  time (docs/11). Default http://api:4000, the compose
#                  service name.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_PREFIX="${IMAGE_PREFIX:-sajucrajan}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-true}"
DEMO="${DEMO:-true}"
API_PROXY_TARGET="${API_PROXY_TARGET:-http://api:4000}"
VERSION="${1:-}"
SHA="$(git rev-parse --short=12 HEAD 2>/dev/null || echo local)"

if [ "$PUSH" = "true" ]; then
  output=(--platform "$PLATFORMS" --push)
else
  # --load cannot hold a multi-arch image, so a local build is this machine's arch.
  output=(--load)
fi

tags() {
  local image="$1" suffix="$2"
  if [ -n "$suffix" ]; then
    printf -- '-t %s:%s -t %s:%s-%s ' "$image" "$suffix" "$image" "$suffix" "$SHA"
    [ -n "$VERSION" ] && printf -- '-t %s:%s-%s ' "$image" "$suffix" "$VERSION"
  else
    printf -- '-t %s:latest -t %s:%s ' "$image" "$image" "$SHA"
    [ -n "$VERSION" ] && printf -- '-t %s:%s ' "$image" "$VERSION"
  fi
  return 0
}

labels=(
  --label "org.opencontainers.image.source=https://github.com/sajucrajan/interVU"
  --label "org.opencontainers.image.revision=$SHA"
  --label "org.opencontainers.image.licenses=Apache-2.0"
)

echo "==> $IMAGE_PREFIX/intervu-api  ($SHA${VERSION:+, $VERSION})"
# shellcheck disable=SC2046
docker buildx build "${output[@]}" "${labels[@]}" \
  $(tags "$IMAGE_PREFIX/intervu-api" "") \
  -f apps/api/Dockerfile .

echo "==> $IMAGE_PREFIX/intervu-web  (demo page off)"
# shellcheck disable=SC2046
docker buildx build "${output[@]}" "${labels[@]}" \
  $(tags "$IMAGE_PREFIX/intervu-web" "") \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg API_PROXY_TARGET="$API_PROXY_TARGET" \
  --build-arg NEXT_PUBLIC_DEMO_MODE=false \
  -f apps/web/Dockerfile .

if [ "$DEMO" = "true" ]; then
  echo "==> $IMAGE_PREFIX/intervu-web:demo  (demo page on)"
  # shellcheck disable=SC2046
  docker buildx build "${output[@]}" "${labels[@]}" \
    $(tags "$IMAGE_PREFIX/intervu-web" "demo") \
    --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
    --build-arg API_PROXY_TARGET="$API_PROXY_TARGET" \
    --build-arg NEXT_PUBLIC_DEMO_MODE=true \
    --build-arg NEXT_PUBLIC_DEMO_ORG=acme \
    --build-arg NEXT_PUBLIC_DEMO_PASSWORD=intervu-demo \
    -f apps/web/Dockerfile .
fi

echo "Done."
[ "$PUSH" = "true" ] || echo "Built for this machine only (PUSH=false). Run with PUSH=true after 'docker login' to publish."
