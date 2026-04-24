# 04 — Server Architecture

Toàn bộ server logic gom trong [server.js](../server.js) (~1200 dòng). Không DB, state in-memory.

## Data model

### `rooms` (Map)

```
rooms: Map<roomId, room>
```

### Room

File: [server.js:163-179](../server.js#L163-L179)

| Field | Type | Mô tả |
|---|---|---|
| `id` | string | Room code (6 ký tự) |
| `name` | string | Tên hiển thị |
| `hostId` | string | socketId của host (chuyển khi host rời) |
| `settings` | object | `{startingChips, smallBlind, bigBlind, maxPlayers, turnTime, readyTime, lockAfterStart}` |
| `players` | array | Danh sách ở cấp phòng |
| `game` | object\|null | State ván hiện tại |
| `status` | string | `'waiting'` \| `'playing'` \| `'waiting_next'` |
| `_turnTimer` | Timeout | Timer nội bộ cho turn hiện tại |
| `_readyTimer` | Timeout | Timer cho giai đoạn waiting_next |

### Room.players[]

File: [server.js:189-196](../server.js#L189-L196)

| Field | Mô tả |
|---|---|
| `id` | socketId |
| `name` | Tên |
| `avatar` | Emoji |
| `chips` | Chips cấp phòng (sync sau mỗi ván) |
| `ready` | bool |
| `connected` | bool |
| `spectator` | bool — chỉ xem, không vào ván |
| `lateJoiner` | bool — khi room có lockAfterStart |

### Room.game

File: [server.js:259-281](../server.js#L259-L281)

| Field | Mô tả |
|---|---|
| `deck` | Array lá bài còn lại |
| `players` | Snapshot người chơi ván này |
| `communityCards` | 0–5 lá chung |
| `pot` | Tổng pot |
| `sidePots` | Array `{amount, eligible[]}` |
| `stage` | `'preflop'` \| `'flop'` \| `'turn'` \| `'river'` \| `'showdown'` \| `'finished'` |
| `dealerIndex` | Index trong `game.players` |
| `smallBlindIndex`, `bigBlindIndex` | Index |
| `currentTurn` | Index player đang act |
| `currentBet` | Mức cược hiện tại vòng này |
| `minRaise` | Raise tối thiểu |
| `lastRaiser` | Index người raise cuối (để biết vòng đã xong) |
| `turnDeadline` | Timestamp hết turn |
| `actionLog` | Array hành động để hiển thị log |
| `result` | Kết quả cuối ván (sau showdown) |

### Room.game.players[]

| Field | Mô tả |
|---|---|
| `id, name, avatar` | Copy từ room.players |
| `chips` | Chips ván này (trừ dần khi bet) |
| `hand` | 2 lá bài riêng |
| `bet` | Bet trong vòng hiện tại |
| `totalBet` | Tổng bet toàn ván (dùng để tính side pot) |
| `folded` | bool |
| `allIn` | bool |
| `acted` | bool — đã act trong vòng này chưa |

### SidePots

File: [server.js:556-600](../server.js#L556-L600)

```
sidePots: [
  { amount: number, eligible: string[] }, // playerIds
  ...
]
```

## Các function chính (theo vai trò)

### Khởi tạo / cleanup

| Function | File:line | Mô tả |
|---|---|---|
| `createRoom` | [server.js:153](../server.js#L153) | Tạo room mới |
| `addPlayer` | [server.js:189](../server.js#L189) | Thêm player vào room |
| `removePlayer` | [server.js:214](../server.js#L214) | Xóa player, chuyển host nếu cần |
| `sanitizeSettings` | [server.js:140](../server.js#L140) | Validate settings |

### Lifecycle ván

| Function | File:line | Mô tả |
|---|---|---|
| `startGame` | [server.js:238](../server.js#L238) | Khởi tạo ván mới |
| `handleAction` | [server.js:377](../server.js#L377) | Xử lý fold/check/call/raise/allin |
| `advanceStage` | [server.js:489](../server.js#L489) | preflop → flop → turn → river → showdown |
| `calculateSidePots` | [server.js:556](../server.js#L556) | Tính side pots khi có all-in |
| `finishHand` | [server.js:602](../server.js#L602) | Kết thúc vì others folded |
| `showdown` | [server.js:628](../server.js#L628) | So bài + chia pot |
| `prepareNextHand` | [server.js:720](../server.js#L720) | Set waiting_next + readyCountdown |
| `autoStartWithReady` | [server.js:752](../server.js#L752) | Timer hết → start hoặc backToLobby |
| `checkGameWinner` | [server.js:684](../server.js#L684) | Kiểm tra session winner (≥80% chips) |

### Hand evaluation

| Function | File:line | Mô tả |
|---|---|---|
| `evaluateHands` | [server.js:85](../server.js#L85) | Dùng pokersolver rank tất cả hand |
| `determineWinners` | [server.js:97](../server.js#L97) | Lọc ra các hand thắng (có thể nhiều khi tie) |
| `splitPot` | [server.js:107](../server.js#L107) | Chia pot với luật odd-chip |

### Timer

| Function | File:line | Mô tả |
|---|---|---|
| `startTurnTimer` | [server.js:320](../server.js#L320) | Set timer, auto-fold khi hết |
| `clearTurnTimer` | [server.js:349](../server.js#L349) | Hủy timer |

### Broadcast

| Function | File:line | Mô tả |
|---|---|---|
| `broadcastGameState` | (grep `broadcastGameState`) | Gửi `gameUpdate` per-player (ẩn bài đối thủ) |
| `getRoomState` | | Tạo payload cho `roomUpdate` |
| `syncChips` | | Cập nhật chips từ game.players → room.players |

### Utility

| Function | File:line | Mô tả |
|---|---|---|
| `createDeck` | grep | Tạo + shuffle bộ bài |
| `cardToSolverFormat` | [server.js:76](../server.js#L76) | Convert format {rank,suit} → 'Ah' |
| `solverCardToGame` | [server.js:79](../server.js#L79) | Ngược lại |
| `writeLog` | [server.js:20](../server.js#L20) | Ghi log file theo ngày |
| `trimActionLog` | [server.js:151](../server.js#L151) | Giữ lại 5 ván gần nhất |
| `mergeWinners` | [server.js:109](../server.js#L109) | Gộp entries cùng playerId cho action log |

## State machine room

```
   (create)
       │
       ▼
┌──────────────┐    startGame     ┌─────────────┐
│  'waiting'   │─────────────────▶│  'playing'  │
└──────────────┘                  └──────┬──────┘
       ▲                                 │
       │                                 │ handFinished
       │  backToLobby                    ▼
       │  (autoStartWithReady            ┌──────────────────┐
       │   not enough ready,             │ 'waiting_next'   │
       │   hoặc gameWon)                 │ (readyCountdown) │
       │                                 └──────┬───────────┘
       │                                        │
       │                                        │ autoStartWithReady
       │                                        │ + ≥2 ready
       │                                        ▼
       │                                  startGame → 'playing'
       └─────────────────────────────────────┘
```

## State machine stage (trong 1 ván)

```
'preflop' → 'flop' → 'turn' → 'river' → 'showdown' → 'finished'
```

- Chuyển stage qua `advanceStage()` khi vòng cược hoàn tất.
- All-in shortcut: `countPlayersCanAct ≤ 1` → deal toàn bộ community → nhảy thẳng `showdown`.
- Sau `showdown`, `prepareNextHand` set `room.status = 'waiting_next'`, không đụng `game.stage`.

## File log

Mọi event quan trọng → `logs/game-YYYY-MM-DD.log`. Chi tiết trong [08-logging.md](08-logging.md).
