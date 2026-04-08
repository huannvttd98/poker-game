const socket = io();

let myId = null;
let myRoomId = null;
let currentRoom = null;
let currentGame = null;
let isReady = false;
let isSpectator = false;

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

// ============================================
// LOBBY
// ============================================
function createRoom() {
  const roomName = document.getElementById('room-name').value.trim() || '';
  socket.emit('createRoom', { playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar, roomName }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    showScreen('room-screen');
  });
}

function joinRoom() {
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!code) return showModal(t('enterRoomCode'));
  socket.emit('joinRoom', { roomId: code, playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
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
  showScreen('lobby-screen');
}

function toggleReady() {
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
          <div class="room-host">${r.name ? esc(r.id) + ' · ' : ''}${t('host')}: ${esc(r.hostName)}</div>
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
  socket.emit('joinRoom', { roomId, playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar }, (res) => {
    if (res.error) return showModal(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
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
  currentGame = game;
  showScreen('game-screen');
  renderGame(game);
  renderRankList();
});

// Seat positions around the poker-table area (percentages)
function getSeatPositions() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    return [
      { top: 82, left: 50 },   // 0: bottom center (me)
      { top: 74, left: 10 },   // 1: bottom left
      { top: 52, left: 3 },    // 2: mid left
      { top: 22, left: 10 },   // 3: top left
      { top: 7,  left: 32 },   // 4: top left-center
      { top: 7,  left: 68 },   // 5: top right-center
      { top: 22, left: 90 },   // 6: top right
      { top: 52, left: 97 },   // 7: mid right
      { top: 74, left: 90 },   // 8: bottom right
    ];
  }
  return [
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
    // Spectator - show all players as-is
    ordered.push(...game.players);
  }

  // Seats
  const seatPositions = getSeatPositions();
  const seatsEl = document.getElementById('seats');
  seatsEl.innerHTML = ordered.map((p, i) => {
    const pos = seatPositions[i];
    const classes = ['seat'];
    if (p.isCurrent) classes.push('current');
    if (p.folded) classes.push('folded');

    let badge = '';
    if (p.isDealer) badge = '<span class="seat-badge dealer">D</span>';
    else if (p.isSB) badge = '<span class="seat-badge sb">SB</span>';
    else if (p.isBB) badge = '<span class="seat-badge bb">BB</span>';

    const cardsHtml = renderPlayerCards(p, game.stage);

    return `
      <div class="${classes.join(' ')}" style="top:${pos.top}%;left:${pos.left}%">
        <div class="seat-info">
          ${badge}
          <div class="seat-avatar">${p.avatar || '😎'}</div>
          <div class="seat-name">${esc(p.name)}</div>
          <div class="seat-chips">${p.chips}</div>
          ${p.bet > 0 ? `<div class="seat-bet">${t('bet')}: ${p.bet}</div>` : ''}
          ${p.allIn ? '<div class="seat-bet" style="color:#e94560">ALL-IN</div>' : ''}
        </div>
        <div class="seat-cards">${cardsHtml}</div>
      </div>
    `;
  }).join('');

  // Community cards
  const ccEl = document.getElementById('community-cards');
  ccEl.innerHTML = game.communityCards.map(c => renderCard(c)).join('');

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
    // Hidden cards
    if (!player.folded) {
      return '<div class="card face-down"></div><div class="card face-down"></div>';
    }
    return '';
  }
  return player.hand.map(c => renderCard(c)).join('');
}

function renderCard(card) {
  const suitSymbols = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
  const suitClass = card.suit;
  return `<div class="card face-up ${suitClass}">${card.rank}${suitSymbols[card.suit]}</div>`;
}

function renderActions(game) {
  const actionsEl = document.getElementById('game-actions');
  const me = game.players.find(p => p.id === myId);

  if (!me || me.folded || me.allIn || !me.isCurrent || game.stage === 'showdown' || game.stage === 'finished') {
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
  const overlay = document.getElementById('result-overlay');
  const textEl = document.getElementById('result-text');
  const detailsEl = document.getElementById('result-details');

  if (result.reason === 'others_folded') {
    const w = result.winners[0];
    const p = currentGame?.players.find(p => p.id === w.playerId);
    const name = p?.name || 'Unknown';
    const avatar = p?.avatar || '😎';
    textEl.textContent = t('winner');
    detailsEl.innerHTML = `
      <div class="result-player">
        <span class="result-avatar">${avatar}</span>
        <span class="result-name">${esc(name)}</span>
      </div>
      <div class="result-chips">+${w.amount} ${t('chips')}</div>
      <div class="result-reason">${t('othersFolded')}</div>`;
  } else {
    textEl.textContent = t('showdown');

    // Community cards
    const ccHtml = currentGame?.communityCards?.length
      ? `<div class="result-community">
          <div class="result-section-label">${t('communityCards')}</div>
          <div class="result-cards">${currentGame.communityCards.map(c => renderCard(c)).join('')}</div>
        </div>`
      : '';

    // All players' hands (not folded)
    const playersHtml = currentGame?.players
      .filter(p => !p.folded && p.hand)
      .map(p => {
        const isWinner = result.winners.some(w => w.playerId === p.id);
        const handName = result.hands?.[p.id] || '';
        const winAmount = result.winners.filter(w => w.playerId === p.id).reduce((s, w) => s + w.amount, 0);
        return `
          <div class="result-player-hand ${isWinner ? 'is-winner' : 'is-loser'}">
            <div class="result-player-info">
              <span class="result-avatar-sm">${p.avatar || '😎'}</span>
              <span class="result-name-sm">${esc(p.name)}</span>
              ${isWinner ? `<span class="result-win-amount">+${winAmount}</span>` : ''}
            </div>
            <div class="result-cards">${p.hand.map(c => renderCard(c)).join('')}</div>
            <div class="result-hand-name">${handName}</div>
          </div>`;
      }).join('') || '';

    detailsEl.innerHTML = ccHtml + '<div class="result-players-list">' + playersHtml + '</div>';
  }

  // Reset ready button
  const btnReady = document.getElementById('btn-ready-next');
  btnReady.textContent = isSpectator ? t('joinReady') : t('ready');
  btnReady.disabled = false;
  btnReady.classList.remove('btn-waiting');

  // Clear ready status
  document.getElementById('ready-status').innerHTML = '';

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
    bar.style.display = 'flex';
    bar.innerHTML = `
      <span class="spectator-label">${t('spectating')}</span>
      <button class="btn-join-next" onclick="joinNextHand()">${t('joinNextHand')}</button>
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

  timerInterval = setInterval(() => {
    const ring = document.getElementById('gt-ring-fg');
    const text = document.getElementById('gt-text');
    if (!ring || !text) return;

    const now = Date.now();
    const remaining = Math.max(0, game.turnDeadline - now);
    const seconds = Math.ceil(remaining / 1000);
    const pct = remaining / (totalTime * 1000);

    ring.setAttribute('stroke-dashoffset', GT_C * (1 - pct));
    text.textContent = seconds;

    ring.classList.remove('warning', 'danger');
    if (pct <= 0.2) ring.classList.add('danger');
    else if (pct <= 0.5) ring.classList.add('warning');

    if (remaining <= 0) {
      stopTimer();
      text.textContent = '0';
      ring.setAttribute('stroke-dashoffset', GT_C);
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
    if (entry.action === 'stage') {
      return `<div class="log-entry log-stage">--- ${entry.stage} ---</div>`;
    }
    const amountStr = entry.amount ? ` <span class="log-amount">${entry.amount}</span>` : '';
    return `<div class="log-entry log-${entry.action}">
      <span class="log-name">${esc(entry.player)}</span>
      <span class="log-action">${entry.action}</span>${amountStr}
    </div>`;
  }).join('');

  list.scrollTop = list.scrollHeight;
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

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chatMessage', text, (res) => {
    if (res?.error) console.error(res.error);
  });
  input.value = '';
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
  const list = document.getElementById('chat-messages');
  if (!list) return;

  const isMe = msg.playerId === myId;
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

  if (!isChatVisible()) {
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
  if (e.key === 'Enter' && document.activeElement === document.getElementById('chat-input')) {
    sendChat();
  }
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
