#!/bin/sh
set -e

SERVICE=${SERVICE:-web}
RUN_MODE=${NODE_ENV:-production}

echo "Starting service: $SERVICE in $RUN_MODE mode"

if [ "$SERVICE" = "ws" ] || [ "$SERVICE" = "ws-server" ]; then
  export PORT=${PORT:-8099}
  echo "Starting WebSocket server on port $PORT"
  
  if [ "$RUN_MODE" = "development" ]; then
    exec npm run dev -w apps/ws-server
  else
    exec npm run start -w apps/ws-server
  fi
else
  export PORT=${PORT:-8090}
  echo "Starting web app on port $PORT"
  
  if [ "$RUN_MODE" = "production" ]; then
    if [ -z "${NEXT_PUBLIC_WS_URL:-}" ]; then
      echo 'ERROR: NEXT_PUBLIC_WS_URL must be set' >&2
      exit 1
    fi
    if [ -z "${NEXT_PUBLIC_API_URL:-}" ]; then
      echo 'ERROR: NEXT_PUBLIC_API_URL must be set' >&2
      exit 1
    fi
    
    echo "Injecting runtime environment variables..."
    cat > apps/web/public/runtime-env.js <<EOF
window.__NEXT_PUBLIC_WS_URL = "${NEXT_PUBLIC_WS_URL}";
window.__NEXT_PUBLIC_API_URL = "${NEXT_PUBLIC_API_URL}";
EOF
    
    exec npm run start -w apps/web
  else
    exec npm run dev -w apps/web
  fi
fi
