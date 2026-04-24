# 01 — Tổng quan

## Mô tả

Poker Texas Hold'em real-time chơi LAN/web, tối đa 9 người mỗi phòng. Server giữ toàn bộ state trong memory (không database), giao tiếp với client qua Socket.IO.

## Stack

- **Server**: Node.js + Express + Socket.IO
- **Hand evaluation**: [`pokersolver`](https://www.npmjs.com/package/pokersolver) (node_modules)
- **Client**: HTML + CSS + vanilla JS (không framework)
- **Audio**: Web Audio API sinh âm thanh trực tiếp (không file mp3)

## Kiến trúc

```
┌──────────────────┐       Socket.IO         ┌──────────────────────┐
│ Browser (client) │ ◄─────────────────────► │ Node.js server       │
│                  │                         │                      │
│  index.html      │                         │  server.js           │
│  app.js          │                         │   ├─ Express (static)│
│  style.css       │                         │   ├─ Socket.IO       │
│  i18n.js         │                         │   ├─ Game logic      │
│  sounds.js       │                         │   └─ File logger     │
└──────────────────┘                         │                      │
                                             │  pokersolver         │
                                             └──────────────────────┘
                                                       │
                                                       ▼
                                             logs/game-YYYY-MM-DD.log
```

Không có DB, không có auth — tất cả state là in-memory Map các room.

## Cấu trúc thư mục

```
poker-game/
├── server.js               # Toàn bộ game logic + Socket.IO + file log
├── package.json
├── public/
│   ├── index.html          # UI markup (profile/lobby/room/game/overlays)
│   ├── app.js              # Client logic: sockets, render, user input
│   ├── style.css           # Responsive CSS (mobile-first)
│   ├── i18n.js             # Dịch vi/en
│   └── sounds.js           # SFX (Web Audio API)
├── logs/
│   └── game-YYYY-MM-DD.log # Daily log
├── docs/                   # Tài liệu (file này)
├── FLOW.md                 # Tóm tắt flow cấp cao
├── README.md
└── DEPLOY.md               # Hướng dẫn deploy
```

## Các khái niệm chính

| Khái niệm | Mô tả |
|---|---|
| **Room** | Phòng chơi có id, host, settings, danh sách `players` |
| **Game** | State của ván đang chơi (deck, pot, sidePots, stage, currentTurn, ...) |
| **Stage** | `preflop` → `flop` → `turn` → `river` → `showdown` → `finished` |
| **SidePot** | `{ amount, eligible[] }` — tạo khi có all-in |
| **Spectator** | Người vào giữa ván, chỉ xem; tự động vào ván sau |
| **LateJoiner** | Khi `lockAfterStart=true`, người mới chỉ xem tới khi game kết thúc session |
| **Session winner** | Người đạt ≥ 80% tổng chips toàn phòng thì thắng session |

## Quy ước đặt tên

- `room.players[]` — là player ở **cấp phòng** (tồn tại xuyên ván).
- `room.game.players[]` — bản sao tại thời điểm bắt đầu ván (chỉ chứa người đang chơi ván đó).
- `chips` được sync từ `game.players` về `room.players` sau mỗi ván (`syncChips`).

## Đọc tiếp

- [02-user-flow.md](02-user-flow.md) — flow người dùng
- [03-hand-flow.md](03-hand-flow.md) — flow 1 ván
- [04-server-architecture.md](04-server-architecture.md) — chi tiết server
