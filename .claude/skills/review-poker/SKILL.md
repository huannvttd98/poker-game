---
name: review-poker
description: Review code changes in the Poker LAN project (Texas Hold'em, Node.js + Socket.IO + vanilla JS client). Use when the user asks to "review", "check", "kiểm tra", or "rà soát" code in this repo — either a file/diff or recent changes. Focuses on game logic correctness (pot math, side pots, tie split, turn timer), Socket.IO event ordering, hidden-info leaks (opponent hole cards), and the in-memory state model.
---

# Review Poker

Review code in the Poker LAN project. The codebase has no test framework and no DB — every bug shows up at runtime as wrong chips, leaked cards, or stuck turns. Be paranoid about state mutations and event ordering.

## Project at a glance

- **Server**: single file [server.js](../../../server.js) (~1200 dòng) — Express + Socket.IO + in-memory `rooms` Map.
- **Client**: vanilla JS in [public/](../../../public/) — `app.js`, `index.html`, `style.css`, `i18n.js`, `sounds.js`.
- **Hand eval**: `pokersolver` (npm). Reference-equality is load-bearing — see `determineWinners`.
- **Persistence**: only file logs at `logs/game-YYYY-MM-DD.log`. No DB, no Redis.
- **Docs**: read [docs/](../../../docs/) for the canonical flow descriptions before reviewing non-trivial changes.

## When invoked

1. **Scope** —
   - File path or line range given → review exactly that.
   - Commit / branch / PR given → `git diff <ref>` and review the diff.
   - Nothing given → `git status` + `git diff HEAD` (uncommitted + last commit).
   - IDE-opened file + vague "review this" → confirm with the user (opened file vs diff).
2. **Read the code** before commenting. For server changes, also skim the surrounding lifecycle function (`startGame`, `handleAction`, `advanceStage`, `showdown`, `prepareNextHand`) — most bugs span 2–3 of these.
3. **Cite `file:line`** with markdown link syntax for every issue.

## Review checklist

Walk each category. Skip ones that don't apply. Don't invent issues to fill a section.

### Game logic — chip / pot math

- `game.pot` must always equal sum of all `player.totalBet`. Any code that touches `game.pot` outside the standard `+= callAmount/raiseAmount/allInAmount` path or `calculateSidePots` is suspect.
- `calculateSidePots` updates `game.sidePots` and `game.pot` **only if** `pots.length > 0` — be aware old side pots persist if all-ins disappear (they can't in current code, but flag anyone removing the `allIn` flag mid-hand).
- Side pot levels must skip duplicates: `if (level <= processed) continue;`. Missing this → double-counted contributions.
- `splitPot` odd-chip rule: dư đi cho seat **closest to left of dealer button** — `dist = (seatIdx - dealerIdx - 1 + numPlayers) % numPlayers`. Sort ASC by dist, give +1 chips in that order until remainder = 0. Total distributed must equal pot amount.
- After tie distribution, sum of `result.winners[].amount` per pot must equal `pot.amount`. Per-player totals must equal `game.pot`.
- `gp.chips += share` is the source of truth; `rp.chips += share` is **redundant** because `syncChips(room)` overwrites it. Flag any code path that reads `rp.chips` between distribution and `syncChips` — values will be doubled.
- `Hand.winners(hands)` returns reference-equal hands from input array. `determineWinners` filters by `winning.includes(r.hand)` — if anyone replaces hands with a clone/copy, ties break silently.

### Game logic — turn flow

- Heads-up special case: `numPlayers === 2` → dealer = SB, BB = the other. Preflop dealer (SB) acts first; postflop BB acts first.
- `currentTurn` advance: must skip folded + all-in. `getNextActivePlayer` returning `-1` is a real case (everyone all-in) → must `advanceStage`, not loop forever.
- `advanceStage` checks `countPlayersCanAct ≤ 1` to short-circuit to showdown. Missing this → infinite loop with all-in players never acting.
- `acted` reset on `advanceStage` (all players) and on raise/allin (others only, raiser keeps `acted=true`).
- `minRaise` updates only when `raise >= game.minRaise`. All-in short of full raise must NOT increase `minRaise` but DOES increase `currentBet`.
- Turn timer (`startTurnTimer` / `clearTurnTimer`) must be cleared on every transition: `advanceStage`, `finishHand`, `showdown`, `handleDisconnect`, `prepareNextHand`. Stale timer firing during `waiting_next` → ghost auto-folds.

### Socket.IO — events

- `gameUpdate` is **per-player** via `broadcastGameState`. Each socket sees its own hole cards; opponents are `null` unless `stage === 'showdown' && !p.folded`. Never use `io.to(room.id).emit('gameUpdate', ...)` for the game state — it leaks hands.
- Hand-end emission order: `gameUpdate` → `roomUpdate` → `handFinished`. The client's `Result Overlay` reads `currentGame.players` from the last `gameUpdate` to render showdown hands, so `gameUpdate` **must** come first.
- `prepareNextHand` is called inside `showdown`/`finishHand` — it also emits `readyCountdown` + `roomUpdate`. Double-check no other code path emits these.
- Disconnect mid-hand: `handleDisconnect` → mark folded → if their turn, `handleAction_afterFold` (which can cascade to `finishHand`/`showdown`) → `removePlayer` → `roomUpdate`. Order matters.
- `chatMessage` listener now appends to all `.chat-messages` elements (room screen + game sidebar). Flag any handler that hard-codes `getElementById('chat-messages')`.

### Hidden-info leaks

- Server-side: never include `player.hand` in any payload sent to other sockets before showdown. Audit `getGameStateForPlayer` and any new emit.
- Server-side: don't log hole cards or community cards in `writeLog` unless explicitly behind a debug flag.
- Client-side: don't show opponent's `bestCards` until `result.hands` is populated by `handFinished`.

### Client state

- `currentGame` and `currentRoom` are last-snapshot caches from `gameUpdate` / `roomUpdate`. Treat as read-only; mutations get clobbered by the next event.
- `myId` is the socket id, may change on reconnect. Don't store it in a way that survives disconnect.
- Result overlay uses `currentGame?.players` for hand display. If the showdown `gameUpdate` is missed (skipped or out-of-order), result UI shows blanks.
- HTML built via `innerHTML` with player names/chat text **must** go through `esc()` — XSS vector otherwise.
- Sound effects (`SFX.*`) are fire-and-forget; spectators should hear them too unless silenced explicitly.

### i18n

- Every visible UI string goes through `t(key)`. Hard-coded Vietnamese/English in new code is a flag.
- New strings need entries in BOTH `vi` and `en` blocks in [public/i18n.js](../../../public/i18n.js).
- Interpolation uses `{name}` syntax — flag mismatched param names.

### Conventions & quality

- Server requires Node ≥18 (optional chaining, nullish coalescing, top-level `?.`). Don't introduce `??=` or other ES2022 syntax without checking.
- All room state is in the `rooms` Map. New persistent fields go on `room.*` (not module globals).
- Asset cache: `?v=N` in [public/index.html](../../../public/index.html) must be bumped when modifying `app.js` / `style.css` / `i18n.js` / `sounds.js`.
- File logging is async (`fs.appendFile`) — fine, but don't add sync log writes that block the event loop.
- Magic numbers in timers (`TURN_TIME=18`, `READY_TIMEOUT=12`, `NEXT_HAND_DELAY=5000`, `GAME_WON_DELAY=5000`) are tuned — flag changes without a comment explaining why.

### Security (LAN context, low surface area)

- Only validate at boundaries (`socket.on` handlers, `app.get` routes). The `/api/logs/:name` regex `^game-\d{4}-\d{2}-\d{2}\.log$` prevents path traversal — keep that strict.
- `chatMessage` is trimmed to 200 chars server-side. Don't loosen unless asked.
- No auth — host privileges are checked via `room.hostId === socket.id`. Flag any host-only action missing this check.

## Output format

Use the user's language (Vietnamese if they wrote Vietnamese, else English).

```
## Tóm tắt
<1–2 câu về phạm vi review và kết luận: pass / cần sửa / có lỗi nghiêm trọng>

## 🔴 Critical (bugs, chips sai, leak bài, deadlock)
- [server.js:497](server.js#L497) — <vấn đề>. <hậu quả cụ thể trong game>. Sửa: <gợi ý>.

## 🟡 Should fix (quality, conventions, edge cases)
- [public/app.js:880](public/app.js#L880) — ...

## 🟢 Nit / optional
- ...

## ✅ Điểm tốt
<1–3 chỗ làm đúng — bỏ qua nếu không có gì nổi bật>
```

Rules:
- Cite `file:line` with markdown links so the user can jump.
- For Critical/Should-fix: include a concrete fix (not just "this is wrong").
- Omit empty severity sections entirely — don't write "None".
- Don't auto-edit files. Review only. Apply fixes only if user explicitly asks after seeing the report.

## Anti-patterns to avoid in the review itself

- Don't suggest adding tests — there is no test framework.
- Don't suggest TypeScript / framework migration / ESLint adoption unless asked.
- Don't flag style issues a formatter would fix (quote style, semicolons) unless the file is clearly hand-broken.
- Don't invent "what if 1000 players" scenarios — max room size is 9.
- Don't repeat the same finding under multiple severity levels.
- Don't pad the report. A 3-line review for a 10-line change is correct.
