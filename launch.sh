#!/bin/bash
#
# Lost Worlds Combat Game Launcher
# Starts the development server and opens the browser
#

cd "$(dirname "$0")"

# Check if node_modules exists and has correct platform binaries
NEEDS_REINSTALL=false

if [ ! -d "node_modules" ]; then
    NEEDS_REINSTALL=true
elif [ ! -d "node_modules/@rollup/rollup-darwin-arm64" ] && [[ "$(uname -m)" == "arm64" ]]; then
    echo "Detected missing platform-specific binaries. Reinstalling..."
    NEEDS_REINSTALL=true
elif [ ! -d "node_modules/@rollup/rollup-darwin-x64" ] && [[ "$(uname -m)" == "x86_64" ]] && [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected missing platform-specific binaries. Reinstalling..."
    NEEDS_REINSTALL=true
fi

if [ "$NEEDS_REINSTALL" = true ]; then
    echo "Installing dependencies (this may take a moment)..."
    rm -rf node_modules package-lock.json 2>/dev/null
    npm install
    if [ $? -ne 0 ]; then
        echo "Failed to install dependencies. Please try manually:"
        echo "  rm -rf node_modules package-lock.json"
        echo "  npm install"
        exit 1
    fi
fi

# Kill any existing dev server on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "Starting Lost Worlds Combat Game..."
echo ""

# Start the dev server in the background
npm run dev &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 3

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "http://localhost:5173"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "http://localhost:5173" 2>/dev/null || sensible-browser "http://localhost:5173" 2>/dev/null
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows
    start "http://localhost:5173"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           LOST WORLDS COMBAT GAME                          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Server running at: http://localhost:5173                  ║"
echo "║  Press Ctrl+C to stop the server                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Wait for the server process
wait $SERVER_PID
