#!/bin/bash
#
# Lost Worlds Control Panel
# A simple menu to manage the game
#

cd "$(dirname "$0")"

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
    if git status --porcelain | grep -q .; then
        echo -e "  Git:            ${YELLOW}● Uncommitted changes${NC}"
    else
        echo -e "  Git:            ${GREEN}● Clean${NC}"
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
    echo ""
    echo -e "  ${BLUE}6)${NC} Install/Update Dependencies"
    echo -e "  ${BLUE}7)${NC} Build for Production"
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

    # Check for changes
    if ! git status --porcelain | grep -q .; then
        echo -e "${GREEN}No changes to commit!${NC}"
        return
    fi

    echo -e "${CYAN}Changes to commit:${NC}"
    git status --short
    echo ""

    echo -n "Enter commit message (or 'cancel'): "
    read msg </dev/tty

    if [ "$msg" = "cancel" ] || [ -z "$msg" ]; then
        echo -e "${YELLOW}Cancelled.${NC}"
        return
    fi

    echo -e "${YELLOW}Adding files...${NC}"
    git add -A

    echo -e "${YELLOW}Committing...${NC}"
    git commit -m "$msg"

    if [ $? -ne 0 ]; then
        echo -e "${RED}Commit failed.${NC}"
        return
    fi

    echo -e "${YELLOW}Pushing to GitHub...${NC}"
    git push 2>&1

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully pushed to GitHub!${NC}"
        echo -e "${GREEN}Vercel will auto-deploy in ~60 seconds.${NC}"
    else
        echo -e "${RED}Push failed. You may need to run: git push --set-upstream origin master${NC}"
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

# Build for production
build_prod() {
    echo -e "${YELLOW}Building for production...${NC}"
    npm run build

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Build complete! Output in ./dist/${NC}"
    else
        echo -e "${RED}Build failed.${NC}"
    fi
}

# Main loop
while true; do
    show_menu
    echo -n "Enter choice [0-7]: "
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
            install_deps
            echo -n "Press Enter to continue..."
            read </dev/tty
            ;;
        7)
            build_prod
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
