# 07 — Pot Distribution

Chi tiết logic chia pot khi showdown, bao gồm side pot và luật odd-chip.

## Các hàm liên quan

| Function | File:line | Mục đích |
|---|---|---|
| `calculateSidePots(game)` | [server.js:556](../server.js#L556) | Xây `game.sidePots` khi có all-in |
| `evaluateHands(players, community)` | [server.js:85](../server.js#L85) | Rank tất cả hand (pokersolver) |
| `determineWinners(handResults)` | [server.js:97](../server.js#L97) | Lọc winners (có thể nhiều khi tie) |
| `splitPot(amount, winners, game)` | [server.js:107](../server.js#L107) | Chia 1 pot theo luật odd-chip |
| `showdown(room)` | [server.js:628](../server.js#L628) | Orchestrate toàn bộ |

## Flow showdown

```
showdown(room)
  │
  ├─ evaluateHands(game.players, communityCards)
  │     → [{playerId, hand, name, bestCards}]
  │
  ├─ Nếu có sidePots:
  │     for each pot in game.sidePots:
  │       eligibleResults = handResults.filter(r => pot.eligible.includes(r.playerId))
  │       winners = determineWinners(eligibleResults)
  │       uncalled = pot.eligible.length === 1
  │       shares = splitPot(pot.amount, winners, game)
  │       for each {winner, share} in shares:
  │           gp.chips += share
  │           rp.chips += share
  │           push result.winners
  │
  └─ Ngược lại (không có sidePot):
        winners = determineWinners(handResults)
        shares = splitPot(game.pot, winners, game)
        for each {winner, share} in shares:
            cộng chips + push result.winners
```

## `determineWinners`

```js
function determineWinners(handResults) {
  if (handResults.length === 0) return [];
  const hands = handResults.map(r => r.hand);
  const winning = Hand.winners(hands);      // pokersolver, trả reference
  return handResults.filter(r => winning.includes(r.hand));
}
```

- `Hand.winners` của pokersolver trả về array reference tới các hand tie (cùng rank, cùng kicker).
- `includes` check bằng reference → an toàn vì pokersolver không clone.

## `splitPot` — luật odd-chip

```js
function splitPot(amount, winners, game) {
  if (winners.length === 0) return [];
  const n = winners.length;
  const base = Math.floor(amount / n);
  let remainder = amount - base * n;

  const dealerIdx = game.dealerIndex;
  const numPlayers = game.players.length;
  const ordered = winners
    .map(w => {
      const seatIdx = game.players.findIndex(p => p.id === w.playerId);
      const dist = (seatIdx - dealerIdx - 1 + numPlayers) % numPlayers;
      return { winner: w, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  return ordered.map(({ winner }) => {
    let share = base;
    if (remainder > 0) { share += 1; remainder -= 1; }
    return { winner, share };
  });
}
```

**Luật**:
1. `base = floor(amount / n)`, `remainder = amount - base*n`.
2. Sort winners theo **khoảng cách từ trái dealer** (seat gần SB nhất trước).
3. Chip dư phân phối cho từng winner theo thứ tự đó, mỗi người thêm 1 chip cho tới khi hết dư.

### Ví dụ

| Pot | Winners | Chia |
|---|---|---|
| 100, 3 winners tại seat [A(dealer), C, D] | A, C, D | C=34, D=33, A=33 |
| 933, 2 winners [B, C] (dealer = A) | B, C | B=467, C=466 |
| 10, 4 winners [A, B, C, D] | A, B, C, D | B=3, C=3, D=2, A=2 |
| 1000, 1 winner | A | A=1000 |

## `calculateSidePots` — tính side pot

```
1. allInPlayers = players chưa fold mà allIn, sort theo totalBet ASC
2. processed = 0; pots = []
3. for each allInPlayer:
     level = allInPlayer.totalBet
     nếu level <= processed → skip
     potAmount = 0; eligible = []
     for each p in game.players:
       contribution = min(p.totalBet, level) - min(p.totalBet, processed)
       potAmount += contribution
       nếu !p.folded && p.totalBet >= level → eligible.push(p.id)
     nếu potAmount > 0: pots.push({amount, eligible})
     processed = level
4. Main pot cho phần > processed:
     mainPot = Σ max(0, p.totalBet - processed)
     mainEligible = p chưa fold có totalBet > processed
5. game.sidePots = pots; game.pot = Σ pots.amount
```

### Ví dụ side pot

Setup:
- A all-in 100
- B all-in 300
- C bet 500

Tính:
- **Pot 1** (level 100): A, B, C đều đóng 100 × 3 = 300. Eligible: [A, B, C]
- **Pot 2** (level 300): B, C đóng thêm 200 × 2 = 400. Eligible: [B, C]
- **Main pot** (> 300): C đóng 200. Eligible: [C] → uncalled.

Showdown:
- Pot 1: so bài A, B, C, ai thắng nhận 300 (nếu tie chia theo splitPot).
- Pot 2: so bài B, C, ai thắng nhận 400.
- Main pot: chỉ C → nhận luôn 200 (uncalled, không cần show bài thật ra).

## Uncalled bet

- Đánh dấu bằng `uncalled: true` trong `result.winners` khi `pot.eligible.length === 1`.
- Client có thể hiện "Uncalled" để giải thích vì sao không show bài.

## Bug đã fix

Trước đây:
```js
const share = Math.floor(game.pot / winners.length);
```
→ Khi pot không chia hết cho số winners, phần dư **bị mất**.

Sau fix:
- Dùng `splitPot` → chip dư được phân phối theo luật odd-chip (nearest-to-left-of-button).
- Tổng chia ra **luôn bằng** pot.amount.

Xem commit fix để biết thay đổi cụ thể.

## Edge cases

- **Tất cả eligible đã fold**: không xảy ra trong thực tế (eligible dựa trên `!p.folded`), nhưng code có `if (winners.length === 0) continue;`.
- **1 eligible duy nhất** (uncalled bet): winners = [p] → splitPot trả full amount.
- **Cùng hand rank khác kicker**: pokersolver phân biệt → chỉ 1 winner.
- **Cùng hand + cùng kicker**: pokersolver trả tất cả → splitPot chia đều + odd chip.
