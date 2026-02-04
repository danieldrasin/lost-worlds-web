#!/bin/bash
#
# Stop all Lost Worlds processes
#

echo "Stopping Lost Worlds processes..."

# Kill processes on the ports we use
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "Stopped client (5173)"
lsof -ti:5174 | xargs kill -9 2>/dev/null && echo "Stopped client (5174)"
lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "Stopped server (3001)"

echo "Done!"
