const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// DATA
// ============================================
const rooms = new Map();
const playerSockets = new Map(); // socketId -> { roomId, playerId }
const TURN_TIME = 30; // seconds per turn
const NEXT_HAND_DELAY = 5000; // 5s delay between hands

// ============================================
// POKER UTILS
// ============================================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Hand evaluation using pokersolver
const Hand = require('pokersolver').Hand;

function cardToSolverFormat(card) {
  const rankMap = { '10': 'T' };
  const suitMap = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
  const r = rankMap[card.rank] || card.rank;
  const s = suitMap[card.suit];
  return r + s;
}

function evaluateHands(players, communityCards) {
  const results = [];
  for (const p of players) {
    if (p.folded) continue;
    const allCards = [...p.hand, ...communityCards].map(cardToSolverFormat);
    const solved = Hand.solve(allCards);
    results.push({ playerId: p.id, hand: solved, name: solved.name });
  }
  return results;
}

function determineWinners(handResults) {
  if (handResults.length === 0) return [];
  const hands = handResults.map(r => r.hand);
  const winning = Hand.winners(hands);
  return handResults.filter(r => winning.includes(r.hand));
}

// ============================================
// ROOM MANAGEMENT
// ============================================
function clampChips(val) {
  const n = parseInt(val) || 1000;
  return Math.max(100, Math.min(10000, n));
}

function createRoom(roomId, hostId, hostName, chips, avatar) {
  const room = {
    id: roomId,
    hostId,
    players: [{
      id: hostId,
      name: hostName,
      chips: clampChips(chips),
      avatar: avatar || '😎',
      ready: false,
      connected: true
    }],
    game: null,
    status: 'waiting' // waiting | playing
  };
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function addPlayer(room, playerId, playerName, chips, avatar) {
  if (room.players.length >= 9) return null;
  if (room.players.find(p => p.id === playerId)) return null;
  const player = {
    id: playerId,
    name: playerName,
    chips: clampChips(chips),
    avatar: avatar || '😎',
    ready: false,
    connected: true
  };
  room.players.push(player);
  return player;
}

function removePlayer(room, playerId) {
  room.players = room.players.filter(p => p.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(room.id);
    return null;
  }
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }
  return room;
}

// ============================================
// GAME LOGIC
// ============================================
function startGame(room) {
  if (room.players.length < 2) return false;

  const activePlayers = room.players.filter(p => p.connected);
  if (activePlayers.length < 2) return false;

  const prevGame = room.game;
  const dealerIndex = prevGame
    ? (prevGame.dealerIndex + 1) % activePlayers.length
    : 0;

  const deck = createDeck();

  // Deal 2 cards to each player
  const gamePlayers = activePlayers.map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    chips: p.chips,
    hand: [deck.pop(), deck.pop()],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    acted: false
  }));

  const numPlayers = gamePlayers.length;
  const sbIndex = numPlayers === 2 ? dealerIndex : (dealerIndex + 1) % numPlayers;
  const bbIndex = (sbIndex + 1) % numPlayers;

  const smallBlind = 10;
  const bigBlind = 20;

  // Post blinds
  const sbAmount = Math.min(smallBlind, gamePlayers[sbIndex].chips);
  gamePlayers[sbIndex].chips -= sbAmount;
  gamePlayers[sbIndex].bet = sbAmount;
  gamePlayers[sbIndex].totalBet = sbAmount;

  const bbAmount = Math.min(bigBlind, gamePlayers[bbIndex].chips);
  gamePlayers[bbIndex].chips -= bbAmount;
  gamePlayers[bbIndex].bet = bbAmount;
  gamePlayers[bbIndex].totalBet = bbAmount;

  if (gamePlayers[sbIndex].chips === 0) gamePlayers[sbIndex].allIn = true;
  if (gamePlayers[bbIndex].chips === 0) gamePlayers[bbIndex].allIn = true;

  const firstToAct = (bbIndex + 1) % numPlayers;

  room.game = {
    deck,
    players: gamePlayers,
    communityCards: [],
    pot: sbAmount + bbAmount,
    sidePots: [],
    stage: 'preflop',
    dealerIndex,
    smallBlindIndex: sbIndex,
    bigBlindIndex: bbIndex,
    currentTurn: firstToAct,
    currentBet: bigBlind,
    minRaise: bigBlind,
    lastRaiser: bbIndex,
    smallBlindAmount: smallBlind,
    bigBlindAmount: bigBlind
  };

  room.status = 'playing';
  startTurnTimer(room);
  return true;
}

// ============================================
// TURN TIMER
// ============================================
function startTurnTimer(room) {
  clearTurnTimer(room);
  const game = room.game;
  if (!game || game.stage === 'showdown' || game.stage === 'finished') return;

  game.turnDeadline = Date.now() + TURN_TIME * 1000;

  room._turnTimer = setTimeout(() => {
    if (!room.game || room.game !== game) return;
    const currentPlayer = game.players[game.currentTurn];
    if (!currentPlayer || currentPlayer.folded || currentPlayer.allIn) return;

    // Auto fold
    const result = handleAction(room, currentPlayer.id, 'fold');

    // Broadcast updated state
    for (const p of game.players) {
      io.to(p.id).emit('gameUpdate', getGameStateForPlayer(room, p.id));
    }

    if (result.finished) {
      io.to(room.id).emit('roomUpdate', getRoomState(room));
      io.to(room.id).emit('handFinished', result.result);
    }

    console.log(`[Timer] Auto-fold ${currentPlayer.name} in room ${room.id}`);
  }, TURN_TIME * 1000);
}

function clearTurnTimer(room) {
  if (room._turnTimer) {
    clearTimeout(room._turnTimer);
    room._turnTimer = null;
  }
}

function getNextActivePlayer(game, fromIndex) {
  const n = game.players.length;
  let idx = (fromIndex + 1) % n;
  let count = 0;
  while (count < n) {
    const p = game.players[idx];
    if (!p.folded && !p.allIn) return idx;
    idx = (idx + 1) % n;
    count++;
  }
  return -1;
}

function countActivePlayers(game) {
  return game.players.filter(p => !p.folded).length;
}

function countPlayersCanAct(game) {
  return game.players.filter(p => !p.folded && !p.allIn).length;
}

function handleAction(room, playerId, action, amount = 0) {
  const game = room.game;
  if (!game) return { error: 'No game in progress' };

  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { error: 'Player not in game' };
  if (playerIndex !== game.currentTurn) return { error: 'Not your turn' };

  const player = game.players[playerIndex];
  if (player.folded || player.allIn) return { error: 'Cannot act' };

  switch (action) {
    case 'fold':
      player.folded = true;
      player.acted = true;
      break;

    case 'check':
      if (player.bet < game.currentBet) return { error: 'Cannot check, must call or raise' };
      player.acted = true;
      break;

    case 'call': {
      const callAmount = Math.min(game.currentBet - player.bet, player.chips);
      player.chips -= callAmount;
      player.bet += callAmount;
      player.totalBet += callAmount;
      game.pot += callAmount;
      if (player.chips === 0) player.allIn = true;
      player.acted = true;
      break;
    }

    case 'raise': {
      const raiseTo = amount;
      if (raiseTo < game.currentBet + game.minRaise && raiseTo < player.chips + player.bet) {
        return { error: `Min raise to ${game.currentBet + game.minRaise}` };
      }
      const raiseAmount = Math.min(raiseTo - player.bet, player.chips);
      const actualRaiseTo = player.bet + raiseAmount;
      game.minRaise = actualRaiseTo - game.currentBet;
      game.currentBet = actualRaiseTo;
      player.chips -= raiseAmount;
      player.bet += raiseAmount;
      player.totalBet += raiseAmount;
      game.pot += raiseAmount;
      if (player.chips === 0) player.allIn = true;
      game.lastRaiser = playerIndex;
      // Reset acted for other players
      game.players.forEach((p, i) => {
        if (i !== playerIndex && !p.folded && !p.allIn) p.acted = false;
      });
      player.acted = true;
      break;
    }

    case 'allin': {
      const allInAmount = player.chips;
      const newBet = player.bet + allInAmount;
      if (newBet > game.currentBet) {
        const raise = newBet - game.currentBet;
        if (raise >= game.minRaise) {
          game.minRaise = raise;
        }
        game.currentBet = newBet;
        game.lastRaiser = playerIndex;
        game.players.forEach((p, i) => {
          if (i !== playerIndex && !p.folded && !p.allIn) p.acted = false;
        });
      }
      player.chips -= allInAmount;
      player.bet += allInAmount;
      player.totalBet += allInAmount;
      game.pot += allInAmount;
      player.allIn = true;
      player.acted = true;
      break;
    }

    default:
      return { error: 'Unknown action' };
  }

  // Check if only 1 player remains
  if (countActivePlayers(game) === 1) {
    clearTurnTimer(room);
    return finishHand(room);
  }

  // Check if round is over
  const allActed = game.players.every(p => p.folded || p.allIn || p.acted);
  if (allActed || countPlayersCanAct(game) === 0) {
    return advanceStage(room);
  }

  // Next player
  game.currentTurn = getNextActivePlayer(game, playerIndex);
  startTurnTimer(room);
  return { success: true };
}

function advanceStage(room) {
  const game = room.game;

  // Calculate side pots before advancing
  calculateSidePots(game);

  // Reset bets for new round
  game.players.forEach(p => {
    p.bet = 0;
    p.acted = false;
  });
  game.currentBet = 0;
  game.minRaise = game.bigBlindAmount;

  const stages = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIdx = stages.indexOf(game.stage);

  if (currentIdx >= 3) {
    // After river -> showdown
    return showdown(room);
  }

  game.stage = stages[currentIdx + 1];

  switch (game.stage) {
    case 'flop':
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
      break;
    case 'turn':
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop());
      break;
    case 'river':
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop());
      break;
  }

  // If all players are all-in or folded, skip to showdown
  if (countPlayersCanAct(game) <= 1) {
    // Deal remaining community cards
    while (game.communityCards.length < 5) {
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop());
    }
    game.stage = 'showdown';
    clearTurnTimer(room);
    return showdown(room);
  }

  // First to act after flop is first active player after dealer
  const n = game.players.length;
  let first = (game.dealerIndex + 1) % n;
  let count = 0;
  while (count < n) {
    if (!game.players[first].folded && !game.players[first].allIn) break;
    first = (first + 1) % n;
    count++;
  }
  game.currentTurn = first;

  startTurnTimer(room);
  return { success: true, stage: game.stage };
}

function calculateSidePots(game) {
  const activePlayers = game.players.filter(p => !p.folded);
  const allInPlayers = activePlayers.filter(p => p.allIn).sort((a, b) => a.totalBet - b.totalBet);

  if (allInPlayers.length === 0) return;

  let processed = 0;
  const pots = [];

  for (const allInPlayer of allInPlayers) {
    const level = allInPlayer.totalBet;
    if (level <= processed) continue;

    let potAmount = 0;
    const eligible = [];

    for (const p of game.players) {
      const contribution = Math.min(p.totalBet, level) - Math.min(p.totalBet, processed);
      if (contribution > 0) potAmount += contribution;
      if (!p.folded && p.totalBet >= level) eligible.push(p.id);
    }

    if (potAmount > 0) {
      pots.push({ amount: potAmount, eligible });
    }
    processed = level;
  }

  // Main pot for remaining bets
  let mainPot = 0;
  const mainEligible = [];
  for (const p of game.players) {
    const contribution = Math.max(0, p.totalBet - processed);
    if (contribution > 0) mainPot += contribution;
    if (!p.folded && p.totalBet > processed) mainEligible.push(p.id);
  }
  if (mainPot > 0) {
    pots.push({ amount: mainPot, eligible: mainEligible });
  }

  if (pots.length > 0) {
    game.sidePots = pots;
    game.pot = pots.reduce((s, p) => s + p.amount, 0);
  }
}

function finishHand(room) {
  const game = room.game;
  const winner = game.players.find(p => !p.folded);

  // Transfer pot
  const roomPlayer = room.players.find(p => p.id === winner.id);
  if (roomPlayer) roomPlayer.chips += game.pot;
  winner.chips += game.pot;

  const result = {
    winners: [{ playerId: winner.id, name: winner.name, amount: game.pot }],
    reason: 'others_folded'
  };

  game.stage = 'finished';
  game.result = result;
  room.status = 'waiting';
  syncChips(room);
  prepareNextHand(room);

  return { success: true, finished: true, result };
}

function showdown(room) {
  const game = room.game;
  game.stage = 'showdown';

  const handResults = evaluateHands(game.players, game.communityCards);
  const result = { winners: [], hands: {} };

  // Store all hands for display
  for (const hr of handResults) {
    result.hands[hr.playerId] = hr.name;
  }

  if (game.sidePots.length > 0) {
    // Distribute side pots
    for (const pot of game.sidePots) {
      const eligibleResults = handResults.filter(r => pot.eligible.includes(r.playerId));
      const winners = determineWinners(eligibleResults);
      const share = Math.floor(pot.amount / winners.length);
      for (const w of winners) {
        const gp = game.players.find(p => p.id === w.playerId);
        const rp = room.players.find(p => p.id === w.playerId);
        if (gp) gp.chips += share;
        if (rp) rp.chips += share;
        result.winners.push({ playerId: w.playerId, name: w.name, amount: share, hand: result.hands[w.playerId] });
      }
    }
  } else {
    // Simple pot distribution
    const winners = determineWinners(handResults);
    const share = Math.floor(game.pot / winners.length);
    for (const w of winners) {
      const gp = game.players.find(p => p.id === w.playerId);
      const rp = room.players.find(p => p.id === w.playerId);
      if (gp) gp.chips += share;
      if (rp) rp.chips += share;
      result.winners.push({ playerId: w.playerId, name: w.name, amount: share, hand: result.hands[w.playerId] });
    }
  }

  game.result = result;
  room.status = 'waiting';
  syncChips(room);
  prepareNextHand(room);

  return { success: true, finished: true, result };
}

function prepareNextHand(room) {
  // Remove busted players (0 chips)
  room.players = room.players.filter(p => p.chips > 0);

  // Reset ready for all players
  room.players.forEach(p => p.ready = false);

  room.status = 'waiting_next';

  io.to(room.id).emit('roomUpdate', getRoomState(room));
  broadcastRoomList();
}

function checkAllReadyAndStart(room) {
  if (room.status !== 'waiting_next') return;

  const allReady = room.players.every(p => p.ready);
  if (!allReady) return;

  // Not enough players - go back to lobby
  if (room.players.length < 2) {
    room.status = 'waiting';
    room.game = null;
    room.players.forEach(p => p.ready = false);
    io.to(room.id).emit('roomUpdate', getRoomState(room));
    io.to(room.id).emit('backToLobby');
    broadcastRoomList();
    return;
  }

  if (!startGame(room)) return;

  io.to(room.id).emit('roomUpdate', getRoomState(room));
  for (const p of room.game.players) {
    io.to(p.id).emit('gameUpdate', getGameStateForPlayer(room, p.id));
  }
  console.log(`[Game] All ready - started next hand in room ${room.id}`);
}

function syncChips(room) {
  const game = room.game;
  if (!game) return;
  for (const gp of game.players) {
    const rp = room.players.find(p => p.id === gp.id);
    if (rp) rp.chips = gp.chips;
  }
  // Remove busted players
  room.players.forEach(p => {
    if (p.chips <= 0) p.chips = 0;
  });
}

// ============================================
// GAME STATE FOR CLIENT
// ============================================
function getGameStateForPlayer(room, playerId) {
  const game = room.game;
  if (!game) return null;

  return {
    stage: game.stage,
    communityCards: game.communityCards,
    pot: game.pot,
    sidePots: game.sidePots,
    currentBet: game.currentBet,
    currentTurn: game.currentTurn,
    dealerIndex: game.dealerIndex,
    smallBlindIndex: game.smallBlindIndex,
    bigBlindIndex: game.bigBlindIndex,
    minRaise: game.minRaise,
    turnTime: TURN_TIME,
    turnDeadline: game.turnDeadline || null,
    result: game.result || null,
    players: game.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      hand: (p.id === playerId || game.stage === 'showdown' || game.stage === 'finished')
        ? p.hand
        : null,
      isDealer: i === game.dealerIndex,
      isSB: i === game.smallBlindIndex,
      isBB: i === game.bigBlindIndex,
      isCurrent: i === game.currentTurn
    }))
  };
}

function getRoomState(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      avatar: p.avatar,
      ready: p.ready,
      connected: p.connected
    }))
  };
}

// ============================================
// ROOM LIST
// ============================================
function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({
      id,
      hostName: room.players.find(p => p.id === room.hostId)?.name || '???',
      playerCount: room.players.length,
      maxPlayers: 9,
      status: room.status
    });
  }
  return list;
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

// ============================================
// SOCKET.IO
// ============================================
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // Send room list on connect
  socket.emit('roomList', getRoomList());

  // Create room
  socket.on('createRoom', ({ playerName, chips, avatar }, callback) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerId = socket.id;
    const room = createRoom(roomId, playerId, playerName, chips, avatar);
    playerSockets.set(socket.id, { roomId, playerId });
    socket.join(roomId);
    callback({ success: true, roomId, playerId });
    io.to(roomId).emit('roomUpdate', getRoomState(room));
    broadcastRoomList();
    console.log(`[Room] ${playerName} created room ${roomId}`);
  });

  // Join room
  socket.on('joinRoom', ({ roomId, playerName, chips, avatar }, callback) => {
    const room = getRoom(roomId);
    if (!room) return callback({ error: 'Room not found' });
    if (room.status === 'playing') return callback({ error: 'Game in progress' });

    const playerId = socket.id;
    const player = addPlayer(room, playerId, playerName, chips, avatar);
    if (!player) return callback({ error: 'Room is full or already joined' });

    playerSockets.set(socket.id, { roomId, playerId });
    socket.join(roomId);
    callback({ success: true, roomId, playerId });
    io.to(roomId).emit('roomUpdate', getRoomState(room));
    broadcastRoomList();
    console.log(`[Room] ${playerName} joined room ${roomId}`);
  });

  // Toggle ready
  socket.on('toggleReady', () => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const room = getRoom(info.roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === info.playerId);
    if (player) {
      player.ready = !player.ready;
      io.to(room.id).emit('roomUpdate', getRoomState(room));

      // Auto start if all ready between hands
      if (room.status === 'waiting_next') {
        checkAllReadyAndStart(room);
      }
    }
  });

  // Start game
  socket.on('startGame', (_, callback) => {
    const info = playerSockets.get(socket.id);
    if (!info) return callback?.({ error: 'Not in a room' });
    const room = getRoom(info.roomId);
    if (!room) return callback?.({ error: 'Room not found' });
    if (room.hostId !== info.playerId) return callback?.({ error: 'Only host can start' });

    const allReady = room.players.every(p => p.ready || p.id === room.hostId);
    if (!allReady) return callback?.({ error: 'Not all players are ready' });
    if (room.players.length < 2) return callback?.({ error: 'Need at least 2 players' });

    if (!startGame(room)) return callback?.({ error: 'Cannot start game' });

    callback?.({ success: true });
    io.to(room.id).emit('roomUpdate', getRoomState(room));

    // Send game state to each player
    for (const p of room.game.players) {
      const sid = p.id; // socketId is playerId
      io.to(sid).emit('gameUpdate', getGameStateForPlayer(room, p.id));
    }
    console.log(`[Game] Started in room ${room.id}`);
  });

  // Player action
  socket.on('action', ({ action, amount }, callback) => {
    const info = playerSockets.get(socket.id);
    if (!info) return callback?.({ error: 'Not in a room' });
    const room = getRoom(info.roomId);
    if (!room || !room.game) return callback?.({ error: 'No game' });

    const result = handleAction(room, info.playerId, action, amount);
    if (result.error) return callback?.({ error: result.error });

    callback?.({ success: true });

    // Send updated state to all players
    for (const p of room.game.players) {
      io.to(p.id).emit('gameUpdate', getGameStateForPlayer(room, p.id));
    }

    if (result.finished) {
      io.to(room.id).emit('roomUpdate', getRoomState(room));
      io.to(room.id).emit('handFinished', result.result);
    }
  });

  // Leave room
  socket.on('leaveRoom', () => {
    handleDisconnect(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Disconnect] ${socket.id}`);
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket) {
  const info = playerSockets.get(socket.id);
  if (!info) return;

  const room = getRoom(info.roomId);
  if (!room) return;

  if (room.status === 'playing' && room.game) {
    // Auto fold in current game
    const gp = room.game.players.find(p => p.id === info.playerId);
    if (gp && !gp.folded) {
      gp.folded = true;

      // If it was their turn, advance
      if (game_isPlayerTurn(room.game, info.playerId)) {
        const result = handleAction_afterFold(room);
        for (const p of room.game.players) {
          io.to(p.id).emit('gameUpdate', getGameStateForPlayer(room, p.id));
        }
        if (result && result.finished) {
          io.to(room.id).emit('roomUpdate', getRoomState(room));
          io.to(room.id).emit('handFinished', result.result);
        }
      } else {
        // Not their turn, just update state
        for (const p of room.game.players) {
          io.to(p.id).emit('gameUpdate', getGameStateForPlayer(room, p.id));
        }
      }
    }
  }

  // Always remove player from room
  removePlayer(room, info.playerId);

  socket.leave(info.roomId);
  playerSockets.delete(socket.id);

  if (rooms.has(info.roomId)) {
    io.to(info.roomId).emit('roomUpdate', getRoomState(room));
  }
  broadcastRoomList();
  console.log(`[Disconnect] ${info.playerId} removed from room ${info.roomId}`);
}

function handleAction_afterFold(room) {
  const game = room.game;
  if (!game) return null;

  // Check if only 1 player remains
  if (countActivePlayers(game) === 1) {
    clearTurnTimer(room);
    return finishHand(room);
  }

  // If current player folded, move to next
  const current = game.players[game.currentTurn];
  if (current && current.folded) {
    const next = getNextActivePlayer(game, game.currentTurn);
    if (next === -1) {
      return advanceStage(room);
    }
    game.currentTurn = next;
    startTurnTimer(room);
  }

  // Check if round is over
  const allActed = game.players.every(p => p.folded || p.allIn || p.acted);
  if (allActed || countPlayersCanAct(game) === 0) {
    return advanceStage(room);
  }

  return { success: true };
}

function game_isPlayerTurn(game, playerId) {
  const idx = game.players.findIndex(p => p.id === playerId);
  return idx === game.currentTurn;
}

// ============================================
// START SERVER
// ============================================
const PORT = 3000;

function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIP();
  console.log(`\n🃏 Poker Server running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   LAN:     http://${ip}:${PORT}\n`);
});
