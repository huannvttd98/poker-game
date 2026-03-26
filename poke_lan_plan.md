# 🃏 Poker LAN Game - Development Plan

## 🎯 Mục tiêu
- Xây dựng game Poker (Texas Hold’em)
- Chạy trong mạng LAN
- Realtime bằng Node.js + Socket.IO
- Client truy cập qua IP nội bộ

---

# 🗺️ Tổng quan kiến trúc

Client (Browser - Vanilla HTML/CSS/JS)
        ↓
Socket.IO (Realtime)
        ↓
Node.js Server (Game Logic)
        ↓
Memory (Game State)

## Tech Stack
- **Server:** Node.js + Express + Socket.IO
- **Client:** HTML/CSS/JS (không cần framework)
- **Hand Evaluation:** pokersolver (thư viện)
- **Card Assets:** CSS-based hoặc sprite sheet

---

# ⚙️ PHASE 1 — Setup nền tảng

## 🎯 Goal
Server chạy được trong LAN + realtime OK

## Tasks
- Khởi tạo project Node.js
- Cài đặt Express
- Cài đặt Socket.IO
- Setup server listen 0.0.0.0
- Lấy IP LAN (192.168.x.x)
- Test truy cập từ máy khác
- Test socket connection

---

# 👥 PHASE 2 — Player & Room System

## 🎯 Goal
Cho phép nhiều người chơi join cùng bàn

## Data structure

### Player
{
  id,
  name,
  chips,
  status
}

### Room
{
  roomId,
  players: [],
  hostId
}

## Tasks
- Tạo room
- Join room (max 9 players)
- Leave room
- Sync danh sách player realtime
- Handle disconnect + reconnect (giữ state player)
- Ready system (host start game khi đủ người ready)

---

# 🃏 PHASE 3 — Game Logic Poker

## 🎯 Goal
Chơi được 1 ván poker hoàn chỉnh

## Data structure
{
  deck: [],
  players: [],
  pot: 0,
  sidePots: [],
  communityCards: [],
  currentTurn: null,
  stage: "preflop",
  dealerIndex: 0,
  smallBlindIndex: 1,
  bigBlindIndex: 2,
  smallBlindAmount: 10,
  bigBlindAmount: 20,
  currentBet: 0,
  minRaise: 0
}

## Tasks

### Deck
- Tạo bộ bài 52 lá
- Shuffle

### Gameplay
- Chia 2 lá cho mỗi player
- Xử lý turn system
- Validate action

### Blind & Dealer System
- Dealer button rotation mỗi ván
- Small blind (player sau dealer)
- Big blind (player sau small blind)
- Auto post blind khi bắt đầu ván

### Actions
- bet
- call
- raise (min raise = big blind hoặc raise trước đó)
- fold
- check (khi không cần call)
- all-in

### Game Flow
- Preflop (sau khi post blinds)
- Flop (3 cards)
- Turn (1 card)
- River (1 card)
- Showdown

### Hand Evaluation
- Dùng thư viện `pokersolver` để so bài
- Xếp hạng: Royal Flush → Straight Flush → Four of a Kind → Full House → Flush → Straight → Three of a Kind → Two Pair → One Pair → High Card

### Pot System
- Main pot tính bình thường
- Side pot khi có player all-in (số chips < current bet)
- Split pot khi 2+ players có tay bài bằng nhau

---

# 🎨 PHASE 4 — UI/UX

## Tasks
- Layout bàn poker (oval table)
- Hiển thị player (tên, chips, avatar, vị trí quanh bàn)
- Hiển thị bài (2 hole cards + 5 community cards)
- Hiển thị dealer button, blind markers
- Hiển thị pot, current bet
- Button: Fold / Check / Call / Raise / All-in
- Raise slider (chọn số chips)
- Animation chia bài
- Highlight player đang tới lượt
- Hiển thị kết quả showdown (tên hand + winner)

---

# 🚀 PHASE 5 — Nâng cao
- Chat trong room
- Timer mỗi lượt (auto fold khi hết giờ)
- Lưu lịch sử game
- Sound effects
- Blind tăng dần theo thời gian (tournament mode)
- Spectator mode (xem không chơi)

---

# ⏱️ Timeline
Phase 1: 1 ngày
Phase 2: 1–2 ngày
Phase 3: 5–7 ngày (bao gồm blind system, side pot, hand evaluation)
Phase 4: 3–5 ngày
Phase 5: tùy chọn, làm dần

**Tổng ước tính: 10–15 ngày**

---

# 🧠 Best Practices
- Server là nguồn dữ liệu chính
- Client chỉ render
- Log nhiều để debug
- Test nhiều tab trước
