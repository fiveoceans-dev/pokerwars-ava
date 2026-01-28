#!/bin/bash

# PokerWars WebSocket Server - Local Development Script
# This script starts the local WebSocket server for development and testing

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failures

# Configuration
SERVER_PORT=${PORT:-8081}
NODE_ENV=${NODE_ENV:-development}
ALLOWED_WS_ORIGINS=${ALLOWED_WS_ORIGINS:-}
DEV_ALLOWED_WS_ORIGINS=${DEV_ALLOWED_WS_ORIGINS:-}
STARTUP_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "🎮 Starting PokerWars WebSocket Server (Local Development)"
echo "📅 Started at: $STARTUP_TIMESTAMP"
echo "🌍 Environment: $NODE_ENV"
echo "🔌 Port: $SERVER_PORT"
echo "🌐 Allowed Origins: ${ALLOWED_WS_ORIGINS:-<unset>}"
echo "🌐 Dev-only Origins: ${DEV_ALLOWED_WS_ORIGINS:-<unset>}"
echo ""

if [ -z "$ALLOWED_WS_ORIGINS" ] && [ -z "$DEV_ALLOWED_WS_ORIGINS" ]; then
    echo "❌ No WebSocket origins configured. Set ALLOWED_WS_ORIGINS and/or DEV_ALLOWED_WS_ORIGINS in your .env."
    exit 1
fi

# Check if we're in the server directory
if [ ! -f "src/index.ts" ]; then
    echo "❌ Error: Run this script from the server directory"
    echo "   cd packages/nextjs/server && ./server-local.sh"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Install it from: https://nodejs.org/"
    exit 1
fi

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not available"
    echo "   Please install npm/node properly"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if port is already in use
if lsof -Pi :$SERVER_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port $SERVER_PORT is already in use"
    echo "🔍 Process using port $SERVER_PORT:"
    lsof -Pi :$SERVER_PORT -sTCP:LISTEN || true
    echo ""
    read -p "❓ Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Exiting. Please stop the process using port $SERVER_PORT first."
        exit 1
    fi
fi

echo "🚀 Starting WebSocket server..."
echo "   Local server will be available at: ws://localhost:$SERVER_PORT"
echo "   Game tables: Andromeda Station, Orion Outpost"
echo ""
echo "💡 Press Ctrl+C to stop the server"
echo ""
echo "🎯 Quick Start Guide:"
echo "   • WebSocket URL: ${ALLOWED_WS_ORIGINS%%,*}"
echo "   • Health Check: curl http://localhost:$SERVER_PORT/health"
echo "   • Available Tables: andromeda, orion"
echo "   • Configure frontend: export NEXT_PUBLIC_WS_URL=<your ws url>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Function to handle cleanup on script exit
cleanup_server() {
    echo ""
    echo "⏹️  Shutting down WebSocket server..."
    echo "📅 Stopped at: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "✅ Local server stopped cleanly"
}

# Set up signal handlers for graceful shutdown
trap cleanup_server INT TERM EXIT

# Set environment variables for local development
export NODE_ENV="$NODE_ENV"
export PORT="$SERVER_PORT"
export ALLOWED_WS_ORIGINS="$ALLOWED_WS_ORIGINS"
export DEV_ALLOWED_WS_ORIGINS="$DEV_ALLOWED_WS_ORIGINS"

# Optional: Set up Redis URL for local development (if Redis is available)
if command -v redis-cli &> /dev/null && redis-cli ping >/dev/null 2>&1; then
    echo "🔴 Redis detected and running locally"
    export REDIS_URL="redis://localhost:6379"
else
    echo "📝 Redis not available - using in-memory storage"
fi

# Start the server with ts-node for development
exec npx ts-node src/index.ts
