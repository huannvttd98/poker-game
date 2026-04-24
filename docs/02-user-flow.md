# 02 — User Flow

Hành trình người chơi từ lúc mở web đến khi thắng/thua session.

## Sơ đồ tổng

```
┌──────────────┐
│  Profile     │  Nhập tên, chọn avatar
│  Screen      │  (index.html:257, app.js:62)
└──────┬───────┘
       │  enterLobby()
       ▼
┌──────────────┐
│  Lobby       │  ─── Thấy danh sách room
│  Screen      │  ─── [Create Room] → emit createRoom
│  (:281)      │  ─── [Join]        → emit joinRoom
│              │  ─── [Watch]       → emit joinRoom (spectator)
└──────┬───────┘
       │
       ▼
┌──────────────┐   lateJoiner hoặc room.status='playing'
│  Room        │────────────────────────────┐
│  Screen      │                            │
│  (:366)      │                            │
│              │                            │
│  - Host:      [Start Game] → emit startGame
│  - Tất cả:    [Ready]     → emit toggleReady
│              │                            │
└──────┬───────┘                            │
       │ roomUpdate (status='playing')       │
       │                                    │
       ▼                                    ▼
┌──────────────┐                    ┌──────────────┐
│  Game Screen │                    │  Spectator   │
│  (:382)      │                    │  (xem ván)   │
│              │                    │              │
│  Chơi ván… xem 03-hand-flow.md    │              │
└──────┬───────┘                    └──────┬───────┘
       │                                    │
       │  handFinished                      │
       ▼                                    │
┌──────────────┐                            │
│  Result      │  Hiện winners, bài, pot    │
│  Overlay     │  Nút [Ready] cho ván sau   │
│  (:570)      │  Countdown auto-start      │
└──────┬───────┘                            │
       │                                    │
       │  Tất cả ready → next hand ──────── ┘
       │
       │  checkGameWinner() true
       ▼
┌──────────────┐
│  Game Won    │  Hiện bảng xếp hạng
│  Overlay     │  winner medal animation
│  (:575)      │
└──────┬───────┘
       │ backToLobby (sau 5s)
       ▼
  Room Screen (chips reset về startingChips)
```

## Các bước chi tiết

### 1. Profile → Lobby

- Người dùng nhập tên, chọn avatar.
- Click "Enter Lobby" → local state, không gửi socket.
- `enterLobby()` ẩn `profile-screen`, hiện `lobby-screen` (app.js:62).
- Socket connect tự động, server emit `roomList` (server.js:924).

### 2. Tạo room

- Click "Create Room" → nhập tên room + settings (chips, blinds, maxPlayers, turnTime, readyTime, lockAfterStart).
- Client emit `createRoom` (app.js:126).
- Server tạo room trong Map `rooms`, broadcast `roomList`, trả `roomUpdate` (server.js:927).
- Client chuyển sang Room Screen.

### 3. Join room

- Click Join trong danh sách **hoặc** nhập room code.
- Client emit `joinRoom` (app.js:137).
- Server:
  - Nếu `room.status === 'playing'` → set `spectator=true` (server.js:955).
  - Nếu `lockAfterStart` bật + đang playing → set `lateJoiner=true` (server.js:958).
  - Ngược lại → join như player thường.
- Emit `roomUpdate` cho toàn phòng; emit `spectatorMode` riêng cho người vừa vào nếu là spectator.

### 4. Ready & bắt đầu ván đầu tiên

- Trong Room Screen, mọi người bấm "Ready" → emit `toggleReady` (app.js:181).
- Host bấm "Start Game" khi đã có đủ ready → emit `startGame` (app.js:189).
- Server gọi `startGame(room)` (server.js:238):
  - Lọc player active (connected, không spectator, chips > 0).
  - Phát 2 bài, post blinds, khởi tạo `room.game`.
  - Set `room.status = 'playing'`.
- Server broadcast `gameUpdate` → client render Game Screen.

### 5. Chơi ván

Chi tiết trong [03-hand-flow.md](03-hand-flow.md). Mỗi action:
- Client emit `action` với `{action, amount}` (app.js:677).
- Server validate + xử lý trong `handleAction` (server.js:377).
- Server broadcast `gameUpdate` (có thể per-player để ẩn bài của đối thủ).

### 6. Kết thúc ván

- Khi ván xong (others_folded hoặc showdown), server emit `handFinished` với `winners, hands, reason` (server.js:341 hoặc 674).
- Client hiện Result Overlay (app.js:685).
- Server set `room.status = 'waiting_next'`, emit `readyCountdown` với `deadline` (server.js:739).

### 7. Ván tiếp theo / End session

- Trong countdown:
  - Ai bấm Ready → emit `toggleReady`.
  - Countdown hết → `autoStartWithReady()` (server.js:752):
    - Ai chưa ready → đánh dấu spectator.
    - Nếu ≥ 2 player ready → gọi `startGame` ván mới.
    - Nếu < 2 → emit `backToLobby` (server.js:769).
- Nếu ai đó đạt ≥ 80% tổng chips sau ván → `checkGameWinner` true → emit `gameWon` (server.js:705).
  - Hiện Game Won Overlay, sau 5s emit `backToLobby`, reset chips (server.js:710).

### 8. Disconnect / Exit

- Client close tab hoặc bấm Exit → socket disconnect → `handleDisconnect` (server.js:1106):
  - Nếu đang trong ván → mark folded, auto-advance turn nếu cần.
  - Remove khỏi `room.players`.
- Người khác nhận `roomUpdate`.
