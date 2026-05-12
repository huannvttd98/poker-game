const socket = io({ autoConnect: false });

let myId = null;
let myRoomId = null;
let currentRoom = null;
let currentGame = null;
let isReady = false;
let isSpectator = false;

// Telegram session
const SESSION_KEY = 'tgSession';
let sessionToken = null;
let sessionUser = null;

// Player profile
let myProfile = {
  name: '',
  chips: 5000,
  avatar: '😎'
};

const AVATARS = [
  '😎','🤠','👨‍🚀','🧑‍💻','🦊','🐺','🦁','🐯',
  '🐲','👑','💀','🤖','👽','🎃','🦅','🐸',
  '🦇','🔥','⚡','🃏'
];

// Animation tracking
let lastCommunityCardCount = 0;
let lastGameStage = null;
let lastActionLogLen = 0;
let lastBeepSecond = 0;
let wasMyTurn = false;

// Sound toggle
function toggleSound() {
  const on = SFX.toggle();
  document.getElementById('btn-sound').innerHTML = on ? '&#128264;' : '&#128263;';
}

// ============================================
// SCREENS
// ============================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============================================
// PROFILE SCREEN
// ============================================
function initAvatarPicker() {
  const list = document.getElementById('avatar-list');
  list.innerHTML = AVATARS.map(a =>
    `<div class="avatar-option ${a === myProfile.avatar ? 'selected' : ''}" onclick="selectAvatar('${a}')">${a}</div>`
  ).join('');
}

function selectAvatar(emoji) {
  myProfile.avatar = emoji;
  document.getElementById('avatar-emoji').textContent = emoji;
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.classList.toggle('selected', el.textContent === emoji);
  });
}

function enterLobby() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return showModal(t('enterYourName'));

  myProfile.name = name;
  myProfile.chips = 5000;

  renderProfileCard();
  showScreen('lobby-screen');
}

function renderProfileCard() {
  document.getElementById('my-profile-card').innerHTML = `
    <div class="profile-avatar">${myProfile.avatar}</div>
    <div class="profile-details">
      <div class="profile-name">${esc(myProfile.name)}</div>
      <div class="profile-chips">${myProfile.chips} ${t('chips')}</div>
    </div>
    <button class="btn-edit-profile" onclick="editProfile()">${t('editProfile')}</button>
  `;
}

function editProfile() {
  document.getElementById('player-name').value = myProfile.name;
  selectAvatar(myProfile.avatar);
  showScreen('profile-screen');
}

// Init on load
initAvatarPicker();
applyI18n();
document.getElementById('btn-sound').innerHTML = SFX.enabled ? '&#128264;' : '&#128263;';

// ============================================
// TELEGRAM LOGIN BOOTSTRAP
// ============================================
async function bootstrapLogin() {
  let cfg;
  try {
    cfg = await fetch('/api/auth/config').then(r => r.json());
  } catch (e) {
    showLoginError(t('loginConfigError'));
    return;
  }
  if (!cfg.enabled) {
    showLoginError(t('loginNotConfigured'));
    return;
  }

  // Try restore from localStorage
  const savedToken = localStorage.getItem(SESSION_KEY);
  if (savedToken) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: 'Bearer ' + savedToken }
      });
      if (res.ok) {
        const { user } = await res.json();
        onLoggedIn(savedToken, user, /*skipProfile*/ true);
        return;
      }
    } catch (e) { /* fall through to widget */ }
    localStorage.removeItem(SESSION_KEY);
  }

  // Show QR login
  showQrLogin();
}

let qrPollTimer = null;

async function showQrLogin() {
  if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }

  let sess;
  try {
    const r = await fetch('/api/auth/qr-session', { method: 'POST' });
    if (!r.ok) throw new Error('qr-session failed');
    sess = await r.json();
  } catch (e) {
    showLoginError(t('loginConfigError'));
    return;
  }

  const widget = document.getElementById('login-widget');
  widget.innerHTML = `
    <div class="qr-container">
      <div id="qr-canvas" class="qr-canvas"></div>
      <a href="${sess.deepLink}" target="_blank" rel="noopener" class="qr-link">
        <span class="qr-link-icon">✈</span> ${t('qrOpenInTelegram')}
      </a>
      <div class="qr-hint">${t('qrHint')}</div>
      <div class="qr-status"><span class="qr-dot"></span>${t('qrWaiting')}</div>
    </div>
  `;
  document.getElementById('login-status').style.display = 'none';

  // Render QR (qrcode-generator global from CDN)
  try {
    const qr = qrcode(0, 'L');
    qr.addData(sess.deepLink);
    qr.make();
    document.getElementById('qr-canvas').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
  } catch (e) {
    document.getElementById('qr-canvas').textContent = '⚠ QR render failed';
  }

  // Poll status
  qrPollTimer = setInterval(async () => {
    try {
      const r = await fetch('/api/auth/qr-status/' + encodeURIComponent(sess.authCode));
      if (r.status === 404) {
        clearInterval(qrPollTimer);
        qrPollTimer = null;
        showQrLogin(); // session expired → regenerate
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      if (data.ready && data.token) {
        clearInterval(qrPollTimer);
        qrPollTimer = null;
        localStorage.setItem(SESSION_KEY, data.token);
        onLoggedIn(data.token, data.user, false);
      }
    } catch (e) { /* keep polling */ }
  }, 2000);
}

function showLoginError(msg) {
  if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
  document.getElementById('login-status').style.display = 'none';
  const widget = document.getElementById('login-widget');
  if (widget) widget.innerHTML = '';
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function onLoggedIn(token, user, skipProfileScreen) {
  sessionToken = token;
  sessionUser = user;
  myProfile.name = user.firstName || 'Player';

  // Connect socket with auth token
  socket.auth = { token };
  if (!socket.connected) socket.connect();

  // Show profile screen so user picks avatar / adjusts display name
  const banner = document.getElementById('login-user-banner');
  if (banner) {
    const tg = user.username ? ' @' + esc(user.username) : '';
    banner.innerHTML = `<span class="login-banner-icon">✓</span> ${t('loggedInAs')}: <b>${esc(user.firstName)}</b>${tg}`;
    banner.style.display = 'flex';
  }
  document.getElementById('player-name').value = user.firstName || '';
  showScreen('profile-screen');
}

async function logoutTelegram() {
  if (sessionToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sessionToken }
      });
    } catch (e) { /* ignore */ }
  }
  localStorage.removeItem(SESSION_KEY);
  sessionToken = null;
  sessionUser = null;
  myProfile.name = '';
  if (socket.connected) socket.disconnect();
  location.reload();
}

socket.on('connect_error', (err) => {
  const msg = (err && err.message) || '';
  if (msg.includes('Invalid') || msg.includes('expired') || msg.includes('No auth')) {
    localStorage.removeItem(SESSION_KEY);
    sessionToken = null;
    // Reload to show login again
    location.reload();
  }
});

bootstrapLogin();

// ============================================
// LOBBY
// ============================================
function toggleRoomSettings() {
  const el = document.getElementById('room-settings');
  const btn = document.querySelector('.btn-toggle-settings');
  if (el.style.display === 'none') {
    el.style.display = 'flex';
    btn.classList.add('active');
  } else {
    el.style.display = 'none';
    btn.classList.remove('active');
  }
}

function getRoomSettings() {
  const blindsVal = document.getElementById('setting-blinds').value.split('/');
  return {
    startingChips: parseInt(document.getElementById('setting-chips').value) || 5000,
    smallBlind: parseInt(blindsVal[0]) || 10,
    bigBlind: parseInt(blindsVal[1]) || 20,
    maxPlayers: parseInt(document.getElementById('setting-max-players').value) || 9,
    turnTime: parseInt(document.getElementById('setting-turn-time').value) || 18,
    readyTime: parseInt(document.getElementById('setting-ready-time').value) || 12,
    lockAfterStart: !!document.getElementById('setting-lock-late')?.checked,
  };
}

function createRoom() {
  const roomName = document.getElementById('room-name').value.trim() || '';
  const settings = getRoomSettings();
  socket.emit('createRoom', { playerName: myProfile.name, avatar: myProfile.avatar, roomName, settings }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    clearChat();
    showScreen('room-screen');
  });
}

function joinRoom() {
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!code) return showModal(t('enterRoomCode'));
  socket.emit('joinRoom', { roomId: code, playerName: myProfile.name, avatar: myProfile.avatar }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    clearChat();
    if (res.spectator) {
      isSpectator = true;
      showScreen('game-screen');
      updateSpectatorBar();
    } else {
      isSpectator = false;
      showScreen('room-screen');
    }
  });
}

async function exitGame() {
  const ok = await showModal(t('exitConfirm'), { confirm: true });
  if (!ok) return;
  socket.emit('leaveRoom');
  myId = null;
  myRoomId = null;
  currentRoom = null;
  currentGame = null;
  isReady = false;
  isSpectator = false;
  stopTimer();
  closeResult();
  clearChat();
  showScreen('lobby-screen');
}

function leaveRoom() {
  socket.emit('leaveRoom');
  myId = null;
  myRoomId = null;
  currentRoom = null;
  currentGame = null;
  isReady = false;
  isSpectator = false;
  clearChat();
  showScreen('lobby-screen');
}

function toggleReady() {
  const me = currentRoom?.players.find(p => p.id === myId);
  if (me && me.chips <= 0) return;
  socket.emit('toggleReady');
  isReady = !isReady;
  const btn = document.getElementById('btn-ready');
  btn.textContent = isReady ? t('notReady') : t('ready');
  btn.classList.toggle('is-ready', isReady);
}

function startGame() {
  socket.emit('startGame', null, (res) => {
    if (res?.error) showModal(res.error);
  });
}

// ============================================
// ROOM LIST (LOBBY)
// ============================================
socket.on('roomList', (roomList) => {
  const el = document.getElementById('room-list');
  if (!roomList || roomList.length === 0) {
    el.innerHTML = `<div class="room-list-empty">${t('noRooms')}</div>`;
    return;
  }
  el.innerHTML = roomList.map(r => {
    const canJoin = r.playerCount < r.maxPlayers;
    const isPlaying = r.status === 'playing' || r.status === 'waiting_next';
    const btnText = canJoin ? (isPlaying ? t('watch') : t('join')) : t('full');
    return `
      <div class="room-list-item">
        <div class="room-info">
          <div class="room-code">${r.name ? esc(r.name) : esc(r.id)}</div>
          <div class="room-host">${r.name ? esc(r.id) + ' · ' : ''}${t('host')}: ${esc(r.hostName)} · BB${r.bigBlind || 20}</div>
        </div>
        <span class="room-players">${r.playerCount}/${r.maxPlayers}</span>
        <span class="room-status-badge ${r.status}">${isPlaying ? t('playing') : r.status}</span>
        <button class="btn-quick-join" onclick="quickJoin('${esc(r.id)}')" ${canJoin ? '' : 'disabled'}>
          ${btnText}
        </button>
      </div>
    `;
  }).join('');
});

function quickJoin(roomId) {
  socket.emit('joinRoom', { roomId, playerName: myProfile.name, avatar: myProfile.avatar }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    clearChat();
    if (res.spectator) {
      isSpectator = true;
      showScreen('game-screen');
      updateSpectatorBar();
    } else {
      isSpectator = false;
      showScreen('room-screen');
    }
  });
}

// ============================================
// ROOM UPDATE
// ============================================
socket.on('roomUpdate', (room) => {
  currentRoom = room;
  document.getElementById('room-id-display').textContent = room.name ? `${room.name} (${room.id})` : room.id;

  // Settings bar
  const s = room.settings || {};
  const settingsBar = document.getElementById('room-settings-bar');
  if (settingsBar && s.smallBlind) {
    settingsBar.innerHTML =
      `<span class="stag">${t('blinds')}: ${s.smallBlind}/${s.bigBlind}</span>` +
      `<span class="stag">${t('chips')}: ${s.startingChips}</span>` +
      `<span class="stag">${t('maxPlayers')}: ${s.maxPlayers}</span>` +
      `<span class="stag">${t('turnTime')}: ${s.turnTime}s</span>` +
      `<span class="stag">${t('readyTime')}: ${s.readyTime}s</span>` +
      (s.lockAfterStart ? `<span class="stag">${t('lockAfterStartTag')}</span>` : '');
  }
  const sidebarLabel = document.getElementById('sidebar-room-label');
  if (sidebarLabel) sidebarLabel.textContent = room.name || room.id;

  // Track spectator state from server
  const me = room.players.find(p => p.id === myId);
  if (me) {
    isSpectator = !!me.spectator;
  }

  // Player list
  const iAmHost = room.hostId === myId;
  const listEl = document.getElementById('player-list');
  listEl.innerHTML = room.players.map(p => {
    const isHost = p.id === room.hostId;
    const classes = ['player-card'];
    if (p.ready) classes.push('ready');
    if (isHost) classes.push('host');
    const kickBtn = (iAmHost && !isHost) ? `<button class="btn-kick" onclick="kickPlayer('${p.id}')">${t('kick')}</button>` : '';
    return `
      <div class="${classes.join(' ')}">
        <div class="player-avatar-small">${p.avatar || '😎'}</div>
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-chips">${p.chips} ${t('chips')}</div>
        ${p.ready ? `<div class="player-status">${t('ready')}</div>` : ''}
        ${p.spectator ? `<div class="player-status" style="color:#ff9800">${t('watching')}</div>` : ''}
        ${!p.connected ? `<div class="player-status" style="color:#e94560">${t('disconnected')}</div>` : ''}
        ${kickBtn}
      </div>
    `;
  }).join('');

  // Show/hide start button
  const isHost = room.hostId === myId;
  const btnStart = document.getElementById('btn-start');
  btnStart.style.display = isHost ? 'inline-block' : 'none';

  // If game started, switch to game screen and close result overlay
  if (room.status === 'playing') {
    stopReadyCountdown();
    closeResult();
    showScreen('game-screen');
  }

  // Update ready status in result overlay when waiting for next hand
  if (room.status === 'waiting_next') {
    const readyEl = document.getElementById('ready-status');
    if (readyEl) {
      const total = room.players.length;
      const readyCount = room.players.filter(p => p.ready).length;
      readyEl.innerHTML = room.players.map(p =>
        `<span class="ready-dot ${p.ready ? 'is-ready' : ''}">${p.avatar || '😎'}</span>`
      ).join('') + `<div class="ready-count">${t('readyCount', {n: readyCount, t: total})}</div>`;
    }
  }

  updateSpectatorBar();
  renderRankList();
});

// ============================================
// GAME UPDATE
// ============================================
socket.on('gameUpdate', (game) => {
  const prevGame = currentGame;
  currentGame = game;
  showScreen('game-screen');
  renderGame(game);
  renderRankList();

  // --- Sound triggers ---
  const me = game.players.find(p => p.id === myId);
  const isMyTurn = me && me.isCurrent && !me.folded && !me.allIn && game.stage !== 'showdown' && game.stage !== 'finished';

  // Start hand
  if (game.stage === 'preflop' && (!prevGame || prevGame.stage === 'finished' || prevGame.stage === 'showdown' || !prevGame.stage)) {
    SFX.startHand();
  }

  // Community cards revealed
  const prevCC = prevGame ? prevGame.communityCards.length : 0;
  if (game.communityCards.length > prevCC && prevCC >= 0) {
    SFX.communityCard();
  }

  // Your turn
  if (isMyTurn && !wasMyTurn) {
    SFX.yourTurn();
    lastBeepSecond = 0;
  }
  wasMyTurn = isMyTurn;

  // Action sounds from log
  const log = game.actionLog || [];
  if (log.length > lastActionLogLen) {
    const newActions = log.slice(lastActionLogLen);
    for (const entry of newActions) {
      const act = entry.action?.toLowerCase();
      if (act === 'check') SFX.check();
      else if (act === 'call') SFX.call();
      else if (act === 'raise') SFX.raise();
      else if (act === 'fold') SFX.fold();
      else if (act === 'all-in' || act === 'allin' || act === 'all in') SFX.allIn();
    }
  }
  lastActionLogLen = log.length;
});

// Seat positions around the poker-table area (percentages)
// Dynamic positioning based on player count for better distribution
function getSeatPositions(count) {
  const isMobile = window.innerWidth < 768;

  // Full 9-seat layouts
  const all9 = isMobile ? [
    { top: 82, left: 50 },   // 0: bottom center (me)
    { top: 74, left: 10 },   // 1: bottom left
    { top: 52, left: 3 },    // 2: mid left
    { top: 22, left: 10 },   // 3: top left
    { top: 7,  left: 32 },   // 4: top left-center
    { top: 7,  left: 68 },   // 5: top right-center
    { top: 22, left: 90 },   // 6: top right
    { top: 52, left: 97 },   // 7: mid right
    { top: 74, left: 90 },   // 8: bottom right
  ] : [
    { top: 85, left: 50 },   // 0: bottom center (me)
    { top: 75, left: 15 },   // 1: bottom left
    { top: 48, left: 6 },    // 2: mid left
    { top: 18, left: 15 },   // 3: top left
    { top: 6,  left: 36 },   // 4: top left-center
    { top: 6,  left: 64 },   // 5: top right-center
    { top: 18, left: 85 },   // 6: top right
    { top: 48, left: 94 },   // 7: mid right
    { top: 75, left: 85 },   // 8: bottom right
  ];

  if (!count || count >= 7) return all9;

  // Optimized layouts for fewer players
  const mobileLayouts = {
    2: [{ top: 82, left: 50 }, { top: 15, left: 50 }],
    3: [{ top: 82, left: 50 }, { top: 22, left: 12 }, { top: 22, left: 88 }],
    4: [{ top: 82, left: 50 }, { top: 52, left: 5 }, { top: 15, left: 50 }, { top: 52, left: 95 }],
    5: [{ top: 82, left: 50 }, { top: 60, left: 5 }, { top: 18, left: 22 }, { top: 18, left: 78 }, { top: 60, left: 95 }],
    6: [{ top: 82, left: 50 }, { top: 65, left: 5 }, { top: 22, left: 8 }, { top: 15, left: 50 }, { top: 22, left: 92 }, { top: 65, left: 95 }],
  };
  const desktopLayouts = {
    2: [{ top: 85, left: 50 }, { top: 15, left: 50 }],
    3: [{ top: 85, left: 50 }, { top: 20, left: 18 }, { top: 20, left: 82 }],
    4: [{ top: 85, left: 50 }, { top: 48, left: 6 }, { top: 15, left: 50 }, { top: 48, left: 94 }],
    5: [{ top: 85, left: 50 }, { top: 55, left: 8 }, { top: 18, left: 24 }, { top: 18, left: 76 }, { top: 55, left: 92 }],
    6: [{ top: 85, left: 50 }, { top: 62, left: 8 }, { top: 20, left: 12 }, { top: 15, left: 50 }, { top: 20, left: 88 }, { top: 62, left: 92 }],
  };

  const layouts = isMobile ? mobileLayouts : desktopLayouts;
  return layouts[count] || all9;
}

// Calculate bet chip position between seat and table center
function getBetChipPosition(seatPos) {
  const centerX = 50, centerY = 42;
  const dx = centerX - seatPos.left;
  const dy = centerY - seatPos.top;
  const factor = 0.38;
  return {
    top: seatPos.top + dy * factor,
    left: seatPos.left + dx * factor
  };
}

function renderGame(game) {
  // Reorder players so current player is at seat 0
  const myIndex = game.players.findIndex(p => p.id === myId);
  const ordered = [];
  if (myIndex >= 0) {
    for (let i = 0; i < game.players.length; i++) {
      ordered.push(game.players[(myIndex + i) % game.players.length]);
    }
  } else {
    ordered.push(...game.players);
  }

  // Dynamic seat positions based on player count
  const seatPositions = getSeatPositions(ordered.length);
  const seatsEl = document.getElementById('seats');

  const SEAT_TIMER_R = 21;
  const SEAT_TIMER_C = 2 * Math.PI * SEAT_TIMER_R;

  // Build last-action map from actionLog (current hand only)
  const lastActions = {};
  if (game.actionLog) {
    let currentHandStart = 0;
    for (let i = game.actionLog.length - 1; i >= 0; i--) {
      if (game.actionLog[i].action === 'newhand') { currentHandStart = i + 1; break; }
    }
    for (let i = currentHandStart; i < game.actionLog.length; i++) {
      const entry = game.actionLog[i];
      if (entry.playerId && entry.action !== 'stage' && entry.action !== 'result') {
        lastActions[entry.playerId] = entry;
      }
    }
  }

  let seatsHtml = '';

  ordered.forEach((p, i) => {
    const pos = seatPositions[i];
    const isMe = i === 0 && myIndex >= 0;
    const classes = ['seat'];
    if (p.isCurrent) classes.push('current');
    if (p.folded) classes.push('folded');
    if (isMe) classes.push('is-me');

    let badge = '';
    if (p.isDealer) badge = '<span class="seat-badge dealer">D</span>';
    else if (p.isSB) badge = '<span class="seat-badge sb">SB</span>';
    else if (p.isBB) badge = '<span class="seat-badge bb">BB</span>';

    const cardsHtml = renderPlayerCards(p);

    // Avatar with timer ring only on MY seat when it's my turn
    let avatarHtml;
    const hasTimer = isMe && p.isCurrent && game.turnDeadline && game.stage !== 'showdown' && game.stage !== 'finished';
    if (hasTimer) {
      avatarHtml = `<div class="seat-avatar-wrapper">
        <svg class="seat-timer-svg" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="${SEAT_TIMER_R}" class="seat-timer-bg"/>
          <circle cx="24" cy="24" r="${SEAT_TIMER_R}" class="seat-timer-fg" id="seat-timer-fg"
            stroke-dasharray="${SEAT_TIMER_C}" stroke-dashoffset="0"/>
        </svg>
        <div class="seat-avatar">${p.avatar || '😎'}</div>
      </div>`;
    } else {
      avatarHtml = `<div class="seat-avatar">${p.avatar || '😎'}</div>`;
    }

    // YOU badge for my seat
    const youBadge = isMe ? '<div class="seat-you-badge">YOU</div>' : '';

    // Last action label (show on other players, not on current turn player)
    let actionLabel = '';
    const la = lastActions[p.id];
    if (la && !p.isCurrent) {
      const actionColors = { fold: 'act-fold', call: 'act-call', check: 'act-check', raise: 'act-raise', allin: 'act-allin' };
      const actionKey = la.action.toLowerCase().replace(/\s/g, '');
      const cls = actionColors[actionKey] || 'act-default';
      const amountStr = la.amount ? ` ${la.amount}` : '';
      actionLabel = `<div class="seat-action ${cls}">${la.action}${amountStr}</div>`;
    }

    seatsHtml += `
      <div class="${classes.join(' ')}" data-pid="${p.id}" style="top:${pos.top}%;left:${pos.left}%">
        <div class="seat-info">
          ${badge}
          ${avatarHtml}
          <div class="seat-name">${esc(p.name)}</div>
          <div class="seat-chips">${p.chips}</div>
          ${youBadge}
          ${p.allIn ? '<div class="seat-status-allin">ALL-IN</div>' : ''}
          ${actionLabel}
        </div>
        <div class="seat-cards">
          ${cardsHtml}
        </div>
      </div>
    `;
  });

  seatsEl.innerHTML = seatsHtml;

  // Reset card count tracking on new hand
  if (game.stage === 'preflop' && lastGameStage !== 'preflop') {
    lastCommunityCardCount = 0;
  }

  // Community cards with staggered animation for new cards
  const ccEl = document.getElementById('community-cards');
  const prevCount = lastCommunityCardCount;
  lastCommunityCardCount = game.communityCards.length;

  ccEl.innerHTML = game.communityCards.map((c, i) => {
    const isNew = i >= prevCount;
    const delay = isNew ? (i - prevCount) * 0.15 : 0;
    const animClass = isNew ? ' card-anim' : '';
    return renderCard(c, animClass, delay);
  }).join('');

  lastGameStage = game.stage;

  // Pot
  document.getElementById('pot-display').textContent = `${t('pot')}: ${game.pot}`;
  document.getElementById('stage-display').textContent = game.stage;

  // Actions
  renderActions(game);

  // Timer
  startTimer(game);

  // Log
  renderLog(game.actionLog);
}

function renderPlayerCards(player) {
  if (!player.hand) {
    if (!player.folded) {
      return '<div class="card face-down"></div><div class="card face-down"></div>';
    }
    return '';
  }
  return player.hand.map(c => renderCard(c)).join('');
}

function renderCard(card, extraClass, delay) {
  const suitSymbols = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
  const suitClass = card.suit;
  const cls = extraClass || '';
  const delayStyle = delay ? ` style="animation-delay:${delay}s"` : '';
  return `<div class="card face-up ${suitClass}${cls}"${delayStyle}>${card.rank}${suitSymbols[card.suit]}</div>`;
}

function renderActions(game) {
  const actionsEl = document.getElementById('game-actions');
  const me = game.players.find(p => p.id === myId);

  if (!me || me.folded || me.allIn || me.chips <= 0 || !me.isCurrent || game.stage === 'showdown' || game.stage === 'finished') {
    actionsEl.style.display = 'none';
    return;
  }

  actionsEl.style.display = 'flex';

  const canCheck = me.bet >= game.currentBet;
  const callAmount = game.currentBet - me.bet;

  document.getElementById('btn-check').style.display = canCheck ? 'inline-block' : 'none';
  document.getElementById('btn-call').style.display = canCheck ? 'none' : 'inline-block';
  document.getElementById('call-amount').textContent = Math.min(callAmount, me.chips);

  // Raise controls
  const slider = document.getElementById('raise-slider');
  const input = document.getElementById('raise-input');
  const minRaise = game.currentBet + game.minRaise;
  const maxRaise = me.chips + me.bet;
  slider.min = minRaise;
  slider.max = maxRaise;
  slider.value = minRaise;
  input.min = minRaise;
  input.max = maxRaise;
  input.value = minRaise;
  document.getElementById('raise-min-label').textContent = minRaise;
  document.getElementById('raise-max-label').textContent = maxRaise;
  updateRaiseDisplay(minRaise);
  updatePotButtons(game.pot, minRaise, maxRaise);
}

function updatePotButtons(pot, minRaise, maxRaise) {
  const fractions = [1/3, 1/2, 2/3, 1];
  document.querySelectorAll('.btn-pot').forEach((btn, i) => {
    const val = Math.floor(pot * fractions[i]);
    const valid = val >= minRaise && val <= maxRaise;
    btn.classList.toggle('btn-pot-disabled', !valid);
    btn.disabled = !valid;
  });
}

function updateRaiseDisplay(val) {
  document.getElementById('raise-label').textContent = val;
}

function syncInputFromSlider() {
  const val = document.getElementById('raise-slider').value;
  document.getElementById('raise-input').value = val;
  updateRaiseDisplay(val);
}

function syncSliderFromInput() {
  const input = document.getElementById('raise-input');
  const slider = document.getElementById('raise-slider');
  const val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), parseInt(input.value) || 0));
  slider.value = val;
  updateRaiseDisplay(val);
}

function adjustRaise(bbMultiplier) {
  const bb = currentGame?.minRaise || 20;
  const slider = document.getElementById('raise-slider');
  const input = document.getElementById('raise-input');
  const step = bb * Math.abs(bbMultiplier);
  const dir = bbMultiplier > 0 ? 1 : -1;
  const newVal = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), parseInt(slider.value) + step * dir));
  slider.value = newVal;
  input.value = newVal;
  updateRaiseDisplay(newVal);
}

function setPotRaise(fraction) {
  if (!currentGame) {
    console.error('No current game data');
    return;
  }
  const slider = document.getElementById('raise-slider');
  const input = document.getElementById('raise-input');

  const potRaise = Math.floor(currentGame.pot * fraction);
  const val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), potRaise));
  slider.value = val;
  input.value = val;
  updateRaiseDisplay(val);
}

// ============================================
// ACTIONS
// ============================================
function doAction(action) {
  let amount = 0;
  if (action === 'raise') {
    amount = parseInt(document.getElementById('raise-input').value) || parseInt(document.getElementById('raise-slider').value);
  }
  socket.emit('action', { action, amount }, (res) => {
    if (res?.error) showModal(res.error);
  });
}

// ============================================
// HAND FINISHED
// ============================================
socket.on('handFinished', (result) => {
  stopTimer();
  SFX.win();

  // Highlight winner seats on the table
  if (result.winners) {
    result.winners.forEach(w => {
      const seatEl = document.querySelector(`.seat[data-pid="${w.playerId}"]`);
      if (seatEl) seatEl.classList.add('winner');
    });
  }

  const overlay = document.getElementById('result-overlay');
  let html = '';

  if (result.reason === 'others_folded') {
    const w = result.winners[0];
    const p = currentGame?.players.find(pl => pl.id === w.playerId);
    html = `
      <div class="result-bar-winner">
        <span class="result-bar-crown">👑</span>
        <span class="result-bar-avatar">${p?.avatar || '😎'}</span>
        <span class="result-bar-name">${esc(p?.name || 'Unknown')}</span>
        <span class="result-bar-amount">+${w.amount}</span>
        <span class="result-bar-reason">${t('othersFolded')}</span>
      </div>`;
  } else {
    // Showdown - horizontal cards for each player, winners first sorted by amount
    const handsHtml = currentGame?.players
      .filter(p => !p.folded && p.hand)
      .map(p => {
        const winEntries = result.winners.filter(w => w.playerId === p.id);
        const winAmount = winEntries.reduce((s, w) => s + w.amount, 0);
        const isWinner = winEntries.length > 0;
        const onlyRefund = isWinner && winEntries.every(w => w.uncalled);
        return { p, isWinner, winAmount, onlyRefund };
      })
      .sort((a, b) => b.winAmount - a.winAmount)
      .map(({ p, isWinner, winAmount, onlyRefund }) => {
        const handName = result.hands?.[p.id] || '';
        const badge = onlyRefund ? ' ↩' : (isWinner ? ' 👑' : '');
        const amountCls = onlyRefund ? 'rhi-amount rhi-amount-refund' : 'rhi-amount';
        const amountLabel = onlyRefund ? ` (${t('refunded')})` : '';
        return `
          <div class="result-hand-item ${isWinner && !onlyRefund ? 'is-winner' : 'is-loser'}">
            <span class="rhi-avatar">${p.avatar || '😎'}</span>
            <div class="rhi-info">
              <span class="rhi-name">${esc(p.name)}${badge}</span>
              <span class="rhi-hand">${handName}</span>
            </div>
            <div class="rhi-cards">${p.hand.map(c => renderCard(c)).join('')}</div>
            ${isWinner ? `<span class="${amountCls}">+${winAmount}${amountLabel}</span>` : ''}
          </div>`;
      }).join('') || '';

    html = `
      <div class="result-bar-title">${t('showdown')}</div>
      <div class="result-bar-hands">${handsHtml}</div>`;
  }

  html += `
    <div class="result-bar-footer">
      <div id="ready-countdown" class="ready-countdown"></div>
      <div id="ready-status" class="ready-status"></div>
      ${(() => {
        const me = currentRoom?.players.find(p => p.id === myId);
        const noChips = me && me.chips <= 0;
        const locked = !!me?.lateJoiner;
        if (locked) return `<button id="btn-ready-next" class="btn-ready-next" disabled style="opacity:0.5">${t('lockedSpectator')}</button>`;
        if (noChips) return `<button id="btn-ready-next" class="btn-ready-next" disabled style="opacity:0.5">${t('eliminated')}</button>`;
        return `<button id="btn-ready-next" class="btn-ready-next" onclick="readyNextHand()">${isSpectator ? t('joinReady') : t('ready')}</button>`;
      })()}
    </div>`;

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
});

// ============================================
// READY COUNTDOWN
// ============================================
let readyCountdownInterval = null;

socket.on('readyCountdown', ({ deadline }) => {
  stopReadyCountdown();
  readyCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const el = document.getElementById('ready-countdown');
    if (el) {
      el.textContent = remaining > 0 ? t('autoStartIn', {s: remaining}) : '';
    }
    if (remaining <= 0) stopReadyCountdown();
  }, 250);
});

function stopReadyCountdown() {
  if (readyCountdownInterval) {
    clearInterval(readyCountdownInterval);
    readyCountdownInterval = null;
  }
  const el = document.getElementById('ready-countdown');
  if (el) el.textContent = '';
}

function closeResult() {
  stopReadyCountdown();
  document.getElementById('result-overlay').style.display = 'none';
  // Clear winner celebration effects from table
  document.querySelectorAll('.seat.winner').forEach(el => el.classList.remove('winner'));
}

// Spectator mode
socket.on('spectatorMode', () => {
  isSpectator = true;
  showScreen('game-screen');
  updateSpectatorBar();
});

// Kick player (host only)
async function kickPlayer(targetId) {
  const target = currentRoom?.players.find(p => p.id === targetId);
  const name = target?.name || 'player';
  const ok = await showModal(t('kickConfirm', {name}), { confirm: true });
  if (!ok) return;
  socket.emit('kickPlayer', targetId, (res) => {
    if (res?.error) showModal(res.error);
  });
}

socket.on('kicked', () => {
  myId = null;
  myRoomId = null;
  currentRoom = null;
  currentGame = null;
  isReady = false;
  isSpectator = false;
  stopTimer();
  closeResult();
  showScreen('lobby-screen');
  showModal(t('kicked'));
});

socket.on('backToLobby', () => {
  closeResult();
  closeGameWon();
  isSpectator = false;
  showScreen('room-screen');
});

// ============================================
// GAME WON
// ============================================
socket.on('gameWon', (data) => {
  stopTimer();
  stopReadyCountdown();
  closeResult();
  SFX.gameWon();

  const overlay = document.getElementById('game-won-overlay');
  const isMe = data.winner.id === myId;

  let rankHtml = data.rankings.map((p, i) => {
    const medals = ['&#9812;', '&#9813;', '&#9814;'];
    const icon = medals[i] || (i + 1);
    const cls = i === 0 ? 'gw-gold' : i === 1 ? 'gw-silver' : i === 2 ? 'gw-bronze' : '';
    return `<div class="gw-rank-item ${cls}">
      <span class="gw-rank-pos">${icon}</span>
      <span class="gw-rank-avatar">${p.avatar || '😎'}</span>
      <span class="gw-rank-name">${esc(p.name)}</span>
      <span class="gw-rank-chips">${p.chips}</span>
    </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="gw-content">
      <div class="gw-title">${isMe ? t('youWin') : t('playerWins', {name: esc(data.winner.name)})}</div>
      <div class="gw-winner-avatar">${data.winner.avatar || '😎'}</div>
      <div class="gw-winner-name">${esc(data.winner.name)}</div>
      <div class="gw-winner-chips">${data.winner.chips} ${t('chips')}</div>
      <div class="gw-rankings">${rankHtml}</div>
      <div class="gw-note">${t('backToRoom')}</div>
    </div>`;
  overlay.style.display = 'flex';
});

function closeGameWon() {
  const el = document.getElementById('game-won-overlay');
  if (el) el.style.display = 'none';
}

function readyNextHand() {
  const me = currentRoom?.players.find(p => p.id === myId);
  if (me && me.chips <= 0) return;
  socket.emit('toggleReady');
  const btn = document.getElementById('btn-ready-next');
  btn.textContent = t('waiting');
  btn.disabled = true;
  btn.classList.add('btn-waiting');
  if (isSpectator) {
    isSpectator = false;
    updateSpectatorBar();
  }
}

// ============================================
// SPECTATOR BAR
// ============================================
function updateSpectatorBar() {
  const bar = document.getElementById('spectator-bar');
  if (!bar) return;

  if (isSpectator) {
    const me = currentRoom?.players.find(p => p.id === myId);
    const locked = !!me?.lateJoiner;
    bar.style.display = 'flex';
    bar.innerHTML = `
      <span class="spectator-label">${t('spectating')}</span>
      ${locked
        ? `<span class="spectator-locked">${t('lockedSpectator')}</span>`
        : `<button class="btn-join-next" onclick="joinNextHand()">${t('joinNextHand')}</button>`}
    `;
  } else {
    bar.style.display = 'none';
  }
}

function joinNextHand() {
  socket.emit('toggleReady');
  isSpectator = false;
  updateSpectatorBar();
}

// ============================================
// RANK LIST
// ============================================
function renderRankList() {
  const el = document.getElementById('rank-list');
  if (!el) return;

  const players = currentRoom?.players;
  if (!players || players.length === 0) {
    el.innerHTML = `<div class="rank-empty">${t('noPlayers')}</div>`;
    return;
  }

  const sorted = [...players].sort((a, b) => b.chips - a.chips);
  const totalChips = players.reduce((s, p) => s + p.chips, 0);
  const winTarget = Math.ceil(totalChips * 4 / 5);
  const leader = sorted[0];
  const pct = totalChips > 0 ? Math.min(100, Math.round(leader.chips / winTarget * 100)) : 0;

  const medals = ['gold', 'silver', 'bronze'];

  let html = `<div class="rank-progress">
    <div class="rank-progress-header">
      <span class="rank-progress-leader">${leader.avatar || '😎'} ${esc(leader.name)}</span>
      <span class="rank-progress-pct">${leader.chips} / ${winTarget}</span>
    </div>
    <div class="rank-progress-bar">
      <div class="rank-progress-fill ${pct >= 90 ? 'rank-progress-hot' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="rank-progress-label">${pct}% ${t('toWin')}</div>
  </div>`;

  html += sorted.map((p, i) => {
    const isMe = p.id === myId;
    const medal = medals[i] || '';
    const icon = i === 0 ? '&#9812;' : i === 1 ? '&#9813;' : i === 2 ? '&#9814;' : (i + 1);
    return `
      <div class="rank-item ${isMe ? 'rank-me' : ''} ${medal ? 'rank-' + medal : ''}">
        <span class="rank-pos">${icon}</span>
        <span class="rank-avatar">${p.avatar || '😎'}</span>
        <span class="rank-name">${esc(p.name)}</span>
        <span class="rank-chips">${p.chips}</span>
      </div>`;
  }).join('');

  el.innerHTML = html;
}

// ============================================
// UTILS
// ============================================
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// CUSTOM MODAL (replaces alert/confirm)
// ============================================
function showModal(msg, opts = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('app-modal');
    const msgEl = document.getElementById('app-modal-msg');
    const btnsEl = document.getElementById('app-modal-btns');
    msgEl.textContent = msg;

    if (opts.confirm) {
      btnsEl.innerHTML =
        `<button class="btn-modal-cancel" id="modal-cancel">${opts.cancelText || t('cancel')}</button>` +
        `<button class="btn-modal-ok" id="modal-ok">${opts.okText || t('confirm')}</button>`;
    } else {
      btnsEl.innerHTML =
        `<button class="btn-modal-ok" id="modal-ok">${opts.okText || t('ok')}</button>`;
    }

    overlay.style.display = 'flex';

    const close = (val) => {
      overlay.style.display = 'none';
      resolve(val);
    };

    document.getElementById('modal-ok').onclick = () => close(true);
    const cancelBtn = document.getElementById('modal-cancel');
    if (cancelBtn) cancelBtn.onclick = () => close(false);
  });
}

// ============================================
// TURN TIMER (global ring top-right)
// ============================================
let timerInterval = null;
const GT_R = 15;
const GT_C = 2 * Math.PI * GT_R; // ~94.25

function startTimer(game) {
  stopTimer();
  const el = document.getElementById('global-timer');
  if (!game.turnDeadline || game.stage === 'showdown' || game.stage === 'finished') {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  const totalTime = game.turnTime || 30;
  const SEAT_R = 21;
  const SEAT_C = 2 * Math.PI * SEAT_R;

  timerInterval = setInterval(() => {
    const globalRing = document.getElementById('gt-ring-fg');
    const globalText = document.getElementById('gt-text');
    const seatRing = document.getElementById('seat-timer-fg');

    const now = Date.now();
    const remaining = Math.max(0, game.turnDeadline - now);
    const seconds = Math.ceil(remaining / 1000);
    const pct = remaining / (totalTime * 1000);

    // Update global timer (pot area)
    if (globalRing && globalText) {
      globalRing.setAttribute('stroke-dashoffset', GT_C * (1 - pct));
      globalText.textContent = seconds;
      globalRing.classList.remove('warning', 'danger');
      if (pct <= 0.2) globalRing.classList.add('danger');
      else if (pct <= 0.5) globalRing.classList.add('warning');
    }

    // Update seat avatar timer ring
    if (seatRing) {
      seatRing.setAttribute('stroke-dashoffset', SEAT_C * (1 - pct));
      seatRing.classList.remove('timer-warning', 'timer-danger');
      if (pct <= 0.2) seatRing.classList.add('timer-danger');
      else if (pct <= 0.5) seatRing.classList.add('timer-warning');
    }

    // Countdown beep every second from 5s to 1s (my turn only)
    if (seconds <= 5 && seconds > 0 && seconds !== lastBeepSecond) {
      const me = currentGame?.players.find(p => p.id === myId);
      if (me && me.isCurrent) {
        SFX.timerLow(seconds);
        lastBeepSecond = seconds;
      }
    }

    if (remaining <= 0) {
      stopTimer();
      if (globalText) globalText.textContent = '0';
      if (globalRing) globalRing.setAttribute('stroke-dashoffset', GT_C);
    }
  }, 200);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const el = document.getElementById('global-timer');
  if (el) el.style.display = 'none';
}

// ============================================
// ACTION LOG
// ============================================
function renderLog(log) {
  const list = document.getElementById('action-log-list');
  if (!list || !log) return;

  list.innerHTML = log.map(entry => {
    if (entry.action === 'newhand') {
      return '<div class="log-entry log-newhand">&#9824; New Hand &#9824;</div>';
    }
    if (entry.action === 'stage') {
      return `<div class="log-entry log-stage">--- ${entry.stage} ---</div>`;
    }
    if (entry.action === 'result' && entry.winners) {
      const lines = [...entry.winners].sort((a, b) => b.amount - a.amount).map(w => {
        const cardsHtml = w.bestCards
          ? '<div class="log-best-cards">' + w.bestCards.map(c => renderCard(c, ' card-mini')).join('') + '</div>'
          : '';
        const handStr = w.hand ? '<span class="log-hand">' + w.hand + '</span>' : '';
        const icon = w.uncalled ? '↩' : '\u{1F451}';
        const winText = w.uncalled ? t('refunded') : t('wins');
        const rowClass = w.uncalled ? 'log-winner-line log-refund' : 'log-winner-line';
        return '<div class="' + rowClass + '">'
          + '<div class="log-winner-row1">' + icon + ' <span class="log-name">' + esc(w.name) + '</span> ' + handStr + '</div>'
          + '<div class="log-winner-row2"><span class="log-win-text">' + winText + ' <span class="log-amount">+' + w.amount + '</span></span>' + cardsHtml + '</div>'
          + '</div>';
      }).join('');
      return '<div class="log-entry log-result">' + lines + '</div>';
    }
    const amountStr = entry.amount ? ` <span class="log-amount">${entry.amount}</span>` : '';
    return `<div class="log-entry log-${entry.action}">
      <span class="log-name">${esc(entry.player)}</span>
      <span class="log-action">${entry.action}</span>${amountStr}
    </div>`;
  }).join('');

  list.scrollTop = list.scrollHeight;
}

async function openDownloadLogPicker() {
  let files = [];
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    files = data.files || [];
  } catch (e) {
    showModal(t('logFetchError'));
    return;
  }
  if (files.length === 0) {
    showModal(t('logEmpty'));
    return;
  }
  const overlay = document.getElementById('app-modal');
  const msgEl = document.getElementById('app-modal-msg');
  const btnsEl = document.getElementById('app-modal-btns');
  const listHtml = files.map(f => {
    const sizeKb = (f.size / 1024).toFixed(1);
    return `<a class="log-pick-item" href="/api/logs/${encodeURIComponent(f.name)}" download="${esc(f.name)}">
      <span class="log-pick-name">${esc(f.name)}</span>
      <span class="log-pick-size">${sizeKb} KB</span>
    </a>`;
  }).join('');
  msgEl.innerHTML = `<div class="log-pick-title">${t('logPickTitle')}</div><div class="log-pick-list">${listHtml}</div>`;
  btnsEl.innerHTML = `<button class="btn-modal-ok" id="modal-ok">${t('ok')}</button>`;
  overlay.style.display = 'flex';
  document.getElementById('modal-ok').onclick = () => { overlay.style.display = 'none'; };
}

// ============================================
// SIDEBAR
// ============================================
let sidebarOpen = false;
let currentSidebarTab = 'chat';

function toggleSidebar() {
  const sidebar = document.querySelector('.game-sidebar');
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('open', sidebarOpen);
  if (sidebarOpen && currentSidebarTab === 'chat') {
    unreadChat = 0;
    updateChatBadge();
  }
}

function switchSidebarTab(tab, btn) {
  currentSidebarTab = tab;
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('sidebar-' + tab);
  if (panel) panel.classList.add('active');

  if (tab === 'chat' && isChatVisible()) {
    unreadChat = 0;
    updateChatBadge();
    document.getElementById('chat-input').focus();
  }
}

// ============================================
// CHAT
// ============================================
let unreadChat = 0;

function sendChat(inputId) {
  const input = document.getElementById(inputId || 'chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chatMessage', text, (res) => {
    if (res?.error) console.error(res.error);
  });
  input.value = '';
}

function clearChat() {
  document.querySelectorAll('.chat-messages').forEach(el => { el.innerHTML = ''; });
  unreadChat = 0;
  updateChatBadge();
}

function isChatVisible() {
  const isMobile = window.innerWidth < 768;
  if (isMobile && !sidebarOpen) return false;
  return currentSidebarTab === 'chat';
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  const chatVisible = isChatVisible();
  const hasUnread = unreadChat > 0 && !chatVisible;

  // Tab badge
  if (badge) {
    if (hasUnread) {
      badge.style.display = 'inline-block';
      badge.textContent = unreadChat > 99 ? '99+' : unreadChat;
      badge.classList.add('chat-badge-pulse');
    } else {
      badge.style.display = 'none';
      badge.classList.remove('chat-badge-pulse');
    }
  }

  // Chat tab highlight
  const chatTab = document.querySelector('.sidebar-tab');
  if (chatTab) chatTab.classList.toggle('has-unread', hasUnread);

  // Mobile hamburger badge
  const toggleBtn = document.querySelector('.btn-toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.classList.toggle('has-notif', hasUnread);
    let mobileBadge = toggleBtn.querySelector('.mobile-chat-badge');
    if (hasUnread) {
      if (!mobileBadge) {
        mobileBadge = document.createElement('span');
        mobileBadge.className = 'mobile-chat-badge';
        toggleBtn.appendChild(mobileBadge);
      }
      mobileBadge.textContent = unreadChat > 99 ? '99+' : unreadChat;
    } else if (mobileBadge) {
      mobileBadge.remove();
    }
  }
}

socket.on('chatMessage', (msg) => {
  const lists = document.querySelectorAll('.chat-messages');
  if (lists.length === 0) return;

  const isMe = msg.playerId === myId;
  lists.forEach(list => {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (isMe ? ' chat-msg-me' : '');
    div.innerHTML =
      `<span class="chat-avatar">${msg.avatar}</span>` +
      `<div class="chat-bubble">` +
        `<span class="chat-name">${esc(msg.name)}</span>` +
        `<span class="chat-text">${esc(msg.text)}</span>` +
      `</div>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  });

  if (!isMe) SFX.chatMsg();
  // Badge/toast only for game-screen sidebar chat (room-screen always visible)
  const onRoomScreen = document.getElementById('room-screen')?.classList.contains('active');
  if (!onRoomScreen && !isChatVisible()) {
    unreadChat++;
    updateChatBadge();
    if (!isMe) showChatToast(msg);
  }
});

let chatToastTimer = null;
function showChatToast(msg) {
  let container = document.getElementById('chat-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'chat-toast-container';
    container.className = 'chat-toast-container';
    document.querySelector('.game-main').appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.innerHTML =
    `<span class="chat-toast-avatar">${msg.avatar}</span>` +
    `<div class="chat-toast-body">` +
      `<span class="chat-toast-name">${esc(msg.name)}</span>` +
      `<span class="chat-toast-text">${esc(msg.text)}</span>` +
    `</div>`;
  toast.addEventListener('click', () => {
    toast.remove();
    const chatTab = document.querySelector('.sidebar-tab');
    switchSidebarTab('chat', chatTab);
    if (!sidebarOpen && window.innerWidth < 768) toggleSidebar();
  });

  container.appendChild(toast);

  // Auto remove after 4s
  setTimeout(() => {
    toast.classList.add('chat-toast-hide');
    setTimeout(() => toast.remove(), 400);
  }, 4000);

  // Keep max 3 toasts
  while (container.children.length > 3) {
    container.firstChild.remove();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.activeElement;
  if (active === document.getElementById('chat-input')) sendChat();
  else if (active === document.getElementById('room-chat-input')) sendChat('room-chat-input');
});

// ============================================
// HELP
// ============================================
function toggleHelp() {
  const el = document.getElementById('help-overlay');
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

// Enter key support
document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enterLobby();
});

document.getElementById('room-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
