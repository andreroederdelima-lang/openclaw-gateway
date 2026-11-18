#!/bin/sh
# Sobe a imagem e espera o HEALTHCHECK do Dockerfile em /health.
set -eu
cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-openclaw-gateway:ci}"
NAME="oc-gw-health-$$"
PORT="${PORT:-3463}"

docker build -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  -e PORT="$PORT" \
  -e NODE_ENV=production \
  -e LLM_MOCK= \
  -e OPENAI_API_KEY= \
  -e ANTHROPIC_API_KEY= \
  -e SUPABASE_JWT_SECRET= \
  -e SUPABASE_URL= \
  -p "127.0.0.1::${PORT}" \
  "$IMAGE"

cleanup() {
  code=$?
  docker logs "$NAME" >&2 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT

status=starting
i=0
while [ "$i" -lt 40 ]; do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME")
  if [ "$status" = "healthy" ]; then
    break
  fi
  if [ "$status" = "unhealthy" ]; then
    echo "container unhealthy" >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$status" != "healthy" ]; then
  echo "health status=$status" >&2
  exit 1
fi

host_port=$(docker inspect -f '{{(index (index .NetworkSettings.Ports "'"$PORT"'/tcp") 0).HostPort}}' "$NAME")
body=$(curl -fsS "http://127.0.0.1:${host_port}/health")
printf '%s\n' "$body"
printf '%s' "$body" | grep -q '"ok":true'
printf '%s' "$body" | grep -q '"service":"openclaw-gateway"'
