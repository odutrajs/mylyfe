#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://developers.hostinger.com/api/vps/v1"
CORE_SERVICES=(mylyfe-api-1 mylyfe-nginx-1 mylyfe-secretary-1)
POLL_INTERVAL=10
MAX_WAIT=180
HEALTH_URL="${HEALTH_URL:-https://feedeo.com.br/api/health}"

fetch_containers() {
  curl -sS \
    -H "Authorization: Bearer ${HOSTINGER_API_KEY}" \
    -H "Accept: application/json" \
    "${API_BASE}/virtual-machines/${HOSTINGER_VM_ID}/docker/${PROJECT_NAME}/containers"
}

container_state() {
  local name="$1"
  echo "$2" | jq -r --arg name "$name" '.[] | select(.name == $name) | .state'
}

elapsed=0
while [ "$elapsed" -le "$MAX_WAIT" ]; do
  CONTAINERS=$(fetch_containers)

  echo "[$elapsed s] Container states:"
  echo "$CONTAINERS" | jq -r '.[] | "  \(.name): \(.state)"'

  all_running=true
  for service in "${CORE_SERVICES[@]}"; do
    STATE=$(container_state "$service" "$CONTAINERS")

    if [ -z "$STATE" ] || [ "$STATE" = "null" ]; then
      echo "Container $service not found yet"
      all_running=false
      continue
    fi

    case "$STATE" in
      running) ;;
      restarting|starting|created|removing)
        echo "Waiting for $service (state: $STATE)"
        all_running=false
        ;;
      *)
        echo "Container $service is in unexpected state: $STATE"
        exit 1
        ;;
    esac
  done

  if [ "$all_running" = true ]; then
    echo "Core containers are running"
    echo "Checking ${HEALTH_URL}"
    for _ in 1 2 3 4 5 6; do
      if curl -fsS --max-time 15 "$HEALTH_URL" | jq -e '.ok == true' >/dev/null; then
        echo "Health check passed"
        exit 0
      fi
      sleep 5
    done
    echo "Containers are up but health check failed"
    exit 1
  fi

  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    break
  fi

  sleep "$POLL_INTERVAL"
  elapsed=$((elapsed + POLL_INTERVAL))
done

echo "Timed out waiting for core containers after ${MAX_WAIT}s"
exit 1
