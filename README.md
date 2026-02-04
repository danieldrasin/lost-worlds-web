# Lost Worlds Combat Game

A web-based implementation of the Lost Worlds combat book game system.

## Quick Start

### Single Player / Local 2-Player
Double-click **`Lost Worlds.command`** (macOS) or run:
```bash
./launch.sh
```

### Online Multiplayer
For playing against friends on other devices, run:
```bash
./launch-full.sh
```
This starts both the game client and the multiplayer server.

## Game Modes

- **🤖 vs AI** - Play against a computer opponent (random move selection)
- **👥 Local** - Two players on the same device (hot-seat)
- **🌐 Online** - Play against a friend on another device

## Online Multiplayer Setup

1. Run `./launch-full.sh` to start both server and client
2. Choose "Online" mode and select your character
3. Click "Find Opponent" → "Create Room"
4. Share the 6-character room code with your friend
5. Your friend joins with the same code on their device

### Playing on Mobile
1. Ensure your phone is on the same WiFi network
2. Find your computer's local IP (e.g., `192.168.1.100`)
3. On your phone, go to `http://192.168.1.100:5173`

## Project Structure

```
lost-worlds-web/
├── public/
│   └── characters/        # Character JSON definitions
├── server/                # Multiplayer WebSocket server
├── src/
│   ├── data/             # Character loader
│   ├── domain/           # Game logic and types
│   │   ├── models/       # Battle engine
│   │   └── types/        # TypeScript interfaces
│   ├── multiplayer/      # Socket.io client
│   ├── state/            # Zustand game store
│   └── ui/               # React components
└── launch*.sh            # Launcher scripts
```

## Adding New Characters

1. Create a JSON file in `public/characters/` (see existing files for format)
2. Add the character ID to `public/characters/index.json`
3. No code changes required!

## Hosting Online

For internet multiplayer (not just local network):

### Free Hosting Options

**Frontend (Vercel/Netlify):**
1. Push to GitHub
2. Connect to Vercel or Netlify
3. Deploy automatically

**Server (Render/Railway):**
1. Deploy the `server/` folder
2. Set environment variable `PORT`
3. Update `VITE_SERVER_URL` in client build

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Zustand
- **Backend:** Node.js, Express, Socket.io
- **Game Logic:** Domain-driven design with pure TypeScript

## Credits

Based on the original Lost Worlds combat book game system.
