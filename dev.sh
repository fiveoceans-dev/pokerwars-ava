#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT_DIR"

echo "Starting WS server (apps/ws-server) and Web app (apps/web) with dev scripts..."

# Start WS server
cd "$ROOT_DIR"
npm run dev -w apps/ws-server &
WS_PID=$!
echo "WS server running (PID $WS_PID)"

# Start Web app
npm run dev -w apps/web &
WEB_PID=$!
echo "Web app running (PID $WEB_PID)"

trap "echo 'Stopping dev processes...'; kill $WS_PID $WEB_PID 2>/dev/null" INT TERM

wait $WS_PID
wait $WEB_PID
