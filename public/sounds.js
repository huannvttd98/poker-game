// ============================================
// POKER SOUNDS - Web Audio API
// ============================================
const SFX = (() => {
  let ctx = null;
  let enabled = localStorage.getItem('pokerSfx') !== 'off';

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function play(fn) {
    if (!enabled) return;
    try { fn(getCtx()); } catch (e) { /* silent */ }
  }

  // --- Sound generators ---

  function chipStack(ac) {
    // Multiple short clicks = chip stacking
    for (let i = 0; i < 3; i++) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = 1800 + i * 400;
      gain.gain.setValueAtTime(0.08, ac.currentTime + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.06 + 0.05);
      osc.start(ac.currentTime + i * 0.06);
      osc.stop(ac.currentTime + i * 0.06 + 0.05);
    }
  }

  function cardDeal(ac) {
    // Short swoosh
    const bufferSize = ac.sampleRate * 0.08;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.3;
    }
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start();
  }

  function yourTurn(ac) {
    // Two-tone notification
    [660, 880].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ac.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.12 + 0.12);
      osc.start(ac.currentTime + i * 0.12);
      osc.stop(ac.currentTime + i * 0.12 + 0.15);
    });
  }

  function check(ac) {
    // Soft tap
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    osc.start();
    osc.stop(ac.currentTime + 0.1);
  }

  function callBet(ac) {
    chipStack(ac);
  }

  function raise(ac) {
    // Rising tone + chips
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(800, ac.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    osc.start();
    osc.stop(ac.currentTime + 0.15);
    setTimeout(() => play(chipStack), 100);
  }

  function fold(ac) {
    // Soft descending
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(250, ac.currentTime + 0.15);
    gain.gain.setValueAtTime(0.07, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    osc.start();
    osc.stop(ac.currentTime + 0.2);
  }

  function allIn(ac) {
    // Dramatic rising sweep + chips
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ac.currentTime);
    gain.gain.setValueAtTime(0.1, ac.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
    osc.start();
    osc.stop(ac.currentTime + 0.35);
    // Chip cascade
    for (let i = 0; i < 5; i++) {
      setTimeout(() => play(ac2 => {
        const o = ac2.createOscillator();
        const g = ac2.createGain();
        o.connect(g);
        g.connect(ac2.destination);
        o.type = 'square';
        o.frequency.value = 2000 + Math.random() * 1000;
        g.gain.setValueAtTime(0.05, ac2.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 0.04);
        o.start();
        o.stop(ac2.currentTime + 0.04);
      }), 200 + i * 50);
    }
  }

  function win(ac) {
    // Victory fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ac.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.1 + 0.25);
      osc.start(ac.currentTime + i * 0.1);
      osc.stop(ac.currentTime + i * 0.1 + 0.3);
    });
  }

  function gameWon(ac) {
    // Grand fanfare
    const melody = [523, 659, 784, 659, 784, 1047];
    melody.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  function chatMsg(ac) {
    // Soft pop
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    osc.start();
    osc.stop(ac.currentTime + 0.1);
  }

  function timerLow(ac, seconds) {
    // Countdown beep - pitch rises as time runs out
    const freqMap = { 5: 600, 4: 700, 3: 800, 2: 900, 1: 1100 };
    const volMap  = { 5: 0.05, 4: 0.06, 3: 0.07, 2: 0.08, 1: 0.10 };
    const freq = freqMap[seconds] || 880;
    const vol  = volMap[seconds] || 0.07;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.start();
    osc.stop(ac.currentTime + 0.15);
  }

  function communityCard(ac) {
    // Card flip whoosh
    const bufferSize = ac.sampleRate * 0.1;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin(Math.PI * i / bufferSize);
      data[i] = (Math.random() * 2 - 1) * env * 0.2;
    }
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, ac.currentTime);
    filter.frequency.linearRampToValueAtTime(4000, ac.currentTime + 0.1);
    filter.Q.value = 1;
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start();
  }

  function startHand(ac) {
    // Shuffle + deal
    for (let i = 0; i < 4; i++) {
      setTimeout(() => play(cardDeal), i * 80);
    }
  }

  // --- Public API ---
  return {
    chipStack:     () => play(chipStack),
    cardDeal:      () => play(cardDeal),
    yourTurn:      () => play(yourTurn),
    check:         () => play(check),
    call:          () => play(callBet),
    raise:         () => play(raise),
    fold:          () => play(fold),
    allIn:         () => play(allIn),
    win:           () => play(win),
    gameWon:       () => play(gameWon),
    chatMsg:       () => play(chatMsg),
    timerLow:      (s) => play((ac) => timerLow(ac, s)),
    communityCard: () => play(communityCard),
    startHand:     () => play(startHand),

    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      localStorage.setItem('pokerSfx', enabled ? 'on' : 'off');
      return enabled;
    }
  };
})();
