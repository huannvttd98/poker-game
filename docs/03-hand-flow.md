# 03 — Hand Flow

Flow chi tiết một ván poker từ lúc `startGame` đến khi chia pot xong.

## Sơ đồ

```
startGame(room)  ── server.js:238
    │
    ├─ Tính dealerIndex (lần đầu = 0, sau đó xoay)
    ├─ Tạo deck, chia 2 lá cho mỗi người
    ├─ Post blinds (SB = dealer+1, BB = dealer+2; heads-up: dealer = SB)
    ├─ currentTurn = BB + 1 (UTG)
    └─ Khởi tạo game state, stage = 'preflop'
    │
    ▼
┌─────────────┐
│  PREFLOP    │  Vòng cược 1 (bắt đầu từ UTG)
└──────┬──────┘
       │ handleAction() cho từng người cho đến khi vòng hết
       │ (server.js:377)
       ▼
advanceStage()  ── server.js:489
  ├─ calculateSidePots() cho bất kỳ all-in nào
  ├─ Reset p.bet, p.acted
  ├─ Nếu countPlayersCanAct ≤ 1 → deal toàn bộ community, skip tới showdown
  ├─ burn 1 lá, chia 3 lá
       ▼
┌─────────────┐
│  FLOP       │  Vòng cược 2 (bắt đầu từ player còn sống đầu tiên sau dealer)
└──────┬──────┘
       ▼
   (advanceStage → burn + 1 lá)
       ▼
┌─────────────┐
│  TURN       │  Vòng cược 3
└──────┬──────┘
       ▼
   (advanceStage → burn + 1 lá)
       ▼
┌─────────────┐
│  RIVER      │  Vòng cược 4
└──────┬──────┘
       ▼
showdown(room)  ── server.js:628
  ├─ evaluateHands() (pokersolver)
  ├─ Với mỗi sidePot (hoặc main pot nếu không có sidePot):
  │    ├─ determineWinners() trong số eligible
  │    └─ splitPot() chia có xử lý odd chip
  ├─ Cộng chips vào game.players + room.players
  ├─ Emit handFinished với winners/hands
  ├─ writeLog('HAND_END')
  └─ prepareNextHand(room)
```

## Chi tiết từng giai đoạn

### startGame — khởi tạo ván

File: [server.js:238-304](../server.js#L238-L304)

```
1. activePlayers = room.players.filter(connected && !spectator && chips > 0)
2. Nếu < 2 → return false
3. dealerIndex = prevGame ? (prevGame.dealerIndex + 1) % n : 0
4. Shuffle deck, pop 2 lá × n player
5. Tính sbIndex, bbIndex:
   - numPlayers === 2 → sbIndex = dealerIndex, bbIndex = dealerIndex + 1
   - else → sbIndex = dealerIndex + 1, bbIndex = dealerIndex + 2
6. Post blinds (min(blind, chips) — có thể all-in nếu chips < blind)
7. currentTurn = bbIndex + 1
8. game.stage = 'preflop'
9. actionLog lưu {action: 'newhand'} + blinds
10. startTurnTimer()
```

### handleAction — xử lý một action

File: [server.js:377-486](../server.js#L377-L486)

```
Validate:
  - room.game tồn tại, currentPlayer khớp, chưa fold/all-in
  - Action hợp lệ (fold/check/call/raise/allin)
  - Amount raise ≥ minRaise

Apply:
  - fold: p.folded = true
  - check: (chỉ khi currentBet - p.bet === 0)
  - call: trừ min(chips, toCall), cộng vào pot
  - raise: trừ raiseAmount, cộng vào pot, update currentBet + minRaise
  - allin: push all chips, auto fold/call/raise tùy mức

Đánh dấu p.acted = true
Log 'ACTION' (writeLog + game.actionLog)

Kiểm tra kết thúc vòng:
  - Chỉ còn 1 player không fold → finishHand (others folded)
  - Tất cả active/allin đều đã acted + đã match currentBet → advanceStage()
  - Khác → chuyển turn sang player tiếp theo, startTurnTimer()
```

### advanceStage — sang vòng tiếp

File: [server.js:489-554](../server.js#L489-L554)

```
1. calculateSidePots(game) ── cập nhật game.sidePots và game.pot
2. Reset p.bet = 0, p.acted = false cho mọi player
3. Nếu đã sau river → return showdown(room)
4. Tăng stage (preflop → flop → turn → river)
5. Dựa vào stage, burn 1 + chia community cards (3/1/1)
6. Nếu countPlayersCanAct ≤ 1 (tất cả all-in/fold) → deal hết community,
   stage = 'showdown', return showdown()
7. currentTurn = player đầu tiên active sau dealer
8. startTurnTimer()
```

### calculateSidePots — tính side pot

File: [server.js:556-600](../server.js#L556-L600)

```
1. Sort allInPlayers theo totalBet tăng dần
2. Với mỗi mức all-in (level):
   - Tính contribution = min(p.totalBet, level) - min(p.totalBet, prevLevel)
   - Cộng vào potAmount
   - eligible = tất cả player chưa fold có totalBet ≥ level
   - Push pot {amount, eligible}
3. Main pot = phần còn lại trên level cao nhất
   - eligible = player chưa fold có totalBet > level cao nhất
4. game.sidePots = pots; game.pot = tổng
```

Ví dụ: A all-in 100, B all-in 300, C bet 500
- Pot 1 (level 100): A+B+C contribute 100 = 300, eligible [A,B,C]
- Pot 2 (level 300): B+C contribute 200 = 400, eligible [B,C]
- Main (>300): C contribute 200, eligible [C] → uncalled, trả lại C

### showdown — chia pot

File: [server.js:628-681](../server.js#L628-L681)

```
1. evaluateHands(players, communityCards) → [{playerId, hand, name, bestCards}]
2. Nếu có sidePots:
     cho mỗi pot:
       eligibleResults = handResults lọc theo pot.eligible
       winners = determineWinners(eligibleResults)
       shares = splitPot(pot.amount, winners, game)
       cộng chips, push vào result.winners
   Ngược lại:
     winners = determineWinners(handResults)
     shares = splitPot(game.pot, winners, game)
     cộng chips
3. Log HAND_END, emit handFinished
4. syncChips từ game.players về room.players
5. checkGameWinner → nếu có session winner: gameWon; else prepareNextHand
```

Chi tiết split pot + luật odd-chip: xem [07-pot-distribution.md](07-pot-distribution.md).

### finishHand — khi chỉ còn 1 người (others folded)

File: [server.js:602-626](../server.js#L602-L626)

```
1. winner = player còn lại không fold
2. winner.chips += game.pot
3. Emit handFinished {reason: 'others_folded', winners: [winner]}
4. writeLog HAND_END
5. prepareNextHand
```

### prepareNextHand — chuẩn bị ván sau

File: [server.js:720-750](../server.js#L720-L750)

```
1. room.status = 'waiting_next'
2. Player có chips = 0 → set spectator = true
3. Reset ready = false
4. Start readyCountdown (readyTime giây)
5. Emit readyCountdown { deadline }
6. Trong khoảng thời gian này:
   - Ai bấm Ready → emit toggleReady
   - Nếu tất cả ready trước deadline → startGame luôn
   - Hết deadline → autoStartWithReady()
```

### autoStartWithReady — timer hết thời gian

File: [server.js:752-770](../server.js#L752-L770)

```
1. Player chưa ready → spectator = true
2. Nếu ≥ 2 ready + chips > 0 → startGame
3. Ngược lại → room.status = 'waiting', emit backToLobby
```

## Edge cases

- **All-in preflop**: advanceStage deal hết community ngay, skip các vòng cược, đến showdown.
- **Heads-up (2 người)**: dealer = SB, BB là người kia; preflop dealer act trước BB.
- **Uncalled bet**: side pot với `eligible.length === 1` → bet này không ai match, trả nguyên vẹn cho eligible.
- **Player disconnect mid-hand**: handleDisconnect mark folded, nếu đến lượt thì auto-advance.
- **Timer hết**: auto-fold (server.js:320-346).
