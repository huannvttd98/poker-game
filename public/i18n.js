// ============================================
// i18n - Internationalization
// ============================================
const LANGS = {
  vi: {
    // Profile
    title: 'Poker LAN',
    enterName: 'Ten cua ban',
    enterLobby: 'Vao sanh',
    // Lobby
    editProfile: 'Sua',
    roomNameOpt: 'Ten phong (tuy chon)',
    roomSettings: 'Cai dat phong',
    startingChips: 'Chips ban dau',
    blinds: 'Small / Big Blind',
    maxPlayers: 'So nguoi choi toi da',
    turnTime: 'Thoi gian moi luot (giay)',

    createRoom: 'Tao phong',
    roomCode: 'Ma phong',
    join: 'Vao',
    availableRooms: 'Phong dang mo',
    noRooms: 'Chua co phong nao',
    watch: 'Xem',
    full: 'Day',
    // Room
    room: 'Phong',
    leave: 'Roi',
    ready: 'San sang',
    notReady: 'Huy san sang',
    startGame: 'Bat dau',
    kick: 'Kick',
    watching: 'Dang xem',
    disconnected: 'Mat ket noi',
    // Game sidebar
    exit: 'Thoat',
    chat: 'Chat',
    rank: 'Xep hang',
    rules: 'Luat choi',
    log: 'Nhat ky',
    chatPlaceholder: 'Nhan tin...',
    send: 'Gui',
    // Game
    pot: 'Pot',
    bet: 'Cuoc',
    // Actions
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    raise: 'Raise',
    allIn: 'All-In',
    // Result
    winner: 'Nguoi thang!',
    showdown: 'Showdown!',
    othersFolded: 'Doi thu bo bai',
    communityCards: 'Bai chung',
    // Ready countdown
    autoStartIn: 'Tu dong bat dau sau {s}s',
    readyCount: '{n}/{t} san sang',
    joinReady: 'Tham gia & San sang',
    waiting: 'Dang cho...',
    eliminated: 'Da bi loai',
    // Spectator
    spectating: 'Dang xem',
    joinNextHand: 'Tham gia van sau',
    // Rank
    noPlayers: 'Chua co nguoi choi',
    toWin: 'de thang',
    // Game won
    youWin: 'Ban da thang!',
    playerWins: '{name} thang cuoc!',
    backToRoom: 'Tro ve phong sau vai giay...',
    // Modal
    ok: 'OK',
    confirm: 'Dong y',
    cancel: 'Huy',
    // Errors / messages
    enterYourName: 'Nhap ten cua ban',
    enterRoomCode: 'Nhap ma phong',
    exitConfirm: 'Thoat khoi ban? Ban se mat het chips da dat.',
    kickConfirm: 'Kick {name} khoi phong?',
    kicked: 'Ban da bi chu phong kick!',
    // Rules
    rulesTitle: 'Texas Hold\'em',
    rulesDesc: 'Moi nguoi duoc chia <b>2 la bai rieng</b>, ket hop voi <b>5 la bai chung</b> de tao <b>to hop 5 la manh nhat</b>.',
    rulesSequence: 'Trinh tu',
    rulesActions: 'Hanh dong',
    rulesCheckDesc: 'Bo luot',
    rulesCallDesc: 'Goi theo',
    rulesRaiseDesc: 'Tang cuoc',
    rulesFoldDesc: 'Bo bai',
    rulesAllInDesc: 'Tat tay',
    rulesHandRanks: 'Xep hang tay bai',
    rank1d: 'Sanh cao nhat cung chat',
    rank2d: 'Sanh cung chat',
    rank3d: 'Tu quy',
    rank4d: 'Ba + Doi',
    rank5d: '5 la cung chat',
    rank6d: 'Sanh (5 la lien tiep)',
    rank7d: 'Sam co',
    rank8d: 'Hai doi',
    rank9d: 'Mot doi',
    rank10d: 'La cao nhat',
    // Misc
    chips: 'chips',
    host: 'Host',
    playing: 'dang choi',
  },
  en: {
    title: 'Poker LAN',
    enterName: 'Your name',
    enterLobby: 'Enter Lobby',
    editProfile: 'Edit',
    roomNameOpt: 'Room name (optional)',
    roomSettings: 'Room Settings',
    startingChips: 'Starting chips',
    blinds: 'Small / Big Blind',
    maxPlayers: 'Max players',
    turnTime: 'Turn time (seconds)',

    createRoom: 'Create Room',
    roomCode: 'Room code',
    join: 'Join',
    availableRooms: 'Available Rooms',
    noRooms: 'No rooms available',
    watch: 'Watch',
    full: 'Full',
    room: 'Room',
    leave: 'Leave',
    ready: 'Ready',
    notReady: 'Not Ready',
    startGame: 'Start Game',
    kick: 'Kick',
    watching: 'Watching',
    disconnected: 'Disconnected',
    exit: 'Exit',
    chat: 'Chat',
    rank: 'Rank',
    rules: 'Rules',
    log: 'Log',
    chatPlaceholder: 'Type a message...',
    send: 'Send',
    pot: 'Pot',
    bet: 'Bet',
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    raise: 'Raise',
    allIn: 'All-In',
    winner: 'Winner!',
    showdown: 'Showdown!',
    othersFolded: 'Others folded',
    communityCards: 'Community Cards',
    autoStartIn: 'Auto start in {s}s',
    readyCount: '{n}/{t} ready',
    joinReady: 'Join & Ready',
    waiting: 'Waiting...',
    eliminated: 'Eliminated',
    spectating: 'Spectating',
    joinNextHand: 'Join next hand',
    noPlayers: 'No players yet',
    toWin: 'to win',
    youWin: 'You win!',
    playerWins: '{name} wins!',
    backToRoom: 'Back to room in a few seconds...',
    ok: 'OK',
    confirm: 'Confirm',
    cancel: 'Cancel',
    enterYourName: 'Please enter your name',
    enterRoomCode: 'Enter room code',
    exitConfirm: 'Leave the table? You will lose all your chips.',
    kickConfirm: 'Kick {name} from room?',
    kicked: 'You have been kicked by the host!',
    rulesTitle: 'Texas Hold\'em',
    rulesDesc: 'Each player is dealt <b>2 private cards</b>, combined with <b>5 community cards</b> to make the <b>best 5-card hand</b>.',
    rulesSequence: 'Sequence',
    rulesActions: 'Actions',
    rulesCheckDesc: 'Skip turn',
    rulesCallDesc: 'Match bet',
    rulesRaiseDesc: 'Increase bet',
    rulesFoldDesc: 'Give up hand',
    rulesAllInDesc: 'Bet everything',
    rulesHandRanks: 'Hand Rankings',
    rank1d: 'Highest straight, same suit',
    rank2d: 'Straight, same suit',
    rank3d: 'Four of same rank',
    rank4d: 'Three + Pair',
    rank5d: '5 cards same suit',
    rank6d: '5 consecutive cards',
    rank7d: 'Three of same rank',
    rank8d: 'Two pairs',
    rank9d: 'One pair',
    rank10d: 'Highest card',
    chips: 'chips',
    host: 'Host',
    playing: 'playing',
  }
};

let currentLang = localStorage.getItem('pokerLang') || 'vi';

function t(key, params) {
  let str = LANGS[currentLang]?.[key] || LANGS['vi']?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

function setLang(lang) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  localStorage.setItem('pokerLang', lang);
  document.documentElement.lang = lang;
  applyI18n();
}

function applyI18n() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.innerHTML = val;
    }
  });

  // Sync lang select
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = currentLang;
}
