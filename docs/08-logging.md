# 08 — Logging

## File log

- Đường dẫn: `logs/game-YYYY-MM-DD.log` (1 file/ngày)
- Format mỗi dòng:

```
[ISO-timestamp] [EVENT_TYPE] {JSON data}
```

Ví dụ:

```
[2026-04-23T10:27:11.679Z] [GAME_START] {"roomId":"03GBJ7","players":[{"name":"Vihuan","chips":4950},{"name":"Super Hiếu","chips":4900}]}
[2026-04-23T10:27:16.304Z] [ACTION] {"roomId":"03GBJ7","player":"Vihuan","playerId":"4fjwry3GDog95uZxAAGj","action":"raise","amount":200,"chipsLeft":4800}
[2026-04-23T10:27:55.267Z] [HAND_END] {"roomId":"03GBJ7","reason":"showdown","winners":[...],"hands":{...}}
```

## `writeLog` function

File: [server.js:20](../server.js#L20)

```js
function writeLog(type, data) {
  const filename = `logs/game-${new Date().toISOString().slice(0, 10)}.log`;
  const line = `[${new Date().toISOString()}] [${type}] ${JSON.stringify(data)}\n`;
  fs.appendFileSync(filename, line);
}
```

## Các loại event

| Type | Khi nào | Data (key chính) | File:line |
|---|---|---|---|
| `ROOM_CREATE` | Phòng mới được tạo | `roomId, player, settings` | [server.js:936](../server.js#L936) |
| `ROOM_JOIN` | Player (hoặc spectator) vào phòng | `roomId, player, chips, spectator` | [server.js:974](../server.js#L974) |
| `GAME_START` | Ván mới bắt đầu | `roomId, players[]` (name, chips trước blind) | [server.js:778,1017](../server.js#L778) |
| `ACTION` | Player fold/check/call/raise/allin | `roomId, player, playerId, action, amount, chipsLeft` | [server.js:469](../server.js#L469) |
| `AUTO_FOLD` | Hết timer, auto fold | `roomId, player` | [server.js:344](../server.js#L344) |
| `HAND_END` | Ván kết thúc (cả 2 lý do) | `roomId, reason, winners[], hands{}` | [server.js:620,674](../server.js#L620) |
| `GAME_WON` | Có session winner (≥80% chips) | `roomId, winner, chips, total` | [server.js:697](../server.js#L697) |
| `KICK` | Host đuổi player | `roomId, by, target` | [server.js:1068](../server.js#L1068) |
| `DISCONNECT` | Player socket disconnect | `roomId, playerId` | [server.js:1143](../server.js#L1143) |

## Schema `HAND_END`

```json
{
  "roomId": "03GBJ7",
  "reason": "showdown" | "others_folded",
  "winners": [
    {
      "playerId": "...",
      "name": "Pair, J's" | player name,
      "amount": 1800,
      "hand": "Pair, J's",         // chỉ có khi showdown
      "bestCards": [...],          // chỉ có khi showdown
      "uncalled": true              // chỉ có khi side pot uncalled
    }
  ],
  "hands": {                        // chỉ có khi showdown
    "playerId1": "Pair, J's",
    "playerId2": "A High"
  }
}
```

### Reason

- `showdown`: mọi người còn lại so bài.
- `others_folded`: chỉ còn 1 người, không so bài.

### Khi split pot (tie)

`winners[]` sẽ có nhiều entries, mỗi entry với `amount` = phần chia của người đó:

```json
{
  "winners": [
    {"playerId": "A", "amount": 467, "hand": "Pair, J's", ...},
    {"playerId": "B", "amount": 466, "hand": "Pair, J's", ...}
  ]
}
```

## Ý định sử dụng log

- **Debug**: truy dấu action → showdown để tìm bug logic.
- **Audit**: kiểm tra pot distribution, side pot eligibility.
- **Thống kê**: nối file log qua nhiều ngày, parse JSON để phân tích.

### Parse log

Vì mỗi dòng là `[ts] [TYPE] {json}`, có thể parse bằng regex đơn giản:

```bash
# Lấy tất cả HAND_END của ngày
grep '\[HAND_END\]' logs/game-2026-04-23.log

# Đếm số action mỗi player
grep '\[ACTION\]' logs/game-2026-04-23.log | jq -r '.player' | sort | uniq -c
```

## Những thứ KHÔNG được log

- Hole cards (bài riêng của từng player).
- Community cards.
- Chat messages.
- Ready toggle.

Nếu cần debug tie khó xác định, có thể tạm thời thêm log hole cards + community trước/sau showdown.

## Action log (trong game)

Khác với file log, `game.actionLog` là array in-memory để hiển thị trên UI (sidebar "Log"):

- Giữ tối đa 5 ván gần nhất (`MAX_LOG_HANDS`) — `trimActionLog` ([server.js:151](../server.js#L151)).
- Chứa entries: `{action: 'newhand'}`, `{action: 'Small Blind', amount}`, `{action: 'stage', stage}`, `{action: 'result', winners}`, và từng action của player.
- Client render qua `renderLog(log)` ([app.js:1082](../public/app.js#L1082)).
