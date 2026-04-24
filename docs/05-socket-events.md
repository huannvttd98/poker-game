# 05 — Socket.IO Events

Danh sách tất cả event client ↔ server.

## Client → Server

| Event | Payload | Mô tả | File:line |
|---|---|---|---|
| `createRoom` | `{playerName, avatar, roomName, settings}` | Tạo room mới, auto-join làm host | [server.js:927](../server.js#L927), [app.js:126](../public/app.js#L126) |
| `joinRoom` | `{roomId, playerName, avatar}` | Join hoặc watch room | [server.js:941](../server.js#L941), [app.js:137](../public/app.js#L137) |
| `toggleReady` | — | Toggle ready flag; auto-start nếu đủ ready | [server.js:979](../server.js#L979), [app.js:181](../public/app.js#L181) |
| `startGame` | — | Host bắt đầu ván đầu (cần tất cả ready) | [server.js:999](../server.js#L999), [app.js:189](../public/app.js#L189) |
| `action` | `{action, amount}` | fold/check/call/raise/allin | [server.js:1022](../server.js#L1022), [app.js:677](../public/app.js#L677) |
| `kickPlayer` | `targetId` | Host đuổi player | [server.js:1042](../server.js#L1042), [app.js:809](../public/app.js#L809) |
| `chatMessage` | `text` | Broadcast chat | [server.js:1073](../server.js#L1073), [app.js:1159](../public/app.js#L1159) |
| `leaveRoom` | — | Rời phòng chủ động | [server.js:1095](../server.js#L1095), [app.js:155](../public/app.js#L155) |
| `disconnect` | — | Socket ngắt (tab close, mạng rớt) | [server.js:1100](../server.js#L1100) |

## Server → Client

### Broadcast tới cả room

| Event | Payload | Khi nào | File:line |
|---|---|---|---|
| `roomUpdate` | `getRoomState(room)` | Sau mọi thay đổi room (join, ready, kick, ...) | [server.js:934,989,1014,1065](../server.js#L934) |
| `gameUpdate` | `{game state}` (per-player, ẩn bài đối thủ) | Sau mỗi action, sau advanceStage | [server.js:864,969](../server.js#L864) |
| `handFinished` | `{winners, hands, reason}` | Ván kết thúc (showdown hoặc others folded) | [server.js:341,1037](../server.js#L341) |
| `readyCountdown` | `{deadline}` | prepareNextHand bắt đầu countdown | [server.js:739](../server.js#L739) |
| `gameWon` | `{winner, rankings}` | Có session winner | [server.js:705](../server.js#L705) |
| `backToLobby` | — | Session kết thúc hoặc không đủ ready để tiếp | [server.js:712,769](../server.js#L712) |
| `chatMessage` | `{from, text, ts}` | Ai đó gửi chat | [server.js:1084](../server.js#L1084) |

### Emit riêng cho 1 socket

| Event | Payload | Khi nào | File:line |
|---|---|---|---|
| `roomList` | `Room[]` | Khi connect; sau createRoom/join/leave | [server.js:914,924](../server.js#L914) |
| `spectatorMode` | `{lateJoiner}` | Khi join room đang playing hoặc lateJoiner | [server.js:970](../server.js#L970) |
| `kicked` | — | Bị host đuổi | [server.js:1054](../server.js#L1054) |

## Notes quan trọng

### `gameUpdate` per-player

Server emit `gameUpdate` **riêng** cho từng socket, thay vì broadcast chung:
- Bài của mình → hiện
- Bài đối thủ → ẩn (`face-down`) trừ khi đã showdown

Xem [server.js:820](../server.js#L820).

### `roomUpdate` vs `gameUpdate`

- `roomUpdate`: state cấp phòng (danh sách players, ready, status, host, ...).
- `gameUpdate`: state ván đang chơi (bài, pot, turn, stage, ...). Chỉ có khi `status === 'playing'`.

### `handFinished` so với `gameUpdate`

`handFinished` mang **kết quả** (winners + hands); client dùng để mở Result Overlay. `gameUpdate` không chứa winner info.

### Thứ tự event khi ván kết thúc

```
1. gameUpdate      (state cuối với stage='showdown', pot=0, chips đã cộng)
2. handFinished    (winners, hands)
3. roomUpdate      (status='waiting_next')
4. readyCountdown  (deadline cho ván sau)
```

### Thứ tự khi player disconnect giữa ván

```
1. gameUpdate      (player bị mark folded)
2. (nếu đang đến lượt → advance → có thể dẫn tới finishHand)
3. roomUpdate      (player đã remove khỏi room.players)
4. DISCONNECT log
```
