#!/bin/bash
#
# Lost Worlds Control Panel
# A simple menu to manage the game
#

cd "$(dirname "$0")"

# Store script path and initial modification time for auto-refresh
SCRIPT_PATH="$0"
SCRIPT_MTIME=$(stat -f %m "$SCRIPT_PATH" 2>/dev/null || stat -c %Y "$SCRIPT_PATH" 2>/dev/null)

# Auto-refresh: re-exec if script was modified
check_for_updates() {
    local current_mtime=$(stat -f %m "$SCRIPT_PATH" 2>/dev/null || stat -c %Y "$SCRIPT_PATH" 2>/dev/null)
    if [ "$current_mtime" != "$SCRIPT_MTIME" ]; then
        echo -e "${CYAN}Control panel updated - reloading...${NC}"
        sleep 1
        exec "$SCRIPT_PATH"
    fi
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if a port is in use
port_in_use() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Show status
show_status() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}           SYSTEM STATUS${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"

    if port_in_use 5173; then
        echo -e "  Client (5173):  ${GREEN}● Running${NC}"
    elif port_in_use 5174; then
        echo -e "  Client (5174):  ${GREEN}● Running${NC}"
    else
        echo -e "  Client:         ${RED}○ Stopped${NC}"
    fi

    if port_in_use 3001; then
        echo -e "  Server (3001):  ${GREEN}● Running${NC}"
    else
        echo -e "  Server:         ${RED}○ Stopped${NC}"
    fi

    # Git status
    has_changes=false
    has_unpushed=false

    if git status --porcelain | grep -q .; then
        has_changes=true
    fi

    unpushed=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    if [ "$unpushed" -gt 0 ]; then
        has_unpushed=true
    fi

    if [ "$has_changes" = true ] && [ "$has_unpushed" = true ]; then
        echo -e "  Git:            ${YELLOW}● Uncommitted + $unpushed to push${NC}"
    elif [ "$has_changes" = true ]; then
        echo -e "  Git:            ${YELLOW}● Uncommitted changes${NC}"
    elif [ "$has_unpushed" = true ]; then
        echo -e "  Git:            ${CYAN}● $unpushed commit(s) to push${NC}"
    else
        echo -e "  Git:            ${GREEN}● Clean & synced${NC}"
    fi
    echo ""
}

# Show menu
show_menu() {
    clear
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║     ⚔️  LOST WORLDS CONTROL PANEL ⚔️                       ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    show_status

    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}              COMMANDS${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}1)${NC} Start Game (client only)"
    echo -e "  ${GREEN}2)${NC} Start Game + Multiplayer Server"
    echo -e "  ${GREEN}3)${NC} Stop All"
    echo ""
    echo -e "  ${YELLOW}4)${NC} Git: View changes"
    echo -e "  ${YELLOW}5)${NC} Git: Commit & Push"
    echo -e "  ${YELLOW}6)${NC} Git: Quick Push (no prompt)"
    echo ""
    echo -e "  ${BLUE}7)${NC} Run Tests (unit)"
    echo -e "  ${BLUE}8)${NC} Open E2E Test Runner (browser)"
    echo -e "  ${BLUE}9)${NC} Install/Update Dependencies"
    echo ""
    echo -e "  ${RED}0)${NC} Exit"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
}

# Start client only
start_client() {
    echo -e "${YELLOW}Starting client...${NC}"

    # Kill existing
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    lsof -ti:5174 | xargs kill -9 2>/dev/null

    npm run dev &
    sleep 2

    if port_in_use 5173; then
        echo -e "${GREEN}Client started at http://localhost:5173${NC}"
        open "http://localhost:5173" 2>/dev/null
    elif port_in_use 5174; then
        echo -e "${GREEN}Client started at http://localhost:5174${NC}"
        open "http://localhost:5174" 2>/dev/null
    fi
}

# Start full (client + server)
start_full() {
    echo -e "${YELLOW}Starting multiplayer server...${NC}"

    # Kill existing
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    lsof -ti:5174 | xargs kill -9 2>/dev/null
    lsof -ti:3001 | xargs kill -9 2>/dev/null

    # Check server dependencies
    if [ ! -d "server/node_modules" ]; then
        echo -e "${YELLOW}Installing server dependencies...${NC}"
        (cd server && npm install)
    fi

    # Start server
    (cd server && npm start) &
    sleep 2

    echo -e "${YELLOW}Starting client...${NC}"
    npm run dev &
    sleep 2

    if port_in_use 3001; then
        echo -e "${GREEN}Server running on port 3001${NC}"
    fi

    if port_in_use 5173; then
        echo -e "${GREEN}Client started at http://localhost:5173${NC}"
        open "http://localhost:5173" 2>/dev/null
    elif port_in_use 5174; then
        echo -e "${GREEN}Client started at http://localhost:5174${NC}"
        open "http://localhost:5174" 2>/dev/null
    fi
}

# Stop all
stop_all() {
    echo -e "${YELLOW}Stopping all processes...${NC}"

    lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "  Stopped client (5173)"
    lsof -ti:5174 | xargs kill -9 2>/dev/null && echo "  Stopped client (5174)"
    lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "  Stopped server (3001)"

    echo -e "${GREEN}Done!${NC}"
}

# View git changes
git_status() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}           GIT STATUS${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo ""
    git status
    echo ""
    echo -e "${YELLOW}Changed files:${NC}"
    git diff --stat
    echo ""
}

# Commit and push
git_push() {
    echo ""

    # Check for uncommitted changes
    has_changes=false
    if git status --porcelain | grep -q .; then
        has_changes=true
    fi

    # Check for unpushed commits
    has_unpushed=false
    unpushed_count=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    if [ "$unpushed_count" -gt 0 ]; then
        has_unpushed=true
    fi

    # Nothing to do?
    if [ "$has_changes" = false ] && [ "$has_unpushed" = false ]; then
        echo -e "${GREEN}Everything is up to date!${NC}"
        echo -e "No uncommitted changes and no unpushed commits."
        return
    fi

    # Show what we have
    if [ "$has_changes" = true ]; then
        echo -e "${CYAN}Uncommitted changes:${NC}"
        git status --short
        echo ""

        echo -n "Enter commit message (or 'cancel'): "
        read msg </dev/tty

        if [ "$msg" = "cancel" ]; then
            echo -e "${YELLOW}Cancelled.${NC}"
            return
        fi

        if [ -n "$msg" ]; then
            echo -e "${YELLOW}Adding files...${NC}"
            git add -A

            echo -e "${YELLOW}Committing...${NC}"
            git commit -m "$msg"

            if [ $? -ne 0 ]; then
                echo -e "${RED}Commit failed.${NC}"
                return
            fi
        fi
    fi

    # Check again for unpushed (including any new commit)
    unpushed_count=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

    if [ "$unpushed_count" -gt 0 ]; then
        echo ""
        echo -e "${CYAN}$unpushed_count commit(s) to push:${NC}"
        git log --oneline @{u}..HEAD
        echo ""

        echo -e "${YELLOW}Pushing to GitHub...${NC}"
        git push 2>&1

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Successfully pushed to GitHub!${NC}"
            echo -e "${GREEN}Vercel will auto-deploy in ~60 seconds.${NC}"
        else
            echo -e "${RED}Push failed. You may need to run: git push --set-upstream origin master${NC}"
        fi
    else
        echo -e "${GREEN}Nothing to push.${NC}"
    fi
}

# Install dependencies
install_deps() {
    echo -e "${YELLOW}Installing client dependencies...${NC}"
    rm -rf node_modules package-lock.json
    npm install

    echo -e "${YELLOW}Installing server dependencies...${NC}"
    (cd server && rm -rf node_modules package-lock.json && npm install)

    echo -e "${GREEN}Done!${NC}"
}

# Quick push (no commit, just push existing commits)
git_quick_push() {
    echo ""
    unpushed_count=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

    if [ "$unpushed_count" -eq 0 ]; then
        echo -e "${GREEN}Nothing to push - already up to date.${NC}"
        return
    fi

    echo -e "${CYAN}$unpushed_count commit(s) to push:${NC}"
    git log --oneline @{u}..HEAD
    echo ""

    # Run build first to catch TypeScript errors
    echo -e "${YELLOW}Running build to verify...${NC}"
    if ! npm run build > /dev/null 2>&1; then
        echo -e "${RED}Build failed! Fix errors before pushing:${NC}"
        npm run build 2>&1
        return 1
    fi
    echo -e "${GREEN}Build passed!${NC}"
    echo ""

    echo -e "${YELLOW}Pushing to GitHub...${NC}"
    git push 2>&1

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully pushed to GitHub!${NC}"
        echo -e "${GREEN}Vercel will auto-deploy in ~60 seconds.${NC}"
        echo ""
        echo -e "${CYAN}Test runner will be available at:${NC}"
        echo -e "  ${BLUE}https://lost-worlds-web.vercel.app/test-runner.html${NC}"
    else
        echo -e "${RED}Push failed. Check your git credentials.${NC}"
    fi
}

# Run unit tests
run_tests() {
    echo -e "${YELLOW}Running unit tests...${NC}"
    npm run test:run

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
    else
        echo -e "${RED}Some tests failed.${NC}"
    fi
}

# Open E2E test runner
open_test_runner() {
    echo ""
    echo -e "${CYAN}Opening E2E Test Runner...${NC}"
    echo ""
    echo -e "The test runner opens the game in two iframes and automatically"
    echo -e "runs through the multiplayer flow (create room, join, battle)."
    echo ""

    # Check if we're running locally or use Vercel
    if port_in_use 5173 || port_in_use 5174; then
        local_port=$(port_in_use 5173 && echo "5173" || echo "5174")
        echo -e "${YELLOW}Local server detected - using local test runner${NC}"
        open "http://localhost:$local_port/test-runner.html" 2>/dev/null
    else
        echo -e "${YELLOW}Opening Vercel test runner...${NC}"
        open "https://lost-worlds-web.vercel.app/test-runner.html" 2>/dev/null
    fi

    echo ""
    echo -e "${GREEN}Test runner opened in browser.${NC}"
    echo -e "Click 'Run All Tests' to start the automated tests."
}

# Main loop
while true; do
    check_for_updates  # Auto-reload if script was modified
    show_menu
    echo -n "Enter choice [0-9]: "
    read choice </dev/tty

    case $choice in
        1)
            start_client
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        2)
            start_full
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        3)
            stop_all
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        4)
            git_status
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        5)
            git_push
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        6)
            git_quick_push
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        7)
            run_tests
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        8)
            open_test_runner
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        9)
            install_deps
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        0)
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            sleep 1
            ;;
    esac
done
