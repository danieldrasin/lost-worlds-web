#!/bin/bash
#
# Lost Worlds Combat Game - Full Launcher
# Starts both the multiplayer server and the web client
#

cd "$(dirname "$0")"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        LOST WORLDS COMBAT GAME - FULL LAUNCHER             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check and install client dependencies
if [ ! -d "node_modules" ] || [ ! -d "node_modules/@rollup" ]; then
    echo "📦 Installing client dependencies..."
    rm -rf node_modules package-lock.json 2>/dev/null
    npm install
fi

# Check and install server dependencies
if [ ! -d "server/node_modules" ]; then
    echo "📦 Installing server dependencies..."
    cd server
    npm install
    cd ..
fi

# Kill any existing processes on our ports
echo "🔄 Cleaning up old processes..."
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1

# Start the multiplayer server
echo "🖥️  Starting multiplayer server..."
cd server
npm start &
SERVER_PID=$!
cd ..
sleep 2

# Start the web client
echo "🌐 Starting web client..."
npm run dev &
CLIENT_PID=$!
sleep 3

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:5173"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:5173" 2>/dev/null
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Lost Worlds is running!                                ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  🎮 Game:   http://localhost:5173                          ║"
echo "║  🖥️  Server: http://localhost:3001                          ║"
echo "║                                                            ║"
echo "║  📱 For mobile: Connect to same WiFi and use your          ║"
echo "║     computer's local IP instead of localhost               ║"
echo "║                                                            ║"
echo "║  Press Ctrl+C to stop everything                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Handle shutdown
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
