# Poker LAN

Texas Hold'em Poker game for LAN play. Real-time multiplayer via Socket.IO.

## Tech Stack

- **Server:** Node.js + Express + Socket.IO
- **Client:** Vanilla HTML/CSS/JS
- **Hand Evaluation:** pokersolver

## Requirements

- Node.js >= 18

## Setup

```bash
npm install
npm start
```

Server runs at `http://localhost:3000` and displays your LAN IP on startup.

## How to Play

1. Open browser at `http://<LAN-IP>:3000`
2. Enter name, choose avatar, set chips (100 - 10000)
3. Create or join a room (max 9 players)
4. Host clicks **Start Game** to begin
5. Next hands start automatically after each round

## Features

- Room system with lobby browser
- Dealer rotation, small/big blinds
- Full actions: Check, Call, Raise, Fold, All-In
- Pot size betting buttons (1/3, 1/2, 2/3, Pot)
- Hand evaluation with showdown
- Side pot & split pot support
- 30s turn timer with auto-fold
- Auto next hand after 5s
- Mobile responsive UI
- In-game help guide with hand rankings

## Project Structure

```
poker-game/
  server.js           # Game server + logic
  public/
    index.html         # HTML layout
    style.css          # Styles (mobile-first)
    app.js             # Client logic
  package.json
```
