# 09 — Telegram Login Setup

Hướng dẫn cấu hình đăng nhập qua Telegram cho Poker LAN.

## Tổng quan

- Login **bắt buộc** trên web client. Không có Telegram = không vào được lobby.
- Server verify hash từ Telegram bằng HMAC-SHA256 với bot token.
- Session lưu in-memory (`Map`) trên server; token lưu `localStorage` ở client (TTL 7 ngày).
- Restart server → mất session, user phải login lại.

## Yêu cầu

1. **Telegram Bot** tạo từ `@BotFather`.
2. **Domain công khai + HTTPS** — Telegram widget không hoạt động trên `http://192.168.x.x` thuần. 3 lựa chọn deploy ở dưới.

## Bước 1 — Tạo bot

1. Mở Telegram, chat với [@BotFather](https://t.me/BotFather).
2. Gõ `/newbot` → đặt tên hiển thị → đặt **username** (kết thúc bằng `Bot`, vd: `MyPokerLanBot`).
3. BotFather trả về **token** dạng `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ` — lưu lại, dùng cho `TG_BOT_TOKEN`.

## Bước 2 — Set domain cho bot

Widget chỉ chạy trên domain đã đăng ký với bot:

1. Trong chat với BotFather: `/setdomain`
2. Chọn bot vừa tạo.
3. Nhập domain (không có scheme, vd: `poker.example.com`).

> **Lưu ý:** mỗi bot chỉ set được 1 domain. Đổi domain phải `/setdomain` lại.

## Bước 3 — Set biến môi trường khi chạy server

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `TG_BOT_TOKEN` | ✅ | Token từ BotFather |
| `TG_BOT_USERNAME` | ✅ | Username bot (không có `@`, vd: `MyPokerLanBot`) |
| `PORT` | Không | Default 3000 |

### Cách dễ nhất — file `.env` (Node ≥20.6)

Copy `.env.example` thành `.env`, điền giá trị:

```
TG_BOT_TOKEN=123456789:ABC...
TG_BOT_USERNAME=MyPokerLanBot
PORT=3000
```

Sau đó:

```bash
npm run dev    # auto-reload khi sửa code
# hoặc
npm start      # production
```

Cả 2 script đều dùng `--env-file-if-exists=.env` nên `.env` tự load. `.env` đã có trong `.gitignore`, không bị commit.

### Windows (PowerShell) — không dùng .env

```powershell
$env:TG_BOT_TOKEN = '123456789:ABC...'
$env:TG_BOT_USERNAME = 'MyPokerLanBot'
npm start
```

### Linux / Mac — không dùng .env

```bash
export TG_BOT_TOKEN='123456789:ABC...'
export TG_BOT_USERNAME='MyPokerLanBot'
npm start
```

### PM2 (production)

```bash
pm2 start server.js --name poker-game \
  --env "TG_BOT_TOKEN=123456789:ABC..." \
  --env "TG_BOT_USERNAME=MyPokerLanBot"
```

Hoặc dùng `ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: 'poker-game',
    script: 'server.js',
    env: {
      TG_BOT_TOKEN: '123456789:ABC...',
      TG_BOT_USERNAME: 'MyPokerLanBot',
      PORT: 3000,
    }
  }]
};
```

> **Không commit token vào git.** Cho vào `.gitignore` nếu dùng `.env` riêng.

## Bước 4 — Deploy domain + HTTPS

Chọn 1 trong 3:

### Cách A — VPS có domain (production khuyến nghị)

Setup Nginx reverse proxy + Certbot (xem [DEPLOY.md](../DEPLOY.md)). Sau khi xong:
- Server chạy `http://127.0.0.1:3000`
- Nginx ra `https://your-domain.com`
- `/setdomain` của BotFather = `your-domain.com`

### Cách B — Cloudflare Tunnel (dễ, free)

Chạy LAN nhưng có URL HTTPS công khai:

```bash
# Cài cloudflared
brew install cloudflared          # Mac
# hoặc tải từ https://github.com/cloudflare/cloudflared/releases (Windows)

# Tạo tunnel tạm (không cần Cloudflare account)
cloudflared tunnel --url http://localhost:3000
```

Output sẽ có URL kiểu `https://random-words.trycloudflare.com`. Dùng URL này:
- `/setdomain` của BotFather = `random-words.trycloudflare.com`
- Mở URL này trên browser để login + chơi.

> Tunnel tạm thay đổi URL mỗi lần restart cloudflared. Để cố định, đăng ký Cloudflare account + Named Tunnel.

### Cách C — ngrok (tương tự Cloudflare Tunnel)

```bash
ngrok http 3000
```

Free tier có URL kiểu `https://abc-123.ngrok-free.app`. Set domain này vào BotFather.

> Free ngrok URL cũng tạm; mỗi restart đổi URL.

## Bước 5 — Test

1. Mở browser vào URL HTTPS đã setup.
2. Thấy màn "Đăng nhập để chơi" → nút Telegram widget hiện.
3. Click nút → Telegram popup → confirm.
4. Sau confirm → màn profile (chỉnh avatar/tên) → vào lobby.
5. F5 reload → tự động vào lại lobby (session restore từ localStorage).

## Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/auth/config` | `{enabled, botUsername}` cho client |
| POST | `/api/auth/telegram` | Verify hash, trả `{token, user}` |
| GET | `/api/auth/me` | Validate token, trả `{user}` (header `Authorization: Bearer <token>`) |
| POST | `/api/auth/logout` | Xóa session |

## Socket.IO auth

Sau login, client connect socket với `auth: { token }`. Server middleware:

```js
io.use((socket, next) => {
  if (!BOT_TOKEN) return next(); // auth disabled
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No auth token'));
  const user = sessions.get(token);
  if (!user) return next(new Error('Invalid or expired session'));
  socket.user = user;
  next();
});
```

Client xử lý `connect_error`:
- Message chứa `Invalid` / `expired` / `No auth` → xóa localStorage + reload → quay về login screen.

## Bảo mật

- `BOT_TOKEN` là **secret**. Lộ token = ai cũng giả lập được login. Không log, không commit.
- Hash verify dùng HMAC-SHA256 với `SHA256(bot_token)` làm key, đúng spec Telegram.
- `auth_date` check freshness ≤ 24h để chống replay attack.
- Session token sinh từ `crypto.randomBytes(32)` (256 bit entropy).
- Session TTL 7 ngày, cleanup mỗi giờ.

## Tắt Telegram auth (dev / LAN test)

Không set `TG_BOT_TOKEN` → server skip auth middleware → socket connect tự do. Client vẫn yêu cầu login nên cần edit code tạm, **không khuyến nghị** cho production.

Để tắt yêu cầu login phía client (dev only): trong `app.js` skip `bootstrapLogin()` và gọi thẳng `showScreen('profile-screen')`.

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| "Cannot load Telegram widget" | Domain chưa setdomain trong BotFather | `/setdomain` lại |
| "Authentication failed" | `TG_BOT_TOKEN` server không match bot | Verify token đúng |
| Widget hiện rồi click không có gì | Domain `/setdomain` khác domain hiện tại | Phải khớp tuyệt đối |
| Session restore không hoạt động | Server restarted → in-memory mất | User phải login lại |
| Logout xong vẫn auto-login | localStorage chưa xóa | F12 → Application → Local Storage → xóa `tgSession` |
