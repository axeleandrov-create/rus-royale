/* audio.js — SFX: файлы из assets/sfx/ + синтез-fallback (как Elixir/Unit events) */
'use strict';

const GameAudio = (function () {
  let ctx = null;
  let muted = false;
  let volume = 0.55;
  const cache = Object.create(null);
  const unlocked = { ok: false };

  /** Маппинг событий → файлы (положи .mp3/.wav в assets/sfx/) */
  const FILE_MAP = {
    spawn: ['spawn.mp3', 'spawn.wav', 'place.mp3'],
    attack_melee: ['attack_melee.mp3', 'slash.mp3', 'hit_melee.wav'],
    attack_ranged: ['attack_ranged.mp3', 'arrow.mp3', 'shoot.wav'],
    hit: ['hit.mp3', 'hit.wav', 'impact.mp3'],
    death: ['death.mp3', 'death.wav'],
    elixir_full: ['elixir.mp3', 'elixir_full.wav', 'mana.mp3'],
    tower_down: ['tower_down.mp3', 'tower.wav', 'explode.mp3'],
    tower_hit: ['tower_hit.mp3', 'stone.wav', 'hit.mp3'],
    spell: ['spell.mp3', 'magic.wav'],
    card_play: ['card.mp3', 'whoosh.wav'],
    win: ['win.mp3', 'victory.wav'],
    lose: ['lose.mp3', 'defeat.wav'],
    tap: ['tap.mp3', 'ui.wav'],
    deny: ['deny.mp3', 'error.wav']
  };

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    unlocked.ok = true;
    return ctx;
  }

  function resume() {
    try { ensureCtx(); } catch (_) {}
  }

  function setMuted(v) { muted = !!v; }
  function isMuted() { return muted; }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); }

  function tryLoad(name) {
    if (cache[name]) return cache[name];
    const a = new Audio('assets/sfx/' + name);
    a.preload = 'auto';
    cache[name] = a;
    a.addEventListener('error', () => { cache[name] = null; });
    return a;
  }

  function playFile(list) {
    for (const name of list) {
      const a = tryLoad(name);
      if (!a) continue;
      try {
        const c = a.cloneNode();
        c.volume = volume;
        const p = c.play();
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch (_) {}
    }
    return false;
  }

  function tone(f, d, type, vol, f2) {
    try {
      const ac = ensureCtx();
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      const fl = ac.createBiquadFilter();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + d);
      fl.type = 'lowpass';
      fl.frequency.value = 1800;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime((vol || 0.2) * volume, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(fl).connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    } catch (_) {}
  }

  function noiseBurst(d, vol, fLo, fHi) {
    try {
      const ac = ensureCtx();
      const t = ac.currentTime;
      const n = ac.createBufferSource();
      const buf = ac.createBuffer(1, (ac.sampleRate * (d + 0.02)) | 0, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const fl = ac.createBiquadFilter();
      const g = ac.createGain();
      fl.type = 'bandpass';
      fl.frequency.value = (fLo + fHi) / 2;
      fl.Q.value = 0.7;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime((vol || 0.08) * volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      n.buffer = buf;
      n.connect(fl).connect(g).connect(ac.destination);
      n.start(t);
      n.stop(t + d + 0.02);
    } catch (_) {}
  }

  const SYNTH = {
    spawn() { tone(240, 0.07, 'triangle', 0.22, 180); tone(480, 0.05, 'sine', 0.1, 720); noiseBurst(0.04, 0.06, 400, 1200); },
    attack_melee() { tone(300, 0.06, 'sawtooth', 0.12, 140); noiseBurst(0.04, 0.07, 200, 900); },
    attack_ranged() { tone(160, 0.1, 'sine', 0.18, 90); noiseBurst(0.05, 0.05, 200, 800); },
    hit() { tone(280, 0.05, 'triangle', 0.14, 160); noiseBurst(0.03, 0.05, 300, 900); },
    death() { tone(200, 0.18, 'triangle', 0.12, 80); noiseBurst(0.1, 0.06, 100, 400); },
    elixir_full() { tone(660, 0.08, 'sine', 0.12); tone(880, 0.1, 'sine', 0.1); },
    tower_down() { tone(360, 0.3, 'sine', 0.26, 160); noiseBurst(0.18, 0.1, 80, 400); setTimeout(() => tone(520, 0.22, 'sine', 0.2, 780), 90); },
    tower_hit() { tone(220, 0.05, 'triangle', 0.1, 140); noiseBurst(0.04, 0.05, 120, 500); },
    spell() { tone(480, 0.1, 'sine', 0.14, 720); tone(720, 0.12, 'triangle', 0.08, 400); },
    card_play() { tone(300, 0.06, 'triangle', 0.1, 420); noiseBurst(0.03, 0.04, 400, 1400); },
    win() { tone(523, 0.12, 'sine', 0.24); setTimeout(() => tone(659, 0.12, 'sine', 0.24), 110); setTimeout(() => tone(784, 0.28, 'sine', 0.26), 220); },
    lose() { tone(380, 0.35, 'sine', 0.2, 140); setTimeout(() => tone(220, 0.4, 'triangle', 0.14, 110), 120); },
    tap() { tone(340, 0.045, 'triangle', 0.12, 300); },
    deny() { tone(170, 0.09, 'triangle', 0.09, 95); }
  };

  function play(event) {
    if (muted) return;
    const list = FILE_MAP[event] || [];
    if (list.length && playFile(list)) return;
    const fn = SYNTH[event];
    if (fn) fn();
  }

  // разблокировка на первом жесте
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, () => resume(), { once: true, passive: true });
  });

  return { play, resume, setMuted, isMuted, setVolume, FILE_MAP };
})();

window.GameAudio = GameAudio;
