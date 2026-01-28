#!/bin/bash

# Test script for validating player join/leave workflow
echo "🧪 Testing Player Join/Leave Workflow"
echo "======================================"

SERVER_URL="${1:-http://localhost:8081}"
WS_URL="${SERVER_URL/http/ws}"

echo "🌐 Testing server: $SERVER_URL"
echo "🔌 WebSocket URL: $WS_URL"
echo ""

# Test 1: Health check
echo "1️⃣ Testing health check endpoint..."
HEALTH_RESPONSE=$(curl -s "$SERVER_URL/health" || echo "FAILED")
if [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    echo "   ✅ Health check passed"
    echo "   📊 Response: $HEALTH_RESPONSE"
else
    echo "   ❌ Health check failed: $HEALTH_RESPONSE"
fi
echo ""

# Test 2: Tables API
echo "2️⃣ Testing tables API endpoint..."
TABLES_RESPONSE=$(curl -s "$SERVER_URL/api/tables" || echo "FAILED")
if [[ $TABLES_RESPONSE == *"tables"* ]]; then
    echo "   ✅ Tables API working"
    echo "   📊 Response: $TABLES_RESPONSE"
else
    echo "   ❌ Tables API failed: $TABLES_RESPONSE"
fi
echo ""

# Test 3: HTTP to WebSocket upgrade
echo "3️⃣ Testing HTTP response (should indicate WebSocket requirement)..."
HTTP_RESPONSE=$(curl -s "$SERVER_URL/" || echo "FAILED")
if [[ $HTTP_RESPONSE == *"WebSocket"* ]]; then
    echo "   ✅ HTTP response indicates WebSocket server"
    echo "   📝 Response: $HTTP_RESPONSE"
else
    echo "   ❌ HTTP response unexpected: $HTTP_RESPONSE"
fi
echo ""

echo "🎯 Manual Testing Instructions:"
echo "==============================="
echo "1. Start the local server:"
echo "   cd packages/nextjs/server && npm run server-local"
echo ""
echo "2. Start the frontend:"
echo "   cd packages/nextjs && yarn dev"
echo ""
echo "3. Open browser to http://localhost:3000"
echo ""
echo "4. Connect wallet and try to join a seat"
echo ""
echo "5. Check browser console for logs:"
echo "   - 🪑 Attempting to join seat X"
echo "   - 📤 Sending SIT command"  
echo "   - 📨 Received TABLE_SNAPSHOT message"
echo "   - 📸 Applying TABLE_SNAPSHOT"
echo "   - 👤 Player X: [wallet]... (chips, state)"
echo ""
echo "6. Check server logs for:"
echo "   - ✅ Player [nickname] successfully seated"
echo "   - 📊 Table now has X players"
echo ""
echo "✅ Test script completed!"
