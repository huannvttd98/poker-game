# Poker Game — Tài liệu dự án

Thư mục này lưu lại flow và kiến trúc của dự án poker LAN real-time.

## Danh sách tài liệu

| File | Nội dung |
|---|---|
| [01-overview.md](01-overview.md) | Tổng quan: kiến trúc, stack, cấu trúc thư mục |
| [02-user-flow.md](02-user-flow.md) | Flow người chơi: profile → lobby → room → game → result |
| [03-hand-flow.md](03-hand-flow.md) | Flow một ván bài: preflop → flop → turn → river → showdown |
| [04-server-architecture.md](04-server-architecture.md) | Data model, lifecycle functions, state machine server-side |
| [05-socket-events.md](05-socket-events.md) | Danh mục đầy đủ Socket.IO events (client ↔ server) |
| [06-client-architecture.md](06-client-architecture.md) | UI screens, render functions, user interactions |
| [07-pot-distribution.md](07-pot-distribution.md) | Logic chia pot, side pots, luật odd-chip |
| [08-logging.md](08-logging.md) | File log format, các event được log |

## Quy ước

- File/dòng được trích dẫn theo format `file:line` (VD `server.js:97`).
- Tài liệu mô tả flow theo **code hiện tại**, cập nhật thủ công khi code thay đổi.
- File gốc `FLOW.md` ở root giữ nguyên như bản tóm tắt cấp cao.
