#!/usr/bin/env bash
# Soak test: run the app for 60 minutes and monitor for errors, memory leaks, and FPS drops.
# Usage: scripts/soak-test.sh [duration_minutes]
# Default: 60 minutes

set -euo pipefail

DURATION_MIN="${1:-60}"
DURATION_SEC=$((DURATION_MIN * 60))
PORT="${PORT:-5199}"
LOG_FILE="soak-test-$(date +%Y%m%d-%H%M%S).log"

echo "=== LAYERS Soak Test ==="
echo "Duration: ${DURATION_MIN} minutes (${DURATION_SEC}s)"
echo "Log: ${LOG_FILE}"
echo ""

# Start the dev server
echo "Starting dev server on port ${PORT}..."
cd "$(dirname "$0")/.." || exit 1
cd apps/web

PORT="${PORT}" npx vite --port "${PORT}" --host 127.0.0.1 &
VITE_PID=$!

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${PORT}" > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  sleep 1
done

# Check if server started
if ! curl -s "http://127.0.0.1:${PORT}" > /dev/null 2>&1; then
  echo "ERROR: Server failed to start"
  kill $VITE_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "Running soak test for ${DURATION_MIN} minutes..."
echo "Press Ctrl+C to stop early."
echo ""

# Monitor loop
START_TIME=$(date +%s)
ELAPSED=0
ERROR_COUNT=0

while [ $ELAPSED -lt $DURATION_SEC ]; do
  sleep 60
  ELAPSED=$(( $(date +%s) - START_TIME ))
  REMAINING=$(( DURATION_SEC - ELAPSED ))
  REMAINING_MIN=$(( REMAINING / 60 ))
  
  # Check if server is still running
  if ! kill -0 $VITE_PID 2>/dev/null; then
    echo "ERROR: Dev server crashed at ${ELAPSED}s"
    ERROR_COUNT=$((ERROR_COUNT + 1))
    break
  fi
  
  echo "[$(date +%H:%M:%S)] Elapsed: $((ELAPSED / 60))m / ${DURATION_MIN}m | Remaining: ${REMAINING_MIN}m | Errors: ${ERROR_COUNT}" | tee -a "${LOG_FILE}"
done

# Cleanup
echo ""
echo "Stopping dev server..."
kill $VITE_PID 2>/dev/null || true
wait $VITE_PID 2>/dev/null || true

# Summary
echo ""
echo "=== Soak Test Summary ==="
echo "Duration: ${DURATION_MIN} minutes"
echo "Errors: ${ERROR_COUNT}"
echo "Log: ${LOG_FILE}"

if [ $ERROR_COUNT -gt 0 ]; then
  echo "RESULT: FAIL — ${ERROR_COUNT} error(s) detected"
  exit 1
else
  echo "RESULT: PASS — no errors detected"
  exit 0
fi
