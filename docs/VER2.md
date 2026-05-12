# Poker LAN — Ver 2 Roadmap

Danh mục những thứ có thể nâng cấp cho dự án. Mỗi mục có **ước lượng effort** (S = vài giờ, M = 1-2 ngày, L = > 2 ngày), **giá trị** (tầm ảnh hưởng tới trải nghiệm), và **phụ thuộc** kỹ thuật.

Đọc cùng [01-overview.md](01-overview.md) để biết kiến trúc hiện tại.

---

## Đề xuất lộ trình

Nếu chỉ chọn 1 đợt nâng cấp, ưu tiên theo thứ tự sau:

### Phase 1 — Quick wins (1 tuần)
Cải thiện trải nghiệm chơi mà không phải đụng tới game logic:
- **Reconnect giữ ghế** (S) — Đáng làm nhất. Mất kết nối rồi mất chips là pain point lớn nhất hiện tại.
- **Profile lưu localStorage** (S) — tên, avatar, chips lifetime, số ván.
- **Emoji reactions** (S) — 👍 😂 🔥 trên seat đối thủ, làm bàn sinh động.
- **Hand history client-side** (S) — lưu 20 ván gần nhất ở browser, replay được pot/action.
- **Auto-action buttons** (S) — "Check/Fold to me", "Call any" — pre-action khi chưa tới lượt.

### Phase 2 — Game features (2-3 tuần)
Mở rộng cách chơi:
- **Tournament mode** (L) — blind levels tăng theo thời gian, payout structure.
- **Bot opponents** (M) — chơi solo / fill bàn thiếu người.
- **Time bank** (S) — pool thời gian dự phòng mỗi player, dùng khi cần suy nghĩ.
- **Run It Twice** (M) — all-in chia bàn 2 lần để giảm variance.
- **Rabbit hunt** (S) — sau khi mọi người fold, xem các lá tiếp theo.
- **Spectator chat tách kênh** (S) — spectator chat riêng, không spam người chơi.

### Phase 3 — Infrastructure (1 tháng)
Đầu tư hạ tầng để mở rộng về sau:
- **DB persistence** (M) — SQLite cho stats / hand history.
- **Auth nhẹ** (M) — magic link email hoặc Google OAuth.
- **Split server.js thành module** (M) — tách `game/`, `socket/`, `room/`.
- **Unit tests cho game logic** (L) — pot math, side pots, tie split.
- **TypeScript migration** (L) — chỉ làm khi codebase > 3000 dòng.

---

## Catalog đầy đủ theo nhóm

### 1. Reliability & Reconnect

#### 1.1 Reconnect giữ ghế (S, ⭐⭐⭐)
**Vấn đề**: socket disconnect → `handleDisconnect` auto-fold + `removePlayer`. Mất ghế, mất chips.

**Giải pháp**:
- Server giữ `room.players[]` thêm 30s sau disconnect; mark `connected: false`.
- Client lưu `{roomId, playerName, sessionToken}` vào `localStorage`; trên `connect`, emit `reclaim` với token.
- Server match token → khôi phục `socket.id` mới vào seat cũ.
- Nếu hết 30s không reclaim → mới thực sự fold + remove.

**Liên quan**: [server.js:1106 (handleDisconnect)](../server.js#L1106).

#### 1.2 Disconnect insurance / all-in protection (M, ⭐⭐)
Khi all-in rồi mất mạng, được "freeze" bàn 60s thay vì auto-fold.

#### 1.3 Server graceful shutdown (S, ⭐)
SIGTERM handler → broadcast `serverShutdown` → flush log → exit. Hiện tại restart server = mọi room mất sạch.

---

### 2. UX / UI

#### 2.1 Profile lưu localStorage (S, ⭐⭐⭐)
Lưu name, avatar, lifetime chips won, số ván chơi, win rate. Hiện ra ở profile-screen như "Lần cuối: 12 ngày trước, đã chơi 87 ván".

#### 2.2 Animation polish (M, ⭐⭐)
- Chip stack animation từ player → pot khi bet.
- Card flip 3D khi showdown.
- Pot → winner animation khi chia tiền.
- Currently có nhưng đơn giản — nâng cấp dùng CSS transitions / Web Animations API.

#### 2.3 Emoji reactions (S, ⭐⭐⭐)
Long-press avatar đối thủ → menu emoji (👍 😂 🔥 😢 🤔) → bay overlay lên seat họ + sound nhẹ. Gửi qua `emojiReact` socket event.

#### 2.4 Mute specific player (S, ⭐)
Quiet hate-chat mà không phải kick.

#### 2.5 Adjustable card size / UI scale (S, ⭐)
Slider trong settings cho người mắt yếu hoặc màn hình lớn.

#### 2.6 Quick chat presets (S, ⭐⭐)
"GG", "Nice hand", "wp", "tilt incoming" — 6-8 nút bấm nhanh thay vì gõ.

#### 2.7 Sound theme picker (S, ⭐)
Vegas / Subtle / Off. Hiện chỉ có on/off.

#### 2.8 Dark/Light theme (S, ⭐)
Hiện chỉ có 1 theme tối. Light mode cho người chơi ban ngày.

#### 2.9 Accessibility (M, ⭐⭐)
- ARIA labels cho seats, buttons, cards.
- Keyboard navigation đầy đủ.
- Colorblind-safe palette cho cơ/rô vs bích/chuồn.

---

### 3. Game features

#### 3.1 Tournament mode (L, ⭐⭐⭐)
- Blind levels tăng theo thời gian (vd: 10/20 → 15/30 sau 10 phút).
- Player hết chips → out, không rebuy.
- Payout structure cho top 3 / 50%.
- "Last man standing" UI.

**Implementation**: thêm `room.tournament: { levels: [{sb, bb, durationMs}], currentLevel, levelStartedAt, payout: [60, 30, 10] }`.

#### 3.2 Bot opponents (M, ⭐⭐⭐)
Cho phép thay người thật bằng bot:
- **Easy**: random fold/call/raise có weight.
- **Medium**: dựa trên hand strength (pokersolver evaluate vs random ranges).
- **Hard**: equity calculation + position aware.

Cờ `room.allowBots: true` + nút "Add Bot" cho host khi đủ slot.

#### 3.3 Time bank (S, ⭐⭐)
Mỗi player có +30s bank ban đầu. Hết 18s turn time → countdown trừ bank trước khi auto-fold. Hiển thị qua progress bar dưới timer.

#### 3.4 Run It Twice (M, ⭐⭐)
Khi tất cả còn lại đều all-in: hỏi cả 2 → nếu cùng đồng ý, chia bàn 2 lần, pot chia đôi. Giảm variance ván lớn.

**Implementation**: sau `advanceStage` mà `countPlayersCanAct === 0`, emit `runItTwicePrompt`. Nếu mọi player all-in đều confirm → loop showdown 2 lần, mỗi lần half-pot.

#### 3.5 Rabbit hunt (S, ⭐)
Sau khi `finishHand` (others_folded), nút "Rabbit hunt" hiện 3-5 lá còn lại chưa lật. Trả lời câu hỏi "nếu mình theo đến cuối thì sao".

#### 3.6 Straddle option (S, ⭐)
UTG được post 2x BB trước khi nhận bài, tăng action. Toggle trong room settings.

#### 3.7 Variants — Omaha (L, ⭐⭐)
4 lá riêng, phải dùng đúng 2. Server logic tách deck/eval, pokersolver có support `'omaha'` mode. Toggle `room.variant: 'holdem' | 'omaha'`.

#### 3.8 Short Deck (M, ⭐)
Bỏ 2-5, A có thể low cho A-6-7-8-9 straight. Pokersolver có support.

---

### 4. Spectator & Social

#### 4.1 Spectator chat riêng (S, ⭐⭐)
Spectator chat trong channel `spectator:{roomId}`, không spam người chơi. Người chơi không thấy được trừ khi bật toggle.

#### 4.2 Replay system (L, ⭐⭐)
Lưu action log + community cards + hole cards per hand. Sau ván có nút "Watch replay" → tua lại từng action với timeline scrub.

**Phụ thuộc**: cần lưu hole cards (bypass current rule "không log hole cards" — phải có flag privacy).

#### 4.3 Hand history client-side (S, ⭐⭐⭐)
Lưu 20 ván gần nhất vào `localStorage` (đã có `actionLog`, chỉ cần extend). UI "Lịch sử" trong lobby xem lại pot, action, winner.

#### 4.4 Friend list (M, ⭐)
Add friend bằng player id; thông báo khi friend online / vào room. Cần auth nhẹ.

#### 4.5 Private room với password (S, ⭐⭐)
`room.password` hash; join phải nhập password. Tránh người lạ lạc vào LAN public.

---

### 5. Persistence & Stats

#### 5.1 DB lưu stats (M, ⭐⭐)
SQLite (better-sqlite3) cho:
- `players(id, name, lifetime_chips, hands_played, wins)`
- `hands(id, room_id, started_at, winners_json, pot)`
- `actions(hand_id, player_id, action, amount, stage)`

Đủ dùng cho LAN. Postgres nếu muốn host nhiều bàn cùng lúc.

#### 5.2 Leaderboard (S, ⭐⭐)
Phụ thuộc DB. Bảng xếp hạng top winner trong tuần / tháng. Trang `/leaderboard` riêng hoặc tab trong lobby.

#### 5.3 Achievement system (M, ⭐)
Badges: "First Win", "Royal Flush", "Bluff Master" (won showdown with worst hand), "All-In Survivor". Toast notify khi unlock.

---

### 6. Server architecture

#### 6.1 Split server.js (M, ⭐⭐)
Hiện 1200 dòng. Tách:
```
src/
  game/
    deck.js
    handEval.js
    pot.js          // calculateSidePots, splitPot
    stages.js       // startGame, advanceStage, showdown
    actions.js      // handleAction
  socket/
    handlers.js     // io.on('connection') handlers
    broadcast.js    // broadcastGameState, getRoomState
  room/
    room.js         // create, join, leave, kick
  log/
    fileLogger.js
  index.js          // wiring
```

Sửa từng module dễ hơn nhiều. Effort: ~1 ngày refactor + test.

#### 6.2 Unit tests cho game logic (L, ⭐⭐⭐)
Vitest hoặc Node `--test`. Test cases:
- `splitPot` odd-chip distribution
- `calculateSidePots` các scenario all-in
- `determineWinners` tie reference equality
- `advanceStage` edge cases (all-in shortcut)
- `handleAction` invalid action handling
- Showdown end-to-end fixture (deck preset → expected winners)

Đặc biệt cần khi sửa logic chia pot — đang là hot zone.

#### 6.3 TypeScript migration (L, ⭐)
Chỉ làm khi codebase đủ lớn (> 3000 dòng). Hiện tại JSDoc đủ dùng.

#### 6.4 Rate limiting socket events (S, ⭐⭐)
`action` / `chatMessage` rate limit per socket (vd: max 10 actions/s, max 5 chats/s). Tránh spam / DOS.

#### 6.5 Action validation hardening (S, ⭐⭐)
Hiện validate basic. Thêm:
- Amount integer + finite check (chống `NaN`, `Infinity` từ client).
- Action sequence sanity (không thể `call` khi `currentBet === player.bet`).
- Max raise = chips (chống raise quá stack).

#### 6.6 Monitoring & metrics (M, ⭐)
Endpoint `/metrics` Prometheus-style: số room active, số player connected, hand/min throughput, error rate.

#### 6.7 Hot reload server (S, ⭐)
`nodemon` dev script trong package.json. Hiện restart thủ công.

---

### 7. AI / Coaching

#### 7.1 Hand strength meter (S, ⭐⭐)
Khi đến lượt mình, hiện thanh % "Hand strength" + equity vs random hand (Monte Carlo 1000 iterations). Toggle off cho người không muốn cheat.

#### 7.2 Pre-action advisor (M, ⭐)
"Khuyến nghị: Call (pot odds 25%, equity 33%)". Chỉ hiện trong learning mode.

#### 7.3 Post-hand analysis (M, ⭐)
Sau ván: "Bạn fold AK preflop — equity 65% vs opponent's range". Cần range estimation.

#### 7.4 GTO solver integration (L, ⭐)
Quá overkill cho LAN game. Bỏ qua.

---

### 8. Anti-cheat / Fairness

#### 8.1 Server-side action timing anonymization (S, ⭐)
Hiện gửi `turnDeadline` cho mọi player. Có thể đoán cards qua timing (suy nghĩ lâu = hand khó). Giải pháp: random delay 0-500ms cho mọi action broadcast → noise timing tells.

#### 8.2 Cards verifiability (L, ⭐)
Commit-reveal: server commit hash của deck shuffled + seed trước hand, reveal sau showdown. Cho phép player verify deck fair sau ván.

Overkill cho LAN, nhưng nice-to-have nếu host server cho strangers.

#### 8.3 Collusion detection (L, ⭐)
Track soft-play patterns giữa 2 player (always check to each other, fold to each other's raise). Flag cho host review.

---

### 9. Mobile-specific

#### 9.1 PWA installable (S, ⭐⭐)
Add manifest.json + service worker → "Add to Home Screen" trên iOS/Android. Đã có meta `apple-mobile-web-app-capable` nhưng thiếu manifest.

#### 9.2 Haptic feedback (S, ⭐)
`navigator.vibrate(50)` khi đến lượt, action, win. Subtle.

#### 9.3 Swipe gestures (M, ⭐)
Swipe trái = fold, phải = call. Up = raise slider. Pro mobile players sẽ thích.

#### 9.4 Landscape lock option (S, ⭐)
Setting "Always landscape" cho phone dùng làm máy chơi cố định.

---

## Effort × Value matrix

```
                Effort →
              S            M             L
        ┌───────────┬───────────┬───────────┐
   ⭐⭐⭐ │ Reconnect │ Tournament│ Replay    │
        │ Profile   │ Bots      │ Tests     │
        │ Quick chat│           │           │
   Val  ├───────────┼───────────┼───────────┤
   ↓⭐⭐  │ Time bank │ DB        │ Omaha     │
        │ Rabbit    │ RunItTwice│ Split srv │
        │ Reactions │ Split srv │           │
        ├───────────┼───────────┼───────────┤
   ⭐    │ Dark mode │ A11y      │ TS        │
        │ Haptic    │ Friends   │ GTO       │
        │ Straddle  │ Achv      │ Collusion │
        └───────────┴───────────┴───────────┘
```

---

## Đánh giá cá nhân

Nếu cho mình chọn 5 thứ làm tiếp:
1. **Reconnect giữ ghế** — fix pain point lớn nhất.
2. **Bot opponents** — chơi solo được, hữu ích khi không đủ bạn.
3. **Hand history client-side** — debug + nostalgia, dễ làm.
4. **Tournament mode** — biến game thành "đêm poker" có structure.
5. **Unit tests cho pot/sidepot** — đỡ sợ regression khi sửa game logic.

Không khuyến nghị TypeScript / DB migration / GTO solver lúc này — codebase đủ nhỏ để vanilla.
