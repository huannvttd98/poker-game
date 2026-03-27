# Poker LAN - Game Flow & Features

## 1. Flow nguoi choi

```
Mo trinh duyet -> Nhap ten, chon avatar, dat chips
        |
        v
    [LOBBY] --- Thay danh sach room ---+--- Tao room (dat ten)
        |                              |
        |                              +--- Join room (nhap ma)
        |                              |
        |                              +--- Watch (vao xem van dang choi)
        v
   [ROOM SCREEN] --- Thay danh sach nguoi choi
        |
        |--- Host nhan "Start Game" (lan dau)
        |--- Tat ca nhan "Ready" (cac van sau)
        v
   [GAME SCREEN] --- Choi poker
        |
        |--- Ket thuc van -> Hien ket qua
        |--- Tat ca Ready -> Tu dong bat van moi
        |--- Het chips -> Tu dong roi ban
        |--- Nhan Exit -> Roi ban (mat chips da dat)
        v
   [LOBBY] --- Quay lai choi tiep
```

## 2. Flow mot van poker

```
[Start Hand]
     |
     v
 Dealer rotation (D -> SB -> BB)
     |
     v
 Auto post blinds (SB: 10, BB: 20)
     |
     v
 Chia 2 la bai cho moi nguoi
     |
     v
 [PREFLOP] --- Vong cuoc 1 (bat dau tu nguoi sau BB)
     |
     v
 Lat 3 la chung (burn 1)
     |
     v
 [FLOP] --- Vong cuoc 2
     |
     v
 Lat 1 la chung (burn 1)
     |
     v
 [TURN] --- Vong cuoc 3
     |
     v
 Lat 1 la chung (burn 1)
     |
     v
 [RIVER] --- Vong cuoc 4
     |
     v
 [SHOWDOWN] --- So bai, chia pot
     |
     v
 Hien ket qua (bai chung + bai moi nguoi + ten tay bai)
     |
     v
 Doi tat ca Ready -> Van moi
```

## 3. Cac hanh dong trong luot choi

| Action   | Mo ta                                    |
|----------|------------------------------------------|
| Check    | Bo luot (chi khi khong can goi)          |
| Call     | Goi theo muc cuoc hien tai               |
| Raise    | Tang muc cuoc (dung slider hoac nut pot) |
| Fold     | Bo bai, khong choi tiep                  |
| All-In   | Dat het tat ca chips                     |

### Ho tro raise:
- Nut **1/3, 1/2, 2/3, Pot** — dat nhanh theo ty le pot
- Nut **-5, +5** — tang giam chinh xac
- **Slider** — keo chon so chips

## 4. Tinh nang he thong

### Room System
- Tao room voi ten tuy chon
- Join bang ma room hoac chon tu danh sach
- Toi da 9 nguoi choi moi room
- Host start game lan dau, sau do tat ca Ready

### Spectator Mode
- Nguoi vao giua van duoc xem (Watch)
- Thay tat ca nguoi choi, bai up, pot, community cards
- Tu dong tham gia van tiep theo

### Timer
- 30 giay moi luot
- Vong tron dem nguoc o goc tren phai
- Het gio -> tu dong Fold

### Ready System (giua cac van)
- Ket thuc van -> hien ket qua + nut Ready
- Hien thi ai da Ready (avatar + so dem)
- Tat ca Ready -> tu dong bat van moi
- Nguoi het chips -> thong bao + roi ban sau 3 giay

### Ket qua van
- **Others folded**: hien nguoi thang + so chips
- **Showdown**: hien bai chung + bai moi nguoi + ten tay bai
- Nguoi thang: vien vang, hien so chips thang
- Nguoi thua: mo di

### Disconnect
- Dang choi: tu dong Fold + roi ban
- Dang cho: roi ban binh thuong

## 5. Tinh nang ho tro

### Action Log
- Nut "Log" goc tren trai
- Ghi lai: blinds, moi action, chuyen stage
- Mau sac theo loai action

### File Log (cho quan tri)
- Luu tai `logs/game-YYYY-MM-DD.log`
- Ghi: ROOM_CREATE, ROOM_JOIN, GAME_START, ACTION, AUTO_FOLD, HAND_END, DISCONNECT
- Moi dong: timestamp + type + JSON data

### Huong dan choi
- Nut "?" goc tren phai
- Giai thich luat, flow, cac action
- Bang xep hang tay bai voi minh hoa + ty le

## 6. Ky thuat

### Kien truc
```
Client (Browser)  <--Socket.IO-->  Node.js Server
   HTML/CSS/JS                      Express + Socket.IO
                                    Game Logic (memory)
                                    pokersolver (hand eval)
```

### Cau truc file
```
poker-game/
  server.js            # Server + game logic + file logger
  package.json
  .gitignore
  public/
    index.html          # Giao dien
    style.css           # CSS (mobile-first + desktop)
    app.js              # Client logic
  logs/
    game-YYYY-MM-DD.log # Log file theo ngay
```

### Responsive
- Mobile-first (< 768px)
- Desktop (>= 768px)
- Landscape mobile
- Small phones (< 360px)
