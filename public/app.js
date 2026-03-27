const socket = io();

let myId = null;
let myRoomId = null;
let currentRoom = null;
let currentGame = null;
let isReady = false;

// Player profile
let myProfile = {
  name: '',
  chips: 1000,
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
  if (!name) return alert('Enter your name');
  const chipsVal = parseInt(document.getElementById('player-chips').value);
  const chips = Math.max(100, Math.min(10000, isNaN(chipsVal) ? 1000 : chipsVal));

  myProfile.name = name;
  myProfile.chips = chips;

  renderProfileCard();
  showScreen('lobby-screen');
}

function renderProfileCard() {
  document.getElementById('my-profile-card').innerHTML = `
    <div class="profile-avatar">${myProfile.avatar}</div>
    <div class="profile-details">
      <div class="profile-name">${esc(myProfile.name)}</div>
      <div class="profile-chips">${myProfile.chips} chips</div>
    </div>
    <button class="btn-edit-profile" onclick="editProfile()">Edit</button>
  `;
}

function editProfile() {
  document.getElementById('player-name').value = myProfile.name;
  document.getElementById('player-chips').value = myProfile.chips;
  selectAvatar(myProfile.avatar);
  showScreen('profile-screen');
}

// Init avatar picker on load
initAvatarPicker();

// ============================================
// LOBBY
// ============================================
function createRoom() {
  socket.emit('createRoom', { playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar }, (res) => {
    if (res.error) return alert(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    showScreen('room-screen');
  });
}

function joinRoom() {
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!code) return alert('Enter room code');
  socket.emit('joinRoom', { roomId: code, playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar }, (res) => {
    if (res.error) return alert(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    showScreen('room-screen');
  });
}

function exitGame() {
  if (!confirm('Thoat khoi ban? Ban se mat het chips da dat.')) return;
  socket.emit('leaveRoom');
  myId = null;
  myRoomId = null;
  currentRoom = null;
  currentGame = null;
  isReady = false;
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
  showScreen('lobby-screen');
}

function toggleReady() {
  socket.emit('toggleReady');
  isReady = !isReady;
  const btn = document.getElementById('btn-ready');
  btn.textContent = isReady ? 'Not Ready' : 'Ready';
  btn.classList.toggle('is-ready', isReady);
}

function startGame() {
  socket.emit('startGame', null, (res) => {
    if (res?.error) alert(res.error);
  });
}

// ============================================
// ROOM LIST (LOBBY)
// ============================================
socket.on('roomList', (roomList) => {
  const el = document.getElementById('room-list');
  if (!roomList || roomList.length === 0) {
    el.innerHTML = '<div class="room-list-empty">No rooms available</div>';
    return;
  }
  el.innerHTML = roomList.map(r => {
    const canJoin = r.status === 'waiting' && r.playerCount < r.maxPlayers;
    return `
      <div class="room-list-item">
        <div class="room-info">
          <div class="room-code">${esc(r.id)}</div>
          <div class="room-host">Host: ${esc(r.hostName)}</div>
        </div>
        <span class="room-players">${r.playerCount}/${r.maxPlayers}</span>
        <span class="room-status-badge ${r.status}">${r.status}</span>
        <button class="btn-quick-join" onclick="quickJoin('${esc(r.id)}')" ${canJoin ? '' : 'disabled'}>
          ${canJoin ? 'Join' : (r.status === 'playing' ? 'In Game' : 'Full')}
        </button>
      </div>
    `;
  }).join('');
});

function quickJoin(roomId) {
  socket.emit('joinRoom', { roomId, playerName: myProfile.name, chips: myProfile.chips, avatar: myProfile.avatar }, (res) => {
    if (res.error) return alert(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    showScreen('room-screen');
  });
}

// ============================================
// ROOM UPDATE
// ============================================
socket.on('roomUpdate', (room) => {
  currentRoom = room;
  document.getElementById('room-id-display').textContent = room.id;

  // Player list
  const listEl = document.getElementById('player-list');
  listEl.innerHTML = room.players.map(p => {
    const isHost = p.id === room.hostId;
    const classes = ['player-card'];
    if (p.ready) classes.push('ready');
    if (isHost) classes.push('host');
    return `
      <div class="${classes.join(' ')}">
        <div class="player-avatar-small">${p.avatar || '😎'}</div>
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-chips">${p.chips} chips</div>
        ${p.ready ? '<div class="player-status">Ready</div>' : ''}
        ${!p.connected ? '<div class="player-status" style="color:#e94560">Disconnected</div>' : ''}
      </div>
    `;
  }).join('');

  // Show/hide start button
  const isHost = room.hostId === myId;
  const btnStart = document.getElementById('btn-start');
  btnStart.style.display = isHost ? 'inline-block' : 'none';

  // If game started, switch to game screen and close result overlay
  if (room.status === 'playing') {
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
      ).join('') + `<div class="ready-count">${readyCount}/${total} ready</div>`;
    }
  }
});

// ============================================
// GAME UPDATE
// ============================================
socket.on('gameUpdate', (game) => {
  currentGame = game;
  showScreen('game-screen');
  renderGame(game);
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
    { top: 90, left: 50 },
    { top: 78, left: 12 },
    { top: 48, left: 4 },
    { top: 18, left: 12 },
    { top: 6,  left: 34 },
    { top: 6,  left: 66 },
    { top: 18, left: 88 },
    { top: 48, left: 96 },
    { top: 78, left: 88 },
  ];
}

function renderGame(game) {
  // Reorder players so current player is at seat 0
  const myIndex = game.players.findIndex(p => p.id === myId);
  const ordered = [];
  for (let i = 0; i < game.players.length; i++) {
    ordered.push(game.players[(myIndex + i) % game.players.length]);
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
          ${p.bet > 0 ? `<div class="seat-bet">Bet: ${p.bet}</div>` : ''}
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
  document.getElementById('pot-display').textContent = `Pot: ${game.pot}`;
  document.getElementById('stage-display').textContent = game.stage;

  // Actions
  renderActions(game);

  // Timer
  startTimer(game);
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

  // Raise slider
  const slider = document.getElementById('raise-slider');
  const minRaise = game.currentBet + game.minRaise;
  slider.min = minRaise;
  slider.max = me.chips + me.bet;
  slider.value = minRaise;
  updateRaiseLabel();
}

function updateRaiseLabel() {
  document.getElementById('raise-label').textContent = document.getElementById('raise-slider').value;
}

function adjustRaise(amount) {
  const slider = document.getElementById('raise-slider');
  const newVal = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), parseInt(slider.value) + amount));
  slider.value = newVal;
  updateRaiseLabel();
}

function setPotRaise(fraction) {
  if (!currentGame) return;
  const slider = document.getElementById('raise-slider');
  const potRaise = Math.floor(currentGame.pot * fraction);
  const val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), potRaise));
  slider.value = val;
  updateRaiseLabel();
}

// ============================================
// ACTIONS
// ============================================
function doAction(action) {
  let amount = 0;
  if (action === 'raise') {
    amount = parseInt(document.getElementById('raise-slider').value);
  }
  socket.emit('action', { action, amount }, (res) => {
    if (res?.error) alert(res.error);
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
    textEl.textContent = 'Winner!';
    detailsEl.innerHTML = `
      <div class="result-player">
        <span class="result-avatar">${avatar}</span>
        <span class="result-name">${esc(name)}</span>
      </div>
      <div class="result-chips">+${w.amount} chips</div>
      <div class="result-reason">Doi thu bo bai</div>`;
  } else {
    textEl.textContent = 'Showdown!';

    // Community cards
    const ccHtml = currentGame?.communityCards?.length
      ? `<div class="result-community">
          <div class="result-section-label">Bai chung</div>
          <div class="result-cards">${currentGame.communityCards.map(c => renderCard(c)).join('')}</div>
        </div>`
      : '';

    // All players' hands (not folded)
    const playersHtml = currentGame?.players
      .filter(p => !p.folded && p.hand)
      .map(p => {
        const isWinner = result.winners.some(w => w.playerId === p.id);
        const handName = result.hands?.[p.id] || '';
        const winAmount = result.winners.find(w => w.playerId === p.id)?.amount || 0;
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
  btnReady.textContent = 'Ready';
  btnReady.disabled = false;
  btnReady.classList.remove('btn-waiting');

  // Clear ready status
  document.getElementById('ready-status').innerHTML = '';

  overlay.style.display = 'flex';
});

function closeResult() {
  document.getElementById('result-overlay').style.display = 'none';
}

socket.on('backToLobby', () => {
  closeResult();
  showScreen('room-screen');
});

function readyNextHand() {
  socket.emit('toggleReady');
  const btn = document.getElementById('btn-ready-next');
  btn.textContent = 'Waiting...';
  btn.disabled = true;
  btn.classList.add('btn-waiting');
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
// HELP
// ============================================
function toggleHelp() {
  const el = document.getElementById('help-overlay');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

// Enter key support
document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enterLobby();
});

document.getElementById('player-chips').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enterLobby();
});

document.getElementById('room-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
