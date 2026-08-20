#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://developers.hostinger.com/api/vps/v1"
CONTENT_URL="${CONTENT_URL:-https://github.com/${GITHUB_REPOSITORY}}"
POLL_INTERVAL=10
MAX_WAIT=900

echo "Deploying to Hostinger..."
echo "Project: ${PROJECT_NAME}"
echo "VM: ${HOSTINGER_VM_ID}"
echo "Source: ${CONTENT_URL}"

if [ -n "${PROJECT_ENVIRONMENT:-}" ]; then
  BODY=$(jq -n \
    --arg content "${CONTENT_URL}" \
    --arg project_name "${PROJECT_NAME}" \
    --arg environment "${PROJECT_ENVIRONMENT}" \
    '{ project_name: $project_name, content: $content, environment: $environment }')
else
  BODY=$(jq -n \
    --arg content "${CONTENT_URL}" \
    --arg project_name "${PROJECT_NAME}" \
    '{ project_name: $project_name, content: $content }')
fi

RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${HOSTINGER_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$BODY" \
  "${API_BASE}/virtual-machines/${HOSTINGER_VM_ID}/docker")

HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
  echo "Failed to start deploy (HTTP ${HTTP_STATUS})"
  echo "$HTTP_BODY"
  exit 1
fi

ACTION_ID=$(echo "$HTTP_BODY" | jq -r '.id')
ACTION_NAME=$(echo "$HTTP_BODY" | jq -r '.name')
STATE=$(echo "$HTTP_BODY" | jq -r '.state')

echo "Action #${ACTION_ID} (${ACTION_NAME}) — state: ${STATE}"

if [ "$ACTION_ID" = "null" ] || [ -z "$ACTION_ID" ]; then
  echo "Deploy response missing action ID"
  echo "$HTTP_BODY"
  exit 1
fi

is_terminal_state() {
  case "$1" in
    success|completed) return 0 ;;
    failed|error|cancelled|timeout) return 0 ;;
    *) return 1 ;;
  esac
}

if is_terminal_state "$STATE"; then
  if [ "$STATE" = "success" ] || [ "$STATE" = "completed" ]; then
    echo "Deploy completed successfully"
    exit 0
  fi
  echo "Deploy failed (state: ${STATE})"
  echo "$HTTP_BODY" | jq .
  exit 1
fi

elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  sleep "$POLL_INTERVAL"
  elapsed=$((elapsed + POLL_INTERVAL))

  DETAILS=$(curl -sS \
    -H "Authorization: Bearer ${HOSTINGER_API_KEY}" \
    -H "Accept: application/json" \
    "${API_BASE}/virtual-machines/${HOSTINGER_VM_ID}/actions/${ACTION_ID}")

  STATE=$(echo "$DETAILS" | jq -r '.state')
  echo "[${elapsed}s] Deploy status: ${STATE}"

  case "$STATE" in
    success|completed)
      echo "Deploy completed successfully"
      exit 0
      ;;
    failed|error|cancelled|timeout)
      echo "Deploy failed (state: ${STATE})"
      echo "$DETAILS" | jq .
      exit 1
      ;;
  esac
done

echo "Timed out waiting for deploy after ${MAX_WAIT}s"
exit 1
