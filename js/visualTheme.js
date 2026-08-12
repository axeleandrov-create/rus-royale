/* visualTheme.js — токены визуала CR-like для «Русь Рояль» (браузер) */
'use strict';

const VisualTheme = (function () {
  const TEAM = {
    me: { fill: 'rgba(33,150,243,0.12)', stroke: 'rgba(100,181,246,0.7)', armor: '#42a5f5' },
    ai: { fill: 'rgba(229,57,53,0.12)', stroke: 'rgba(239,154,154,0.7)', armor: '#ef5350' }
  };

  const RARITY = {
    common: { hex: '#b0bec5', css: '#b0bec5' },
    rare: { hex: '#64b5f6', css: '#64b5f6' },
    epic: { hex: '#ce93d8', css: '#ce93d8' },
    legendary: { hex: '#ffd54f', css: '#ffd54f' },
    mythic: { hex: '#ff6e40', css: '#ff6e40' }
  };

  const ROLE = {
    tank: '#ff8a65',
    dps: '#81d4fa',
    ranged: '#aed581',
    air: '#80deea',
    support: '#f48fb1',
    splash: '#ffd54f',
    siege: '#bcaaa4',
    fast: '#fff176'
  };

  const MAGIC = {
    heal: { colors: ['#aed581', '#81c784', '#fff'], ring: '#66bb6a' },
    frost: { colors: ['#e1f5fe', '#81d4fa', '#4fc3f7'], ring: '#29b6f6' },
    fire: { colors: ['#fff59d', '#ffb74d', '#ff7043'], ring: '#ff6e40' },
    lightning: { colors: ['#fff', '#ffe082', '#ffd54f'], ring: '#ffee58' },
    dark: { colors: ['#ce93d8', '#7e57c2', '#311b92'], ring: '#7e57c2' },
    nature: { colors: ['#c5e1a5', '#8bc34a', '#558b2f'], ring: '#7cb342' },
    gold: { colors: ['#ffe082', '#ffd54f', '#fff'], ring: '#ffca28' }
  };

  /** true = гладкий Clash Royale Q-chibi; false = пиксель (по умолчанию) */
  let USE_SMOOTH_CHIBI = false;
  /** true = SNES / 16-bit: палитра Pixel16, nearest, без сглаживания */
  let USE_PIXEL_16 = false;

  const PARTICLE_CAP = { common: 14, rare: 18, epic: 22, legendary: 28, mythic: 32 };

  function rarityOf(def) {
    return (def && def.rarity) || 'common';
  }

  function schoolFor(def, hint) {
    if (hint && MAGIC[hint]) return hint;
    if (!def) return 'gold';
    if (def.heal || def.auraHeal || def.battlecry === 'healPulse') return 'heal';
    if (def.ult === 'frost' || /led|ice|мороз|студ/i.test(def.id || '') || /led|ice/i.test(def.artKey || '')) return 'frost';
    if (def.ult === 'thunder' || def.id === 'perun' || /гром|perun/i.test(def.id || '')) return 'lightning';
    if (def.faction === 'dark' || def.id === 'chernmag' || def.id === 'kostey') return 'dark';
    if (def.faction === 'forest' || def.faction === 'elf' || def.id === 'leshy') return 'nature';
    if (def.splash || def.ult === 'smash' || /mag|огон|zhar/i.test(def.id || '')) return 'fire';
    return 'gold';
  }

  return {
    TEAM, RARITY, ROLE, MAGIC, PARTICLE_CAP,
    get USE_SMOOTH_CHIBI() { return USE_SMOOTH_CHIBI; },
    set USE_SMOOTH_CHIBI(v) { USE_SMOOTH_CHIBI = !!v; },
    get USE_PIXEL_16() { return USE_PIXEL_16; },
    set USE_PIXEL_16(v) { USE_PIXEL_16 = !!v; },
    rarityOf, schoolFor
  };
})();

window.VisualTheme = VisualTheme;
