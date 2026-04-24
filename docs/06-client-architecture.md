# 06 — Client Architecture

Client-side nằm trong [public/](../public/). Vanilla JS, không framework.

## Screens (UI states)

Tất cả screen được định nghĩa trong [index.html](../public/index.html). App chỉ toggle class `.active` / `display`.

| Screen | Container | File:line | Vai trò |
|---|---|---|---|
| Profile | `#profile-screen` | [index.html:257](../public/index.html#L257) | Nhập tên, chọn avatar |
| Lobby | `#lobby-screen` | [index.html:281](../public/index.html#L281) | Danh sách room, create/join |
| Room | `#room-screen` | [index.html:366](../public/index.html#L366) | Chờ player, ready, start |
| Game | `#game-screen` | [index.html:382](../public/index.html#L382) | Bàn poker, action buttons |
| Result overlay | `#result-overlay` | [index.html:570](../public/index.html#L570) | Hiện kết quả ván |
| Game won overlay | `#game-won-overlay` | [index.html:575](../public/index.html#L575) | Winner + xếp hạng |
| Help overlay | `#help-overlay` | [index.html:17](../public/index.html#L17) | Luật + hand ranking |
| App modal | `#app-modal` | [index.html:578](../public/index.html#L578) | Confirm/alert dialog |

## Screen transitions

```
Profile ──enterLobby()──▶ Lobby
                          │
                          ├─ createRoom / joinRoom ──▶ Room
                          │
                          └─ joinRoom (playing)  ──▶ Spectator (Game)
                          
Room ──roomUpdate status='playing'──▶ Game

Game ──handFinished──▶ Result Overlay
                          │
                          ├─ tất cả ready ──▶ gameUpdate ──▶ Game (ván mới)
                          │
                          └─ checkGameWinner ──▶ Game Won Overlay
                                                   │
                                                   └─ backToLobby ──▶ Room
```

## Socket listeners (server → client)

File: [app.js](../public/app.js)

| Event | Vai trò UI | File:line |
|---|---|---|
| `roomList` | Cập nhật danh sách room trong lobby | [app.js:197](../public/app.js#L197) |
| `roomUpdate` | Cập nhật player list, ready, host, spectator | [app.js:242](../public/app.js#L242) |
| `gameUpdate` | Render seat, bài, pot, action buttons, timer; phát sound | [app.js:320](../public/app.js#L320) |
| `handFinished` | Mở Result Overlay, hiện winners + glow | [app.js:685](../public/app.js#L685) |
| `readyCountdown` | Countdown bar trong Result Overlay | [app.js:768](../public/app.js#L768) |
| `spectatorMode` | Ẩn action, hiện thanh spectator | [app.js:797](../public/app.js#L797) |
| `kicked` | Về lobby, modal "Bị đuổi" | [app.js:814](../public/app.js#L814) |
| `backToLobby` | Đóng overlay, về Room screen | [app.js:827](../public/app.js#L827) |
| `gameWon` | Game Won Overlay + animation | [app.js:837](../public/app.js#L837) |
| `chatMessage` | Append message bubble, sound, badge | [app.js:1210](../public/app.js#L1210) |

## Render functions chính

| Function | Mục đích | File:line |
|---|---|---|
| `renderProfileCard()` | Avatar/name/chips chính của người chơi | [app.js:73](../public/app.js#L73) |
| `renderGame(game)` | Render toàn bộ bàn: seats, community, pot, stage, timer, actions | [app.js:427](../public/app.js#L427) |
| `renderPlayerCards(player)` | Hiện hole cards (của mình) hoặc face-down (đối thủ) | [app.js:561](../public/app.js#L561) |
| `renderCard(card)` | Convert `{rank, suit}` → HTML | [app.js:571](../public/app.js#L571) |
| `renderActions(game)` | Hiện/ẩn fold/check/call/raise + slider | [app.js:579](../public/app.js#L579) |
| `renderRankList()` | Bảng xếp hạng chips (sidebar) | [app.js:920](../public/app.js#L920) |
| `renderLog(log)` | Action history sidebar | [app.js:1082](../public/app.js#L1082) |

## Emit events (user → server)

| Hành động | UI element | Event emit | File:line |
|---|---|---|---|
| "Enter Lobby" | Button | (không emit, local) | [app.js:62](../public/app.js#L62) |
| Create room | Button | `createRoom` | [app.js:126](../public/app.js#L126) |
| Join room | Button | `joinRoom` | [app.js:137](../public/app.js#L137) |
| Watch | Button | `joinRoom` (spectator) | [app.js:224](../public/app.js#L224) |
| Ready | Button | `toggleReady` | [app.js:181,878,912](../public/app.js#L181) |
| Start game | Button (host) | `startGame` | [app.js:189](../public/app.js#L189) |
| Fold/Check/Call/Raise/All-in | Buttons | `action` | [app.js:677](../public/app.js#L677) |
| Leave / Exit | Button | `leaveRoom` | [app.js:155,168](../public/app.js#L155) |
| Kick | Button (host) | `kickPlayer` | [app.js:809](../public/app.js#L809) |
| Chat | Input | `chatMessage` | [app.js:1159](../public/app.js#L1159) |

## Raise controls

Các nút hỗ trợ nhập raise amount:
- **1/3, 1/2, 2/3, Pot**: set nhanh theo tỉ lệ pot
- **-5, +5**: tăng/giảm chính xác
- **Slider**: kéo chọn số chips
- Validate: phải ≥ `minRaise`, ≤ `chips` của mình

## i18n

File: [i18n.js](../public/i18n.js)

- Hỗ trợ **vi** và **en** qua object `LANGS` (i18n.js:4-114).
- DOM dùng attribute `data-i18n="key"`; `applyI18n()` thay text bằng `t(key)`.
- Switch ngôn ngữ → lưu localStorage, re-apply.

## Sounds

File: [sounds.js](../public/sounds.js)

Sinh âm thanh trực tiếp bằng **Web Audio API**, không dùng file mp3.

| Trigger | SFX | File:line gọi |
|---|---|---|
| Bắt đầu ván | shuffle + deal | [app.js:333](../public/app.js#L333) |
| Lật community card | whoosh | [app.js:339](../public/app.js#L339) |
| Đến lượt mình | two-tone beep | [app.js:344](../public/app.js#L344) |
| Check | 600 Hz ping | [app.js:355](../public/app.js#L355) |
| Call | chip sound | 〃 |
| Raise | rising tone + chip | 〃 |
| Fold | descending | 〃 |
| All-in | sweep | 〃 |
| Ván thắng | fanfare | [app.js:687](../public/app.js#L687) |
| Thắng session | grand fanfare | [app.js:841](../public/app.js#L841) |
| Chat | soft pop | [app.js:1226](../public/app.js#L1226) |
| Timer sắp hết (5s→1s) | beep | [app.js:1057](../public/app.js#L1057) |

Toggle sound: icon trên top bar, lưu localStorage.

## Responsive

CSS mobile-first trong [style.css](../public/style.css):
- Mobile portrait (`< 768px`)
- Desktop (`>= 768px`)
- Landscape mobile
- Small phones (`< 360px`)
