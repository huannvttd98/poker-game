# Hướng dẫn Deploy Poker Game lên Ubuntu

## 1. Cài đặt Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

## 2. Đưa code lên server

**Cách A — Git:**

```bash
sudo apt install -y git
sudo mkdir -p /var/www
cd /var/www
sudo git clone <repo-url> poker-game
cd poker-game
```

**Cách B — Upload thủ công (SCP từ máy Windows):**

Trên server tạo thư mục trước:

```bash
sudo mkdir -p /var/www
```

Trên máy Windows:

```powershell
scp -r D:\laragon\www\poker-game user@<server-ip>:/var/www/poker-game
```

## 3. Cài dependencies

```bash
cd /var/www/poker-game
npm install --production
```

## 4. Phân quyền thư mục logs

```bash
sudo chown -R $USER:$USER /var/www/poker-game
```

## 5. Test chạy thử

```bash
node server.js
# Truy cập http://<server-ip>:3000
# Ctrl+C để tắt
```

## 6. Chạy nền với PM2

```bash
sudo npm install -g pm2

cd /var/www/poker-game
pm2 start server.js --name poker-game
pm2 save
pm2 startup   # chạy lệnh mà nó in ra để tự khởi động cùng hệ thống
```

Quản lý:

```bash
pm2 status              # xem trạng thái
pm2 logs poker-game     # xem log
pm2 restart poker-game  # khởi động lại
pm2 stop poker-game     # dừng
```

## 7. Mở firewall

```bash
# Bật firewall (nếu chưa bật)
sudo ufw enable

# Mở SSH để không mất kết nối
sudo ufw allow OpenSSH

# Nếu KHÔNG dùng Nginx — mở port 3000
sudo ufw allow 3000/tcp

# Nếu dùng Nginx reverse proxy — mở port 80/443 thay vì 3000
sudo ufw allow 'Nginx Full'

# Kiểm tra
sudo ufw status
```

## 8. Cấu hình Nginx reverse proxy (khuyến nghị)

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/poker-game
```

### Cấu hình A — Chưa có tên miền (dùng IP)

```nginx
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Bắt buộc cho Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> `server_name _;` nhận mọi request bất kể domain/IP. Truy cập bằng `http://<IP-server>`.

### Cấu hình B — Có tên miền

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Bắt buộc cho Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> Truy cập qua `http://your-domain.com` (port 80), không cần `:3000`.

### Kích hoạt

```bash
# Xóa config mặc định (tránh xung đột default_server)
sudo rm -f /etc/nginx/sites-enabled/default

# Tạo symlink
sudo ln -s /etc/nginx/sites-available/poker-game /etc/nginx/sites-enabled/

# Kiểm tra cú pháp
sudo nginx -t

# Khởi động lại
sudo systemctl restart nginx
```

## 9. SSL với Certbot (chỉ khi có tên miền)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot tự cấu hình HTTPS và tự gia hạn chứng chỉ.

> **Lưu ý:** Certbot yêu cầu tên miền thật trỏ về IP server. Không dùng được với cấu hình A (chỉ IP).

## Tổng quan luồng hoạt động

```
Client → Nginx (port 80/443) → Node.js + PM2 (port 3000)
```

## Lưu ý

- **Socket.IO** yêu cầu header `Upgrade` và `Connection` trong Nginx — đã có trong config bước 8.
- Thư mục `logs/` cần quyền ghi cho user chạy Node.js.
- Nếu muốn dùng biến môi trường cho PORT, sửa `server.js`:
  ```js
  const PORT = process.env.PORT || 3000;
  ```

---

## Tối ưu cho VPS cấu hình thấp (1 core / 1GB RAM / 20GB disk)

### Tạo swap 1GB (bắt buộc)

Ubuntu 24.04 + Nginx + Node.js chiếm gần hết 1GB RAM. Swap giúp tránh bị kill process.

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Tối ưu swap
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

### Tắt dịch vụ không cần

```bash
sudo systemctl disable snapd
sudo systemctl disable snapd.socket
sudo systemctl disable snap.lxd.activate
sudo systemctl stop snapd

# Kiểm tra RAM còn trống
free -h
```

### PM2 — Giới hạn memory

Chỉ chạy 1 instance (1 core không cần cluster mode), giới hạn RAM 300MB:

```bash
pm2 start server.js --name poker-game --max-memory-restart 300M
```

### Nginx — Giảm worker

Sửa `/etc/nginx/nginx.conf`:

```nginx
worker_processes 1;          # 1 core = 1 worker
worker_connections 512;      # giảm từ 1024 mặc định
```

### NPM install — Tránh hết RAM

```bash
NODE_OPTIONS="--max-old-space-size=256" npm install --production
```

### Logrotate — Quản lý dung lượng ổ cứng

```bash
sudo nano /etc/logrotate.d/poker-game
```

Nội dung:

```
/var/www/poker-game/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

Kiểm tra dung lượng định kỳ:

```bash
df -h
du -sh /var/www/poker-game/logs/
```

### Ước tính tài nguyên

| Thành phần | RAM ước tính |
|---|---|
| Ubuntu 24.04 (tối thiểu) | ~300MB |
| Nginx | ~5MB |
| Node.js (poker-game) | ~50–150MB |
| **Tổng** | **~400–500MB** |

Còn ~500MB cho swap buffer — **đủ cho 10–20 người chơi đồng thời**. Nếu vượt quá cần nâng RAM lên 2GB.

### Checklist tối ưu

- [ ] Tạo swap 1GB
- [ ] Tắt snapd và dịch vụ thừa
- [ ] PM2: 1 instance, giới hạn 300MB
- [ ] Nginx: 1 worker
- [ ] Cấu hình logrotate
- [ ] Theo dõi RAM: `htop` hoặc `free -h`
